import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreTitle, analyzePosts, labelFor } from '../src/lib/sentiment.js'
import { post } from './helpers.js'

test('a title with no rated words is neutral', () => {
  const r = scoreTitle('Weekly discussion thread')
  assert.equal(r.label, 'neutral')
  assert.equal(r.score, 0)
  assert.equal(r.matched, 0)
})

test('rated words move the score in the right direction', () => {
  assert.equal(scoreTitle('This bookshop is wonderful and beautiful').label, 'positive')
  assert.equal(scoreTitle('An awful, terrible experience').label, 'negative')
})

test('dividing by word count stops long titles reading as extreme', () => {
  const short = scoreTitle('Absolutely wonderful')
  const long = scoreTitle(
    'It was wonderful to see how the entire process eventually came together for everyone involved',
  )
  assert.ok(short.score > long.score)
  assert.equal(short.raw, long.raw) // same single rated word either way
})

test('scores stay inside -1 and 1 however strong the wording', () => {
  const r = scoreTitle('superb outstanding brilliant wonderful amazing')
  assert.ok(r.score <= 1)
  assert.ok(scoreTitle('awful horrible disgusting terrible worst').score >= -1)
})

test('the neutral band is 0.05 either side of zero', () => {
  assert.equal(labelFor(0.04), 'neutral')
  assert.equal(labelFor(-0.04), 'neutral')
  assert.equal(labelFor(0.06), 'positive')
  assert.equal(labelFor(-0.06), 'negative')
})

// The reddit-specific lexicon. These are the words the default AFINN list gets
// wrong for this kind of text, so they're worth pinning down.
test('"no" is treated as grammar, not as a negative word', () => {
  const r = scoreTitle("What's the dark side of gym life that no one ever admits?")
  assert.ok(!r.negativeWords.includes('no'))
})

test('reddit compliments are not read as insults', () => {
  for (const word of ['sick', 'insane', 'crazy', 'ridiculous']) {
    const r = scoreTitle(`That trick was absolutely ${word}`)
    assert.ok(!r.negativeWords.includes(word), `${word} should not count as negative`)
  }
})

test('reddit slang the base lexicon does not know', () => {
  assert.ok(scoreTitle('A genuinely wholesome moment').positiveWords.includes('wholesome'))
  assert.ok(scoreTitle('Peak cringe marketing').negativeWords.includes('cringe'))
})

test('negation still flips a positive word', () => {
  const r = scoreTitle('This is not good at all')
  assert.equal(r.label, 'negative')
})

test('links and markdown are stripped before scoring', () => {
  const plain = scoreTitle('A wonderful writeup')
  const messy = scoreTitle('**A wonderful writeup** https://example.com/awful-terrible-page')
  assert.equal(messy.label, plain.label)
  assert.ok(!messy.negativeWords.length)
})

// The dashboard numbers.
const samplePosts = [
  { ...post(1), title: 'A wonderful and wholesome surprise' },
  { ...post(2), title: 'Awful outage, no support at all' },
  { ...post(3), title: 'Weekly discussion thread' },
  { ...post(4), title: 'The worst decision this company ever made' },
  { ...post(5), title: 'Congrats to everyone who finished' },
]

test('every post is accounted for exactly once', () => {
  const d = analyzePosts(samplePosts)
  assert.equal(d.total, samplePosts.length)
  assert.equal(d.counts.positive + d.counts.neutral + d.counts.negative, d.total)
  assert.equal(d.buckets.reduce((sum, b) => sum + b.count, 0), d.total)
  assert.ok(Math.abs(d.share.positive + d.share.neutral + d.share.negative - 1) < 1e-9)
})

test('the vibe score stays in range and matches its verdict', () => {
  const d = analyzePosts(samplePosts)
  assert.ok(d.vibe >= -100 && d.vibe <= 100)
  assert.equal(analyzePosts([{ ...post(1), title: 'Weekly thread' }]).verdict, 'Mostly neutral')
  assert.equal(
    analyzePosts([{ ...post(1), title: 'Wonderful wholesome brilliant' }]).verdict,
    'Very positive',
  )
})

test('happiest and grumpiest are the actual extremes', () => {
  const d = analyzePosts(samplePosts)
  const scores = d.posts.map((p) => p.score)
  assert.equal(d.happiest.score, Math.max(...scores))
  assert.equal(d.angriest.score, Math.min(...scores))
})

test('coverage reports how many titles the lexicon recognised', () => {
  const d = analyzePosts([
    { ...post(1), title: 'A wonderful day' },
    { ...post(2), title: 'Weekly discussion thread' },
  ])
  assert.equal(d.coverage, 0.5)
})

test('driver words are ranked by count, then by how strong they are', () => {
  const d = analyzePosts([
    { ...post(1), title: 'good news' },
    { ...post(2), title: 'good news again' },
    { ...post(3), title: 'superb' }, // rated higher than "nice", but appears once
    { ...post(4), title: 'nice' },
  ])
  const words = d.topWords.positive

  assert.equal(words[0].word, 'good') // twice, so it leads
  assert.ok(
    words.findIndex((w) => w.word === 'superb') < words.findIndex((w) => w.word === 'nice'),
    'a tie on count should be broken by the stronger word',
  )

  for (let i = 1; i < words.length; i++) {
    const [before, after] = [words[i - 1], words[i]]
    const ordered =
      before.count > after.count ||
      (before.count === after.count && Math.abs(before.weight) >= Math.abs(after.weight))
    assert.ok(ordered, `${before.word} should not come before ${after.word}`)
  }
})

test('averages survive a group with nobody in it', () => {
  const d = analyzePosts([{ ...post(1), title: 'Weekly discussion thread' }])
  assert.equal(d.avgUps.positive, 0)
  assert.equal(d.avgUps.negative, 0)
  assert.equal(d.counts.neutral, 1)
})
