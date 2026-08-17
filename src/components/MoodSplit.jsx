import { percent, compact } from '../lib/format.js'
import { useTooltip, Tooltip } from './Tooltip.jsx'

// A diverging stacked bar: negative grows left, positive grows right and the
// neutral block straddles the middle, so the centre line is the "no opinion"
// mark rather than the left edge.
export default function MoodSplit({ data }) {
  const { share, counts, avgUps } = data
  const { tip, hoverProps } = useTooltip()

  const pct = (n) => n * 100
  // shift the whole bar so the middle of the neutral block lands on 50%
  const start = 50 - (pct(share.negative) + pct(share.neutral) / 2)

  const segments = [
    { key: 'negative', left: start, width: pct(share.negative) },
    { key: 'neutral', left: start + pct(share.negative), width: pct(share.neutral) },
    {
      key: 'positive',
      left: start + pct(share.negative) + pct(share.neutral),
      width: pct(share.positive),
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
            {seg.width >= 12 ? percent(share[seg.key]) : ''}
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

      <Tooltip tip={tip} />
    </section>
  )
}
