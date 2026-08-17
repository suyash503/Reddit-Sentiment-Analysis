import Sentiment from 'sentiment'

// The `sentiment` package scores text with AFINN-165: a list of ~3300 English
// words each rated from -5 to +5. It adds up the words it recognises, so
// "comparative" (the total divided by the word count) is the useful number -
// it stops long titles from looking more extreme than short ones.
const sentiment = new Sentiment()

// AFINN was built from tweets and news, so it misses most reddit vocabulary.
// These are words I kept seeing in titles that AFINN either scores wrong or
// doesn't know at all.
const extras = {
  // positive
  wholesome: 3,
  underrated: 2,
  adorable: 3,
  hilarious: 3,
  masterpiece: 4,
  banger: 3,
  goat: 2,
  based: 2,
  cozy: 2,
  clutch: 2,
  legend: 2,
  stunning: 3,
  gorgeous: 3,
  congrats: 3,
  lmao: 2,
  lmfao: 2,
  // negative
  cringe: -2,
  ragebait: -3,
  toxic: -3,
  scam: -3,
  scammed: -3,
  ripoff: -3,
  sketchy: -2,
  banned: -2,
  yikes: -2,
  doomed: -3,
  layoffs: -3,
  outage: -2,
  meltdown: -3,
  lawsuit: -2,
  broken: -2,
  garbage: -2,
  trash: -2,
  drama: -2,
  rant: -2,
  cope: -1,
  // AFINN reads these as insults, but on reddit they usually mean "impressive"
  sick: 0,
  insane: 0,
  crazy: 0,
  ridiculous: 0,
}

// Titles closer to zero than this are just neutral. Same idea as VADER's
// +/-0.05 cutoff.
const NEUTRAL_BAND = 0.05

// Comparative scores are small (one strong word in a ten word title is ~0.3),
// so scale up a bit and clamp, which gives every post a score from -1 to 1.
function toScore(comparative) {
  return Math.max(-1, Math.min(1, comparative * 2))
}

export function labelFor(comparative) {
  if (comparative > NEUTRAL_BAND) return 'positive'
  if (comparative < -NEUTRAL_BAND) return 'negative'
  return 'neutral'
}

export function scoreTitle(title) {
  // Links and markdown leftovers aren't words, drop them before scoring.
  const text = title
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_~`|>#]/g, ' ')
    .trim()

  const result = sentiment.analyze(text, { extras })

  return {
    score: toScore(result.comparative),
    comparative: result.comparative,
    raw: result.score, // the plain AFINN total, handy for debugging
    label: labelFor(result.comparative),
    positiveWords: result.positive,
    negativeWords: result.negative,
    matched: result.positive.length + result.negative.length,
  }
}

// What AFINN rates a single word at, used to break ties sensibly.
function weightOf(word) {
  return sentiment.analyze(word, { extras }).score
}

// Counts every matched word so the dashboard can show what actually drove
// the mood, instead of just a number. Most common first, and where two words
// tie, the stronger one wins - "awful" is more interesting than "broke".
function countWords(posts, key) {
  const counts = new Map()
  for (const post of posts) {
    for (const word of post[key]) {
      counts.set(word, (counts.get(word) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count, weight: weightOf(word) }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        Math.abs(b.weight) - Math.abs(a.weight) ||
        a.word.localeCompare(b.word),
    )
    .slice(0, 7)
}

// Histogram buckets. Narrow in the middle because most titles land near zero.
const BUCKETS = [-1, -0.6, -0.3, -0.05, 0.05, 0.3, 0.6, 1]

function bucketize(posts) {
  return BUCKETS.slice(0, -1).map((from, i) => {
    const to = BUCKETS[i + 1]
    const last = i === BUCKETS.length - 2
    const count = posts.filter(
      (p) => p.score >= from && (last ? p.score <= to : p.score < to),
    ).length
    return { from, to, count }
  })
}

function averageUps(posts) {
  if (!posts.length) return 0
  return Math.round(posts.reduce((sum, p) => sum + p.ups, 0) / posts.length)
}

/** Scores every title and works out the numbers the dashboard needs. */
export function analyzePosts(posts) {
  const scored = posts.map((post) => ({ ...post, ...scoreTitle(post.title) }))

  const positive = scored.filter((p) => p.label === 'positive')
  const negative = scored.filter((p) => p.label === 'negative')
  const neutral = scored.filter((p) => p.label === 'neutral')

  const mean = scored.reduce((sum, p) => sum + p.score, 0) / (scored.length || 1)
  const vibe = Math.round(mean * 100)

  const bySentiment = [...scored].sort((a, b) => b.score - a.score)

  return {
    posts: scored,
    total: scored.length,
    vibe, // -100 to 100, the headline number
    verdict: verdictFor(vibe),
    counts: {
      positive: positive.length,
      neutral: neutral.length,
      negative: negative.length,
    },
    share: {
      positive: positive.length / scored.length,
      neutral: neutral.length / scored.length,
      negative: negative.length / scored.length,
    },
    avgUps: {
      positive: averageUps(positive),
      neutral: averageUps(neutral),
      negative: averageUps(negative),
    },
    topWords: {
      positive: countWords(scored, 'positiveWords'),
      negative: countWords(scored, 'negativeWords'),
    },
    buckets: bucketize(scored),
    // how many titles had at least one word the lexicon recognised
    coverage: scored.filter((p) => p.matched > 0).length / scored.length,
    happiest: bySentiment[0],
    angriest: bySentiment[bySentiment.length - 1],
  }
}

function verdictFor(vibe) {
  if (vibe >= 20) return 'Very positive'
  if (vibe >= 7) return 'Positive'
  if (vibe > -7) return 'Mostly neutral'
  if (vibe > -20) return 'Negative'
  return 'Very negative'
}
