// Runs on Vercel, not in the browser.
//
// The dev server has a proxy for this (see vite.config.js) but that only exists
// while you're running npm run dev. In production this function does the same
// job, so the deployed app still only ever talks to its own origin and never
// runs into CORS.
//
// Fetching Reddit from a datacenter is the hard part. Reddit hands back an HTML
// block page to most cloud IPs, Vercel included, no matter how polite the
// User-Agent is. The official API doesn't have that problem, so if app
// credentials are configured we go through OAuth and everything else is just a
// fallback for when they aren't.

const UA = 'web:subreddit-vibe-check:v1.0.0 (by /u/BigBag2433)'

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
  const routes = []
  const tried = []

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
  routes.push(...relays(publicUrl))

  for (const route of routes) {
    try {
      const upstream = await fetch(route.url, {
        headers: { Accept: 'application/json', ...(route.headers || {}) },
      })
      const body = await upstream.text()
      const data = JSON.parse(body) // HTML block pages land in the catch

      // Pass real answers straight through, including "this sub is private",
      // so the app can show the proper message. Anything else, try the next one.
      if (!(data.kind === 'Listing' || data.reason || data.error)) {
        tried.push(`${route.name}: unexpected body (HTTP ${upstream.status})`)
        continue
      }

      // A minute of edge caching keeps repeat visits fast and is polite to
      // Reddit if a few people open the link at once.
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
      res.setHeader('X-Fetched-Via', route.name)
      return res.status(upstream.ok ? 200 : upstream.status).json(data)
    } catch (err) {
      tried.push(`${route.name}: ${err.message.slice(0, 80)}`)
    }
  }

  return res.status(502).json({
    error: 'could not reach reddit from the server',
    tried,
    hint: cachedToken
      ? undefined
      : 'set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to use the official API',
  })
}
