import { percent, compact, score as fmtScore } from '../lib/format.js'
import { useTooltip, Tooltip } from './Tooltip.jsx'

// A diverging stacked bar: negative grows left, positive grows right and the
// neutral block straddles the middle, so the centre line is the "no opinion"
// mark rather than the left edge.
export default function MoodSplit({ data }) {
  const { share, counts, avgUps, happiest, angriest } = data
  const { tip, hoverProps } = useTooltip()

  // Half the neutral block sits on each side of the centre line, so each arm is
  // its own share plus half of neutral. Whichever arm is longer decides the
  // scale - without this the bar runs off the edge of the card.
  const left = share.negative + share.neutral / 2
  const right = share.positive + share.neutral / 2
  const scale = 50 / Math.max(left, right)

  const width = { ...share }
  for (const key of Object.keys(width)) width[key] = share[key] * scale

  const start = 50 - left * scale
  const segments = [
    { key: 'negative', left: start, width: width.negative },
    { key: 'neutral', left: start + width.negative, width: width.neutral },
    {
      key: 'positive',
      left: start + width.negative + width.neutral,
      width: width.positive,
    },
  ]

  return (
    <section className="card span-8">
      <h2>How the 50 titles split</h2>
      <p className="sub">
        Share of posts in each mood, centred on neutral. Anything within &plusmn;0.05 of
        zero counts as neutral.
      </p>

      <div className="split">
        <div className="center" />
        {segments.map((seg) => (
          <div
            key={seg.key}
            className={`seg ${seg.key}`}
            style={{
              // 1px either side leaves a 2px gap of card colour between blocks
              left: `calc(${seg.left}% + 1px)`,
              width: `calc(${seg.width}% - 2px)`,
            }}
            {...hoverProps(
              <>
                <b>
                  {counts[seg.key]} {seg.key}
                </b>{' '}
                &middot; {percent(share[seg.key])} of posts &middot; {compact(avgUps[seg.key])}{' '}
                avg upvotes
              </>,
            )}
          >
            {/* only label blocks with room for the text */}
            {seg.width >= 9 ? percent(share[seg.key]) : ''}
          </div>
        ))}
      </div>

      <div className="split-axis">
        <span>&larr; more negative</span>
        <span>neutral</span>
        <span>more positive &rarr;</span>
      </div>

      <div className="legend">
        {['positive', 'neutral', 'negative'].map((key) => (
          <span className="key" key={key}>
            <span className={`dot ${key}`} />
            {key[0].toUpperCase() + key.slice(1)} &mdash; {counts[key]} posts (
            {percent(share[key])})
          </span>
        ))}
      </div>

      <div className="extremes">
        {[
          { post: happiest, mood: 'positive', label: 'Happiest title' },
          { post: angriest, mood: 'negative', label: 'Grumpiest title' },
        ].map((item) => (
          <div className="extreme" key={item.mood}>
            <div className="label">
              <span className={`dot ${item.mood}`} />
              {item.label} ({fmtScore(item.post.score)})
            </div>
            <a
              className="title"
              href={item.post.link}
              target="_blank"
              rel="noreferrer"
              title={item.post.title}
            >
              {item.post.title}
            </a>
          </div>
        ))}
      </div>

      <Tooltip tip={tip} />
    </section>
  )
}
