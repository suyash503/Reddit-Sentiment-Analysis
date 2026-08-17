// Tests for the serverless proxy. This is where all the deployment pain lived,
// so the route order and the fallbacks are worth pinning down.
//
// src/lib/reddit.js isn't covered here on purpose: it reads import.meta.env to
// decide its routes, which only exists under Vite, so plain node can't import it.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadHandler, fakeRes, listingOf, post, reply, stubFetch } from './helpers.js'

const ENV_KEYS = ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'SCRAPECREATORS_API_KEY']
let fetchStub = null

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
})

afterEach(() => {
  fetchStub?.restore()
  fetchStub = null
})

function stub(handler) {
  fetchStub = stubFetch(handler)
  return fetchStub
}

async function call(query) {
  const impl = await loadHandler()
  const res = fakeRes()
  await impl({ query }, res)
  return res
}

test('a bad subreddit name is rejected without calling anything', async () => {
  const { calls } = stub(() => reply.json({}))
  const res = await call({ subreddit: 'not a real name!' })

  assert.equal(res.statusCode, 400)
  assert.equal(calls.length, 0)
})

test('a missing subreddit name is rejected too', async () => {
  stub(() => reply.json({}))
  assert.equal((await call({})).statusCode, 400)
})

test('the public endpoint is used when Reddit answers', async () => {
  const { calls } = stub(() => reply.json(listingOf([post(1)])))
  const res = await call({ subreddit: 'javascript' })

  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['X-Fetched-Via'], 'public')
  assert.equal(res.body.kind, 'Listing')
  assert.ok(calls[0].url.startsWith('https://www.reddit.com/r/javascript/hot.json'))
  assert.match(calls[0].options.headers['User-Agent'], /by \/u\//)
})

test('an HTML block page falls through to the next route', async () => {
  const { calls } = stub((url) =>
    // startsWith, not includes: the relay URL carries the reddit URL inside its
    // query string, so `includes` would match the relay too.
    url.startsWith('https://www.reddit.com') ? reply.blocked() : reply.json(listingOf([post(1)])),
  )
  const res = await call({ subreddit: 'javascript' })

  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['X-Fetched-Via'], 'allorigins')
  assert.ok(calls.length > 1)
})

test('a private subreddit is passed through, not retried', async () => {
  const { calls } = stub(() => reply.json({ reason: 'private' }, 403))
  const res = await call({ subreddit: 'lounge' })

  assert.equal(res.statusCode, 403)
  assert.equal(res.body.reason, 'private')
  assert.equal(calls.length, 1) // asking a relay the same question is pointless
})

test('everything failing returns 502 and says what was tried', async () => {
  stub(() => reply.blocked())
  const res = await call({ subreddit: 'javascript' })

  assert.equal(res.statusCode, 502)
  assert.ok(Array.isArray(res.body.tried))
  assert.equal(res.body.tried.length, 3) // public + two relays
  assert.ok(res.body.hint.includes('SCRAPECREATORS_API_KEY'))
})

test('responses are cached at the edge, failures are not', async () => {
  stub(() => reply.json(listingOf([post(1)])))
  assert.ok((await call({ subreddit: 'javascript' })).headers['Cache-Control'])

  fetchStub.restore()
  stub(() => reply.blocked())
  assert.equal((await call({ subreddit: 'javascript' })).headers['Cache-Control'], undefined)
})

// --- the official API -------------------------------------------------------

test('with credentials, OAuth is tried before anything else', async () => {
  process.env.REDDIT_CLIENT_ID = 'id'
  process.env.REDDIT_CLIENT_SECRET = 'secret'

  const { calls } = stub((url) => {
    if (url.includes('access_token')) {
      return reply.json({ access_token: 'tok-123', expires_in: 3600 })
    }
    if (url.startsWith('https://oauth.reddit.com/')) {
      return reply.json(listingOf([post(1)]))
    }
    return reply.blocked()
  })

  const res = await call({ subreddit: 'javascript' })

  assert.equal(res.headers['X-Fetched-Via'], 'oauth')
  assert.equal(calls[0].options.method, 'POST') // token first
  assert.match(calls[0].options.headers.Authorization, /^Basic /)
  assert.equal(calls[1].options.headers.Authorization, 'Bearer tok-123')
  assert.ok(calls[1].url.startsWith('https://oauth.reddit.com/r/javascript/hot'))
})

test('a warm function reuses its token instead of asking again', async () => {
  process.env.REDDIT_CLIENT_ID = 'id'
  process.env.REDDIT_CLIENT_SECRET = 'secret'

  const { calls } = stub((url) =>
    url.includes('access_token')
      ? reply.json({ access_token: 'tok-123', expires_in: 3600 })
      : reply.json(listingOf([post(1)])),
  )

  const impl = await loadHandler()
  await impl({ query: { subreddit: 'javascript' } }, fakeRes())
  await impl({ query: { subreddit: 'aww' } }, fakeRes())

  assert.equal(calls.filter((c) => c.url.includes('access_token')).length, 1)
})

test('a rejected token does not stop the other routes', async () => {
  process.env.REDDIT_CLIENT_ID = 'id'
  process.env.REDDIT_CLIENT_SECRET = 'secret'

  stub((url) =>
    url.includes('access_token') ? reply.json({}, 401) : reply.json(listingOf([post(1)])),
  )
  const res = await call({ subreddit: 'javascript' })

  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['X-Fetched-Via'], 'public')
})

// --- ScrapeCreators ---------------------------------------------------------

function scrapePages(pages) {
  let seen = 0
  return (url) => {
    if (!url.startsWith('https://api.scrapecreators.com/')) return reply.blocked()
    const page = pages[seen++]
    if (!page) return reply.json({}, 500)
    if (page.fail) return reply.dead()
    return reply.json({
      posts: Array.from({ length: page.n }, (_, i) => post(seen * 100 + i)),
      after: page.more ? `t3_${seen}` : null,
    })
  }
}

test('a ScrapeCreators listing is reshaped into a Reddit listing', async () => {
  process.env.SCRAPECREATORS_API_KEY = 'key'
  const { calls } = stub(scrapePages([{ n: 25, more: true }, { n: 25, more: true }]))
  const res = await call({ subreddit: 'javascript' })

  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['X-Fetched-Via'], 'scrapecreators')
  assert.equal(res.body.kind, 'Listing')
  assert.equal(res.body.data.children[0].kind, 't3')
  assert.ok(res.body.data.children[0].data.title)
})

test('it keeps paging until it has 50 posts', async () => {
  process.env.SCRAPECREATORS_API_KEY = 'key'
  stub(scrapePages([{ n: 25, more: true }, { n: 25, more: true }]))
  const res = await call({ subreddit: 'javascript' })

  assert.equal(res.body.data.children.length, 50)
})

test('it stops early when the listing runs out', async () => {
  process.env.SCRAPECREATORS_API_KEY = 'key'
  const { calls } = stub(scrapePages([{ n: 25, more: true }, { n: 6, more: false }]))
  const res = await call({ subreddit: 'aww' })

  assert.equal(res.body.data.children.length, 31)
  assert.equal(calls.filter((c) => c.url.includes('scrapecreators')).length, 2)
})

test('a failed later page still returns the pages that worked', async () => {
  process.env.SCRAPECREATORS_API_KEY = 'key'
  stub(scrapePages([{ n: 25, more: true }, { fail: true }]))
  const res = await call({ subreddit: 'javascript' })

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.children.length, 25)
})

test('the API key travels as a header, never in the URL', async () => {
  process.env.SCRAPECREATORS_API_KEY = 'super-secret-key'
  const { calls } = stub(scrapePages([{ n: 25, more: false }]))
  await call({ subreddit: 'javascript' })

  const scrape = calls.find((c) => c.url.includes('scrapecreators'))
  assert.equal(scrape.options.headers['x-api-key'], 'super-secret-key')
  assert.ok(!scrape.url.includes('super-secret-key'))
  assert.ok(scrape.url.includes('sort=hot'))
})

test('Reddit is still tried before spending a credit', async () => {
  process.env.SCRAPECREATORS_API_KEY = 'key'
  const { calls } = stub((url) =>
    url.startsWith('https://www.reddit.com') ? reply.json(listingOf([post(1)])) : reply.blocked(),
  )
  const res = await call({ subreddit: 'javascript' })

  assert.equal(res.headers['X-Fetched-Via'], 'public')
  assert.equal(calls.filter((c) => c.url.includes('scrapecreators')).length, 0)
})
