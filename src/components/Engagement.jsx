import { compact } from '../lib/format.js'
import { useTooltip, Tooltip } from './Tooltip.jsx'

const MOODS = ['positive', 'neutral', 'negative']

// Does the subreddit actually reward cheerful posts? Average upvotes per mood
// answers that in three bars.
export default function Engagement({ data }) {
  const { tip, hoverProps } = useTooltip()
  const { avgUps, counts } = data
  const most = Math.max(...MOODS.map((m) => avgUps[m]), 1)

  return (
    <section className="card span-5">
      <h2>Upvotes by mood</h2>
      <p className="sub">Average upvotes of the posts in each group.</p>

      <div className="rows">
        {MOODS.map((mood) => (
          <div className="row" key={mood}>
            <span className="name">{mood}</span>
            <div className="track">
              <div
                className="bar"
                style={{
                  width: `${(avgUps[mood] / most) * 100}%`,
                  background: `var(--${mood === 'positive' ? 'pos' : mood === 'negative' ? 'neg' : 'neutral'})`,
                }}
                {...hoverProps(
                  <>
                    <b>{avgUps[mood].toLocaleString()}</b> avg upvotes across {counts[mood]}{' '}
                    {mood} posts
                  </>,
                )}
              />
            </div>
            <span className="amount">{compact(avgUps[mood])}</span>
          </div>
        ))}
      </div>

      {counts.positive === 0 || counts.negative === 0 ? (
        <p className="empty-note">
          One of the groups is empty, so there's not much to compare here.
        </p>
      ) : null}

      <Tooltip tip={tip} />
    </section>
  )
}
