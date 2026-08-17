import { signed } from '../lib/format.js'

// The headline card: one number from -100 to +100.
export default function VibeScore({ data, sub }) {
  const { vibe, verdict } = data
  const colour = vibe > 0 ? 'var(--pos)' : vibe < 0 ? 'var(--neg)' : 'var(--neutral)'

  // meter runs -100 .. 100, so 0 sits at 50%
  const knob = ((vibe + 100) / 200) * 100
  const fillFrom = Math.min(50, knob)
  const fillWidth = Math.abs(knob - 50)

  return (
    <section className="card span-4">
      <h2>Overall vibe</h2>
      <p className="sub">Average title sentiment across all {data.total} posts</p>

      <div className="vibe-figure" style={{ color: colour }}>
        {signed(vibe)}
      </div>
      <div className="vibe-verdict">{verdict}</div>

      <div className="meter">
        <div className="zero" />
        <div
          className="fill"
          style={{ left: `${fillFrom}%`, width: `${fillWidth}%`, background: colour }}
        />
        <div className="knob" style={{ left: `${knob}%`, background: colour }} />
      </div>
      <div className="meter-scale">
        <span>-100</span>
        <span>0</span>
        <span>+100</span>
      </div>

      <p className="empty-note">
        Scored from the top 50 hot posts in r/{sub}. Zero means the titles balanced
        out, not that nobody had an opinion.
      </p>
    </section>
  )
}
