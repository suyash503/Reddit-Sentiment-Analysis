// Runs on Vercel, not in the browser.
//
// The dev server has a proxy for this (see vite.config.js) but that only exists
// while you're running npm run dev. In production this function does the same
// job, so the deployed app still only ever talks to its own origin and never
// runs into CORS.

const UA = 'web:subreddit-vibe-check:v1.0.0 (by /u/BigBag2433)'

const SOURCES = [
  (path) => `https://www.reddit.com/${path}`,
  (path) =>
    `https://api.allorigins.win/raw?url=${encodeURIComponent(
      `https://www.reddit.com/${path}`,
    )}`,
]

export default async function handler(req, res) {
  const sub = String(req.query.sub || '')
  const limit = Math.min(Number(req.query.limit) || 50, 100)

  if (!/^[A-Za-z0-9][A-Za-z0-9_]{1,20}$/.test(sub)) {
    return res.status(400).json({ error: 'bad subreddit name' })
  }

  const path = `r/${sub}/hot.json?limit=${limit}&raw_json=1`
  let lastError = 'unknown'

  for (const buildUrl of SOURCES) {
    try {
      const upstream = await fetch(buildUrl(path), {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      })
      const data = JSON.parse(await upstream.text())

      // Pass real answers straight through, including "this sub is private",
      // so the app can show the proper message. Anything else, try the relay.
      const isAnswer = data.kind === 'Listing' || data.reason || data.error
      if (!isAnswer) {
        lastError = `unexpected body from ${upstream.status}`
        continue
      }

      // A minute of edge caching keeps repeat visits fast and is polite to
      // Reddit if a few people open the link at once.
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
      return res.status(upstream.ok ? 200 : upstream.status).json(data)
    } catch (err) {
      lastError = err.message
    }
  }

  return res.status(502).json({ error: `could not reach reddit: ${lastError}` })
}
