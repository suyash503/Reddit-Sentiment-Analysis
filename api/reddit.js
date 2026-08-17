// Runs on Vercel, not in the browser.
//
// The dev server has a proxy for this (see vite.config.js) but that only exists
// while you're running npm run dev. In production this function does the same
// job, so the deployed app still only ever talks to its own origin and never
// runs into CORS.
//
// Fetching Reddit from a datacenter is the hard part. Reddit hands back an HTML
// block page to most cloud IPs, Vercel's included, no matter how polite the
// User-Agent is - I tried it from two regions. So there are four routes, tried
// in order, and the first one that returns a real listing wins.

// Reddit asks for platform:app-id:version (by /u/username), and the app id
// should match the app registered at reddit.com/prefs/apps. It can't contain
// the word "reddit" - Reddit rejects client names that do.
const UA = 'web:vibe-check-dashboard:v1.0.0 (by /u/BigBag2433)'

// No route gets to hog the whole function; Vercel kills it at 10s.
const PER_ROUTE_MS = 4500

// Tokens last an hour, and a warm function can reuse one across requests.
let cachedToken = null

async function getToken() {
  const id = process.env.REDDIT_CLIENT_ID
  const secret = process.env.REDDIT_CLIENT_SECRET
  if (!id || !secret) return null

  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.value

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(PER_ROUTE_MS),
  })

  if (!res.ok) throw new Error(`token request returned ${res.status}`)

  const data = await res.json()
  if (!data.access_token) throw new Error('token response had no access_token')

  cachedToken = {
    value: data.access_token,
    expires: Date.now() + (data.expires_in - 60) * 1000,
  }
  return cachedToken.value
}

// ScrapeCreators fetches Reddit from its own infrastructure, so the IP block
// isn't its problem. It hands back the same field names Reddit uses, which
// means we can reshape it into a listing and the frontend never knows.
// Costs one credit per uncached call, hence cache_max_age.
async function viaScrapeCreators(subreddit, limit) {
  const key = process.env.SCRAPECREATORS_API_KEY
  if (!key) return null

  const call = async (after) => {
    const url = new URL('https://api.scrapecreators.com/v1/reddit/subreddit')
    url.searchParams.set('subreddit', subreddit)
    url.searchParams.set('sort', 'hot')
    url.searchParams.set('cache_max_age', '1d')
    if (after) url.searchParams.set('after', after)

    const res = await fetch(url, {
      headers: { 'x-api-key': key },
      signal: AbortSignal.timeout(PER_ROUTE_MS),
    })
    if (!res.ok) throw new Error(`scrapecreators returned ${res.status}`)
    return res.json()
  }

  const first = await call()
  let posts = first.posts || []

  // One page is often short of 50, so take a second if there's more to get.
  if (posts.length < limit && first.after) {
    try {
      const second = await call(first.after)
      posts = posts.concat(second.posts || [])
    } catch {
      // a short listing is still worth showing
    }
  }

  return {
    kind: 'Listing',
    data: { children: posts.slice(0, limit).map((post) => ({ kind: 't3', data: post })) },
  }
}

const relays = (target) => [
  {
    name: 'allorigins',
    url: `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
  },
  {
    name: 'codetabs',
    url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
  },
]

export default async function handler(req, res) {
  const subreddit = String(req.query.subreddit || '')
  const limit = Math.min(Number(req.query.limit) || 50, 100)

  // Checked before it goes anywhere near a URL - without this you can put
  // slashes and query strings in the name and point the fetch somewhere else.
  if (!/^[A-Za-z0-9][A-Za-z0-9_]{1,20}$/.test(subreddit)) {
    return res.status(400).json({ error: 'bad subreddit name' })
  }

  const query = `limit=${limit}&raw_json=1`
  const publicUrl = `https://www.reddit.com/r/${subreddit}/hot.json?${query}`
  const tried = []

  const send = (route, status, data) => {
    // A minute of edge caching keeps repeat visits fast, is polite to Reddit
    // if a few people open the link at once, and saves API credits.
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    res.setHeader('X-Fetched-Via', route)
    return res.status(status).json(data)
  }

  // Reddit's own hot endpoint first - that's the one the app is meant to use.
  const routes = []

  try {
    const token = await getToken()
    if (token) {
      routes.push({
        name: 'oauth',
        url: `https://oauth.reddit.com/r/${subreddit}/hot?${query}`,
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA },
      })
    }
  } catch (err) {
    tried.push(`oauth: ${err.message}`)
  }

  routes.push({ name: 'public', url: publicUrl, headers: { 'User-Agent': UA } })

  for (const route of routes) {
    try {
      const upstream = await fetch(route.url, {
        headers: { Accept: 'application/json', ...(route.headers || {}) },
        signal: AbortSignal.timeout(PER_ROUTE_MS),
      })
      const data = JSON.parse(await upstream.text()) // HTML block pages throw

      // Pass real answers straight through, including "this sub is private",
      // so the app can show the proper message.
      if (!(data.kind === 'Listing' || data.reason || data.error)) {
        tried.push(`${route.name}: unexpected body (HTTP ${upstream.status})`)
        continue
      }
      return send(route.name, upstream.ok ? 200 : upstream.status, data)
    } catch (err) {
      tried.push(`${route.name}: ${err.message.slice(0, 80)}`)
    }
  }

  // Then the paid-but-reliable route, which is what makes the deployed version
  // work at all while Reddit is blocking the cloud.
  try {
    const listing = await viaScrapeCreators(subreddit, limit)
    if (listing) {
      if (!listing.data.children.length) throw new Error('no posts came back')
      return send('scrapecreators', 200, listing)
    }
  } catch (err) {
    tried.push(`scrapecreators: ${err.message.slice(0, 80)}`)
  }

  // Free relays last. They're often down, but they cost nothing to try.
  for (const relay of relays(publicUrl)) {
    try {
      const upstream = await fetch(relay.url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(PER_ROUTE_MS),
      })
      const data = JSON.parse(await upstream.text())
      if (data.kind !== 'Listing') {
        tried.push(`${relay.name}: unexpected body (HTTP ${upstream.status})`)
        continue
      }
      return send(relay.name, 200, data)
    } catch (err) {
      tried.push(`${relay.name}: ${err.message.slice(0, 80)}`)
    }
  }

  return res.status(502).json({
    error: 'could not reach reddit from the server',
    tried,
    hint:
      'set SCRAPECREATORS_API_KEY, or REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET, in the Vercel project',
  })
}
