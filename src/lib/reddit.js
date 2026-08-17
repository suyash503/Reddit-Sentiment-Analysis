// Reddit hands back JSON if you stick .json on the end of any listing URL,
// so /r/{sub}/hot.json?limit=50 is all we need. No login, no API key.
//
// The annoying part is CORS: calling www.reddit.com straight from the browser
// is a cross-origin request and Reddit sends no CORS header back, so it fails
// every time. Something on our own origin has to do the fetching.
//
// In dev that's the Vite proxy (vite.config.js); deployed it's the serverless
// function in api/reddit.js. Reddit also 403s plenty of networks even
// server-side, so both have a relay behind them. Routes are tried in order and
// the first one that returns a real listing wins.
const relayed = (path) =>
  `raw?url=${encodeURIComponent(`https://www.reddit.com/${path}`)}`

const SOURCES = import.meta.env.DEV
  ? [
      (path) => `/reddit/${path}`, // vite proxy -> reddit
      (path) => `/relay/${relayed(path)}`, // vite proxy -> relay -> reddit
    ]
  : [
      (_path, sub) => `/api/reddit?subreddit=${sub}&limit=50`, // our own function
      (path) => `https://api.allorigins.win/${relayed(path)}`, // if that's down
    ]

// Accepts "pics", "r/pics", "/r/pics/" or a full reddit URL.
export function cleanName(input) {
  return String(input || '')
    .trim()
    .replace(/^https?:\/\/(www\.|old\.|new\.)?reddit\.com/i, '')
    .replace(/^\/+/, '')
    .replace(/^r\//i, '')
    .split(/[/?#]/)[0]
}

// Something wrong with the subreddit itself, not the connection - no point
// asking the next source the same question.
function fatal(message) {
  const err = new Error(message)
  err.fatal = true
  return err
}

// A dead relay can hang forever, which leaves the button stuck on "Checking...".
// Give every route 12 seconds and then move on.
async function fetchWithTimeout(url, signal, ms = 12000) {
  const attempt = new AbortController()
  const timer = setTimeout(() => attempt.abort(), ms)
  const passAlong = () => attempt.abort()
  signal?.addEventListener('abort', passAlong)

  try {
    return await fetch(url, { signal: attempt.signal })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', passAlong)
  }
}

export async function getHotPosts(input, signal) {
  const sub = cleanName(input)
  if (!sub) throw fatal('Type a subreddit name first.')
  if (!/^[A-Za-z0-9][A-Za-z0-9_]{1,20}$/.test(sub)) {
    throw fatal(`"${sub}" isn't a valid subreddit name.`)
  }

  const path = `r/${sub}/hot.json?limit=50&raw_json=1`
  let lastError = null

  for (const buildUrl of SOURCES) {
    try {
      const res = await fetchWithTimeout(buildUrl(path, sub), signal)

      // Read the body first. A private subreddit still replies with JSON, and
      // in a built app /reddit/... has no proxy behind it so we get index.html
      // back with a 200 - res.json() would just blow up on both.
      const body = await res.text()
      let data = null
      try {
        data = JSON.parse(body)
      } catch {
        // not JSON, handled below
      }

      if (data?.reason === 'private' || data?.reason === 'quarantined') {
        throw fatal(`r/${sub} is ${data.reason}, so we can't read it.`)
      }
      if (data?.reason === 'banned') throw fatal(`r/${sub} has been banned.`)
      if (res.status === 404 || data?.error === 404) {
        throw fatal(`There's no subreddit called r/${sub}.`)
      }
      if (res.status === 429) throw fatal('Reddit is rate limiting us. Give it a minute.')

      // Reddit blocks a lot of networks outright with a 403, which is not the
      // same as the subreddit being private - so let the next source try.
      if (!res.ok) throw new Error(`got HTTP ${res.status}`)
      if (data?.kind !== 'Listing') throw new Error('response was not a listing')

      const posts = data.data.children
        .filter((c) => c.kind === 't3')
        .map((c) => c.data)
        .slice(0, 50)
        .map((p, i) => ({
          id: p.id,
          rank: i + 1,
          title: p.title || '',
          author: p.author,
          ups: p.ups ?? 0,
          comments: p.num_comments ?? 0,
          created: (p.created_utc ?? 0) * 1000,
          link: `https://www.reddit.com${p.permalink}`,
          flair: p.link_flair_text || null,
          nsfw: Boolean(p.over_18),
        }))

      if (!posts.length) throw fatal(`r/${sub} has no hot posts right now.`)

      return { sub, posts }
    } catch (err) {
      if (signal?.aborted) throw err // the user searched for something else
      if (err.fatal) throw err
      lastError = err.name === 'AbortError' ? new Error('timed out') : err
    }
  }

  throw new Error(
    `Reddit didn't answer on any route (last try: ${lastError?.message || 'unknown'}). ` +
      'It blocks some networks outright - try again in a minute, or use the sample data.',
  )
}
