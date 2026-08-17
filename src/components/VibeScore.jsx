import { score as fmtScore, signed } from '../lib/format.js'

// The headline card: one number from -100 to +100, plus the two titles that
// pulled hardest in each direction.
export default function VibeScore({ data, sub }) {
  const { vibe, verdict, happiest, angriest } = data
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

      <div className="extremes">
        <div className="extreme">
          <div className="label">
            <span className="dot positive" />
            Happiest title ({fmtScore(happiest.score)})
          </div>
          <a
            className="title"
            href={happiest.link}
            target="_blank"
            rel="noreferrer"
            title={happiest.title}
          >
            {happiest.title}
          </a>
        </div>
        <div className="extreme">
          <div className="label">
            <span className="dot negative" />
            Grumpiest title ({fmtScore(angriest.score)})
          </div>
          <a
            className="title"
            href={angriest.link}
            target="_blank"
            rel="noreferrer"
            title={angriest.title}
          >
            {angriest.title}
          </a>
        </div>
      </div>
      <p className="empty-note">Scored from r/{sub}</p>
    </section>
  )
}
