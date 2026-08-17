import { useTooltip, Tooltip } from './Tooltip.jsx'

const W = 640
const H = 214
const PAD = { top: 18, right: 12, bottom: 42, left: 32 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom
const BAR_W = 24

const fmt = (n) => String(n).replace('-', '−')

function label(bucket) {
  if (bucket.from === -0.05) return 'neutral'
  return `${fmt(bucket.from)} to ${fmt(bucket.to)}`
}

// Rounded on top, square where it meets the baseline.
function barPath(x, y, w, h, r = 4) {
  const radius = Math.min(r, h, w / 2)
  return [
    `M${x},${y + h}`,
    `L${x},${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `L${x + w - radius},${y}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ')
}

export default function ScoreSpread({ data }) {
  const { tip, hoverProps } = useTooltip()
  const buckets = data.buckets

  const tallest = Math.max(...buckets.map((b) => b.count))
  // round the axis up to something clean so the ticks read nicely
  const top = Math.max(4, Math.ceil(tallest / 4) * 4)
  const band = PLOT_W / buckets.length
  const y = (count) => PAD.top + PLOT_H - (count / top) * PLOT_H

  return (
    <section className="card span-7">
      <h2>Spread of title scores</h2>
      <p className="sub">
        How many of the {data.total} posts landed in each score band, from &minus;1
        (bleak) to +1 (delighted).
      </p>

      <svg className="hist" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Histogram of title sentiment scores">
        {[0, top / 2, top].map((tick) => (
          <g key={tick}>
            <line
              className={tick === 0 ? 'zero-line' : 'grid-line'}
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="tick" x={PAD.left - 8} y={y(tick) + 4} textAnchor="end">
              {tick}
            </text>
          </g>
        ))}

        {buckets.map((bucket, i) => {
          const centre = PAD.left + band * i + band / 2
          const height = (bucket.count / top) * PLOT_H
          const tone =
            bucket.from === -0.05 ? 'var(--neutral)' : bucket.from < 0 ? 'var(--neg)' : 'var(--pos)'

          return (
            <g
              className="col"
              key={bucket.from}
              {...hoverProps(
                <>
                  <b>
                    {bucket.count} post{bucket.count === 1 ? '' : 's'}
                  </b>{' '}
                  scored {label(bucket)}
                </>,
              )}
            >
              {/* full-height rectangle so the hover target isn't a sliver */}
              <rect
                className="hit"
                x={centre - band / 2}
                y={PAD.top}
                width={band}
                height={PLOT_H}
                rx="6"
              />
              {bucket.count > 0 && (
                <path d={barPath(centre - BAR_W / 2, y(bucket.count), BAR_W, height)} fill={tone} />
              )}
              {/* label the mode only - a number over every bar is noise */}
              {bucket.count === tallest && bucket.count > 0 && (
                <text className="cap" x={centre} y={y(bucket.count) - 7} textAnchor="middle">
                  {bucket.count}
                </text>
              )}
              <text className="tick" x={centre} y={H - 22} textAnchor="middle">
                {label(bucket)}
              </text>
            </g>
          )
        })}
      </svg>

      <Tooltip tip={tip} />
    </section>
  )
}
