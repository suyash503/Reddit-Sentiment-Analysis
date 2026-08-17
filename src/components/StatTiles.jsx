import { percent, compact } from '../lib/format.js'

export default function StatTiles({ data }) {
  const tiles = [
    {
      label: 'Posts analysed',
      value: data.total,
      foot: 'top hot posts',
    },
    {
      label: 'Positive titles',
      value: percent(data.share.positive),
      foot: `${data.counts.positive} of ${data.total}`,
    },
    {
      label: 'Negative titles',
      value: percent(data.share.negative),
      foot: `${data.counts.negative} of ${data.total}`,
    },
    {
      // Worth showing honestly: AFINN only knows ~3300 words, so plenty of
      // titles have nothing for it to score.
      label: 'Titles with scored words',
      value: percent(data.coverage),
      foot: `${compact(Math.round(data.coverage * data.total))} matched the lexicon`,
    },
  ]

  return (
    <div className="tiles">
      {tiles.map((tile) => (
        <div className="card tile" key={tile.label}>
          <div className="label">{tile.label}</div>
          <div className="value">{tile.value}</div>
          <div className="foot">{tile.foot}</div>
        </div>
      ))}
    </div>
  )
}
