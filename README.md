# The Subreddit Vibe Check

Type in a subreddit, and this pulls its top 50 **hot** posts and works out the mood of
every title in the browser. Built as my SportsOrca assignment.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

Use `npm run dev` rather than opening a build — the dev server proxies Reddit, and
without that proxy the browser blocks the request (see below).

## What it does

- **Fetches** the top 50 hot posts from `/r/{subreddit}/hot.json?limit=50`. No API key
  and no login needed; Reddit serves JSON for any public listing.
- **Scores every title** with the [`sentiment`](https://www.npmjs.com/package/sentiment)
  package, which uses AFINN-165 — a list of about 3,300 English words each rated from
  -5 to +5. All of it runs client side.
- **Shows the result** as one headline score, plus a breakdown of the split, the spread
  of scores, average upvotes per mood, which words did the pushing, and a sortable table
  of all 50 posts.

## How the scoring works

For each title, the library adds up the ratings of the words it recognises and divides
by the word count (its `comparative` score). Dividing matters — otherwise a long title
looks angrier than a short one just for having more words in it.

That comparative score is multiplied by 2 and clamped to **-1 … +1** so every post is on
the same scale. Titles within ±0.05 of zero count as neutral, which is the same cutoff
VADER uses.

The **overall vibe score** on the dashboard is the average of all 50, times 100, so it
runs from -100 to +100.

AFINN was built from tweets and news, so it doesn't know much reddit vocabulary. I added
a small extra lexicon in `src/lib/sentiment.js` for words that kept coming up — `cringe`,
`wholesome`, `ragebait`, `banger` — and for a few AFINN gets backwards in this context:
"sick", "insane" and "crazy" are usually compliments on reddit, so they're set to 0
instead of negative.

## The CORS problem

Calling `www.reddit.com` straight from browser JavaScript fails: it's a cross-origin
request and Reddit sends no `Access-Control-Allow-Origin` header back. Reddit also
returns 403 to plenty of networks even from a server.

Something on our own origin has to do the fetching, so `src/lib/reddit.js` picks its
routes based on where it's running and keeps the first that returns a real listing.

Running locally:

1. `/reddit/...` — the Vite dev proxy, same origin as the app, so CORS never applies
2. `/relay/...` — the dev proxy going through a public relay, for when Reddit 403s the
   network directly

Deployed:

1. `/api/reddit?sub=...` — the serverless function in `api/reddit.js`, which does the same
   job as the dev proxy and falls back to the relay itself
2. the relay straight from the browser, if the function is down

Each route gets 12 seconds before it moves on. If they all fail there's a **sample data**
button that loads 50 bundled posts so the dashboard still demos; a banner makes it
obvious that isn't live data.

## Deploying

It's a Vite app with one serverless function, so Vercel needs no configuration — import
the repo at [vercel.com/new](https://vercel.com/new) and the defaults are correct
(framework Vite, build `npm run build`, output `dist`, functions from `api/`). Every push
to `main` redeploys.

## Design notes

- **Blue for positive, red for negative** instead of the obvious green/red. Green vs red
  is exactly the pairing red-green colourblind readers can't separate, and it's about 8%
  of men.
- Every number in the charts is also in the table, so nothing is locked behind a colour
  or a tooltip.
- The middle bar is centred on neutral rather than starting at the left edge, so you can
  see which way a subreddit leans at a glance.
- Dark and light mode both have their own colour steps rather than one being an inverted
  version of the other.

## Known limitations

Worth being upfront about these:

- It only reads **titles**, not post bodies or comments — that's what the assignment asked
  for, but it means a cheerful title on a grim thread still scores positive.
- A word list can't do sarcasm, negation ("not great") or context. The "titles with scored
  words" tile shows how many titles AFINN actually recognised anything in; for a subreddit
  with a lot of plain factual titles that number is low and the score means less.
- Hot listings include pinned mod posts, which are usually neutral filler.
- The relay in route 2 and 3 is a free public service, so it's occasionally slow or down.

## Layout

```
src/
  App.jsx                 state, search, loading and error handling
  lib/reddit.js           fetching + parsing the listing
  lib/sentiment.js        scoring, the extra lexicon, all the dashboard numbers
  lib/sampleData.js       offline fallback posts
  lib/format.js           number and date formatting
  components/             one file per card on the dashboard
api/reddit.js             serverless proxy, used by the deployed version
```

Built with React and Vite.
