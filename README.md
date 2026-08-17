# The Subreddit Vibe Check

Type in a subreddit, and this pulls its top **hot** posts and works out the mood of every
title in the browser. Built as my SportsOrca assignment.

**Live:** https://sports-orca-assignment-alpha.vercel.app

## Running it locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

Use `npm run dev` rather than opening a build - the dev server proxies Reddit, and without
that proxy the browser blocks the request. The long version of why is below.

## What it does

- **Fetches** the top 50 hot posts of a subreddit from `/r/{subreddit}/hot`. No account
  needed for the public endpoint.
- **Scores every title** with the [`sentiment`](https://www.npmjs.com/package/sentiment)
  package, which uses AFINN-165 - a list of about 3,300 English words each rated from -5
  to +5. All of it runs client side.
- **Shows the result** as one headline score, plus the mood split, the spread of scores,
  average upvotes per mood, which words did the pushing, and a sortable table of every
  post.

## How the scoring works

For each title, the library adds up the ratings of the words it recognises and divides by
the word count (its `comparative` score). Dividing matters - otherwise a long title looks
angrier than a short one just for having more words in it.

That comparative score is multiplied by 2 and clamped to **-1 to +1** so every post is on
the same scale. Titles within 0.05 either side of zero count as neutral, which is the same
cutoff VADER uses.

The **overall vibe score** is the average of all of them, times 100, so it runs from -100
to +100.

AFINN was built from tweets and news, so it doesn't know much reddit vocabulary. I added a
small extra lexicon in `src/lib/sentiment.js` for words that kept coming up - `cringe`,
`wholesome`, `ragebait`, `banger` - and for a few AFINN gets backwards in this context:
"sick", "insane" and "crazy" are usually compliments on reddit, so they're set to 0
instead of negative.

## Getting the data out of Reddit

This turned out to be the whole project, so it's worth writing down properly. Everything
below is something I actually hit, in order.

### 1. The browser can't call Reddit at all

`fetch('https://www.reddit.com/r/pics/hot.json')` from the page fails. It's a cross-origin
request and Reddit sends no `Access-Control-Allow-Origin` header, so the browser throws the
response away. No amount of frontend code fixes this - the fix has to be something on my
own origin doing the fetching.

Locally that's the Vite dev proxy in `vite.config.js`. The browser calls `/reddit/...` on
localhost, the dev server calls Reddit, same origin, no CORS. That worked immediately.

### 2. Deployed, it broke again - and the error was the clue

The Vite proxy only exists while `npm run dev` is running. A deployed build has no proxy
behind `/reddit/...`, so I wrote a Vercel serverless function (`api/reddit.js`) to do the
same job in production. Servers don't enforce CORS, so in theory that should have been the
end of it.

It still failed, and this error is the important part:

```
Unexpected token '<', "<body clas"... is not valid JSON
```

That is not a CORS error. `JSON.parse` choked on HTML, which means the request *reached*
Reddit and Reddit answered with a block page instead of data. So the problem had changed
completely: CORS was solved, and now Reddit was refusing my server specifically.

### 3. Making the failure explain itself

At this point I was guessing, so I stopped guessing. Every route the function tries now
records why it failed, and the response says which one succeeded:

```json
{
  "error": "could not reach reddit from the server",
  "tried": [
    "public: Unexpected token '<', \"<body clas\"... is not valid JSON",
    "allorigins: The operation was aborted due to timeout",
    "codetabs: The operation was aborted due to timeout"
  ]
}
```

Successful responses carry `X-Fetched-Via: oauth | public | scrapecreators | allorigins`.
Every experiment after this was one request and a glance at the output, instead of a
redeploy and a shrug.

### 4. Things I ruled out

- **User-Agent.** The common advice is that Reddit blocks generic server fetches, which is
  true, so I set the format Reddit's own rules ask for:
  `web:vibe-check-dashboard:v1.0.0 (by /u/BigBag2433)`. Still 403. Necessary, not
  sufficient. (I also learned the hard way that Reddit rejects OAuth client names
  containing the word "reddit", so `subreddit-vibe-check` is not a legal app name.)
- **Region.** Vercel put the function in `iad1`, AWS US-East, which is about the most
  scraped-from IP range on the internet. I moved it to `bom1` with `vercel.json`. Still
  403 - so this is cloud IP ranges generally, not one unlucky datacenter.
- **Free CORS relays.** `allorigins` and `codetabs` both returned 522 or timed out. Fine as
  a backstop, not something a submitted project should depend on.
- **The official API.** `oauth.reddit.com` with an app-only token
  (`grant_type=client_credentials`, so no account password is involved) is the correct
  answer, and the code for it is written and tested. I couldn't finish it: creating the app
  at `reddit.com/prefs/apps` returns a 500 for my account on both new and old Reddit. The
  route is still first in line, so it starts working the moment credentials exist.

### 5. What actually fixed it

I went looking at how other people fetch Reddit from serverless functions - Stack Overflow,
Reddit's own developer subreddits, GitHub. The thing that helped was
[mikefutia/reddit-research-agent](https://github.com/mikefutia/reddit-research-agent), a
Claude skill for turning Reddit threads into research. I read through its fetch script
expecting a clever header trick, and found something better: it never calls Reddit at all.
It goes through [ScrapeCreators](https://scrapecreators.com), which does the fetching from
its own infrastructure. If someone else's machines make the request, the IP block isn't my
problem.

Their docs had exactly the endpoint I needed - `/v1/reddit/subreddit` with `sort=hot` - and
the response comes back using Reddit's own field names (`ups`, `num_comments`,
`created_utc`, `permalink`). So the function reshapes it into a normal Reddit listing:

```js
{ kind: 'Listing', data: { children: posts.map((p) => ({ kind: 't3', data: p })) } }
```

The frontend already parses that, so nothing in `src/` had to change at all. Their pages
hold about 25 posts, so it keeps requesting until it has 50, stopping early if the listing
runs out or the clock gets close to Vercel's limit - each uncached page is a credit.

### 6. Where it ended up

The function tries four routes and returns the first real listing:

| # | Route | Notes |
|---|---|---|
| 1 | `oauth.reddit.com` | official API, active as soon as credentials are set |
| 2 | public `.json` endpoint | free, blocked from most clouds |
| 3 | ScrapeCreators | fetches from its own IPs, 1 credit per uncached page |
| 4 | public relays | free, unreliable, last resort |

Each route gets 4.5 seconds so the whole thing stays inside Vercel's 10 second function
limit. If every route fails, the app offers bundled sample data behind a banner, so the
dashboard is never just a blank error page.

Two things I'd carry into the next project. **The error text was the entire diagnosis** -
`Unexpected token '<'` told me the request was arriving and being refused, which is a
different bug from the one I thought I had. And **build the diagnostics before the fix**,
because guessing at a deployed serverless function one redeploy at a time is miserable.

Incidentally, live listings don't always return exactly 50 posts - the one I tested with
gave 48 - so every count in the UI reads the real number rather than assuming.

## Deploying

It's a Vite app with one serverless function, so Vercel needs no configuration - import the
repo at [vercel.com/new](https://vercel.com/new) and the defaults are correct (framework
Vite, build `npm run build`, output `dist`, functions from `api/`). Every push to `main`
redeploys.

Set **one** of these in Project → Settings → Environment Variables, then redeploy
(environment variables don't apply to existing deployments):

| Variable | Where it comes from |
|---|---|
| `SCRAPECREATORS_API_KEY` | a key from [scrapecreators.com](https://scrapecreators.com) |
| `REDDIT_CLIENT_ID` | the unlabelled string under the app name at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) |
| `REDDIT_CLIENT_SECRET` | the `secret` field of the same app |

Create the Reddit app as type **script**; the redirect URI is required but never used, so
`http://localhost:5173` is fine.

The ScrapeCreators route costs one credit per uncached lookup, so requests ask for a day of
caching and responses are edge-cached for a minute. Without that, a shared link would burn
through a free tier quickly.

## Design notes

- **Blue for positive, red for negative** instead of the obvious green/red. Green vs red is
  exactly the pairing red-green colourblind readers can't separate, and that's about 8% of
  men.
- Every number in the charts is also in the table, so nothing is locked behind a colour or
  a tooltip.
- The mood bar is centred on neutral rather than starting at the left edge, so you can see
  which way a subreddit leans at a glance. Both arms scale to whichever side is longer,
  otherwise the bar overflows its card.
- Dark and light mode each have their own colour steps rather than one being an inverted
  version of the other.
- The word-driver lists break ties by AFINN weight rather than alphabetically, so a list of
  one-off words leads with the strongest one instead of whatever starts with "a".

## Known limitations

- It only reads **titles**, not post bodies or comments - that's what the assignment asked
  for, but it means a cheerful title on a grim thread still scores positive.
- A word list can't do sarcasm, negation ("not great") or context. The "titles with scored
  words" tile shows how many titles AFINN recognised anything in at all; when that number
  is low, the score means less. I'd rather show that than hide it.
- Hot listings include pinned mod posts, which are usually neutral filler.
- Route 3 depends on a third-party API with a credit budget, and route 4 on free services
  that are often down. Route 1 is the only properly durable one.

## Layout

```
src/
  App.jsx                 state, search, loading and error handling
  lib/reddit.js           choosing a route, fetching, parsing the listing
  lib/sentiment.js        scoring, the extra lexicon, all the dashboard numbers
  lib/sampleData.js       offline fallback posts
  lib/format.js           number and date formatting
  components/             one file per card on the dashboard
api/reddit.js             serverless proxy, used by the deployed version
vercel.json               pins the function to the Mumbai region
```

## Credits

- [mikefutia/reddit-research-agent](https://github.com/mikefutia/reddit-research-agent) -
  where I found the approach that got production working.
- [ScrapeCreators](https://scrapecreators.com) - the Reddit fetching route that survives
  cloud IP blocks.
- [`sentiment`](https://www.npmjs.com/package/sentiment) and AFINN-165 - the word ratings.

Built with React and Vite.
