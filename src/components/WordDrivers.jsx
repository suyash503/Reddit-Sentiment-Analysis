import { useTooltip, Tooltip } from './Tooltip.jsx'

// The lexicon words that actually moved the needle. Without this the whole
// thing is a black box - here you can see exactly which words were picked up.
function WordList({ items, tone, hoverProps }) {
  if (!items.length) {
    return <p className="empty-note">No words from this side turned up in the titles.</p>
  }
  const most = items[0].count

  return (
    <div className="rows">
      {items.map((item) => (
        <div className="row" key={item.word}>
          <span className="name" title={item.word}>
            {item.word}
          </span>
          <div className="track">
            <div
              className="bar"
              style={{
                width: `${(item.count / most) * 100}%`,
                background: tone === 'pos' ? 'var(--pos)' : 'var(--neg)',
              }}
              {...hoverProps(
                <>
                  <b>&ldquo;{item.word}&rdquo;</b> appeared in {item.count} title
                  {item.count === 1 ? '' : 's'}
                </>,
              )}
            />
          </div>
          <span className="amount">{item.count}</span>
        </div>
      ))}
    </div>
  )
}

export default function WordDrivers({ data }) {
  const { tip, hoverProps } = useTooltip()

  return (
    <section className="card span-12">
      <h2>What drove the score</h2>
      <p className="sub">
        Most common scored words across the 50 titles, counted by how many titles each
        appeared in.
      </p>

      <div className="two-col">
        <div>
          <h3 className="col-head">
            <span className="dot positive" /> Pushing it up
          </h3>
          <WordList items={data.topWords.positive} tone="pos" hoverProps={hoverProps} />
        </div>
        <div>
          <h3 className="col-head">
            <span className="dot negative" /> Pulling it down
          </h3>
          <WordList items={data.topWords.negative} tone="neg" hoverProps={hoverProps} />
        </div>
      </div>

      <Tooltip tip={tip} />
    </section>
  )
}
