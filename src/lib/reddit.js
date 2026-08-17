// Reddit hands back JSON if you stick .json on the end of any listing URL,
// so /r/{sub}/hot.json?limit=50 is all we need. No login, no API key.
//
// The annoying part is CORS. Calling www.reddit.com straight from the browser
// gets blocked, so in dev we go through the Vite proxy (see vite.config.js).
// The other two are fallbacks for when the app is built and served statically.
const SOURCES = [
  (path) => `/reddit/${path}`, // vite dev proxy - same origin, no CORS
  (path) => `https://www.reddit.com/${path}`, // works on some hosts
  (path) =>
    `https://api.allorigins.win/raw?url=${encodeURIComponent(
      `https://www.reddit.com/${path}`,
    )}`, // last resort
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

export async function getHotPosts(input, signal) {
  const sub = cleanName(input)
  if (!sub) throw new Error('Type a subreddit name first.')
  if (!/^[A-Za-z0-9][A-Za-z0-9_]{1,20}$/.test(sub)) {
    throw new Error(`"${sub}" isn't a valid subreddit name.`)
  }

  const path = `r/${sub}/hot.json?limit=50&raw_json=1`
  let lastError = null

  for (const buildUrl of SOURCES) {
    try {
      const res = await fetch(buildUrl(path), { signal })

      if (res.status === 404) throw new Error(`There's no subreddit called r/${sub}.`)
      if (res.status === 403 || res.status === 401) {
        throw new Error(`r/${sub} is private or restricted.`)
      }
      if (res.status === 429) {
        throw new Error('Reddit is rate limiting us. Give it a minute.')
      }
      if (!res.ok) throw new Error(`Reddit returned ${res.status}.`)

      // Not res.json() - in a built app /reddit/... has no proxy behind it and
      // we get index.html back with a 200, which would blow up here.
      const data = JSON.parse(await res.text())

      if (data.reason === 'private' || data.reason === 'quarantined') {
        throw new Error(`r/${sub} is ${data.reason}, so we can't read it.`)
      }
      if (data.kind !== 'Listing') throw new Error('That listing looks wrong.')

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

      if (!posts.length) throw new Error(`r/${sub} has no hot posts right now.`)

      return { sub, posts }
    } catch (err) {
      if (err.name === 'AbortError') throw err
      lastError = err
      // A wrong/private subreddit is the same on every source, so don't retry.
      if (/no subreddit|private|restricted|rate limiting|no hot posts/i.test(err.message)) {
        throw err
      }
    }
  }

  throw new Error(
    `Couldn't reach Reddit (${lastError?.message || 'unknown error'}). ` +
      'If the app is running from a build, start it with npm run dev instead.',
  )
}
