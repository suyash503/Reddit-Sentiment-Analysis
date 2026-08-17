import { useMemo, useState } from 'react'
import { score as fmtScore, compact, timeAgo } from '../lib/format.js'

const MOOD_ORDER = { negative: 0, neutral: 1, positive: 2 }

const COLUMNS = [
  { key: 'rank', label: '#', num: true },
  { key: 'title', label: 'Title', sort: false },
  { key: 'label', label: 'Mood' },
  { key: 'score', label: 'Score', num: true },
  { key: 'words', label: 'Matched words', sort: false },
  { key: 'ups', label: 'Upvotes', num: true },
  { key: 'comments', label: 'Comments', num: true },
]

// Every number in the charts is also in here, which keeps the dashboard
// readable if you can't tell the colours apart.
export default function PostTable({ posts }) {
  const [sort, setSort] = useState({ key: 'rank', dir: 'asc' })
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = needle
      ? posts.filter((p) => p.title.toLowerCase().includes(needle))
      : posts

    const sorted = [...filtered].sort((a, b) => {
      const get = (p) => (sort.key === 'label' ? MOOD_ORDER[p.label] : p[sort.key])
      const diff = get(a) - get(b)
      return sort.dir === 'asc' ? diff : -diff
    })
    return sorted
  }, [posts, sort, query])

  function toggleSort(key) {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'rank' ? 'asc' : 'desc' },
    )
  }

  return (
    <section className="card span-12">
      <div className="table-head">
        <div>
          <h2>Every post, scored</h2>
          <p className="sub">
            Click a column to sort. Titles link straight to the thread on Reddit.
          </p>
        </div>
        <input
          className="search-small"
          type="search"
          value={query}
          placeholder="Search these titles"
          aria-label="Search titles"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} className={col.num ? 'num' : ''}>
                  {col.sort === false ? (
                    col.label
                  ) : (
                    <button
                      onClick={() => toggleSort(col.key)}
                      aria-label={`Sort by ${col.label}`}
                    >
                      {col.label}
                      {sort.key === col.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((post) => (
              <tr key={post.id}>
                <td className="num">{post.rank}</td>
                <td>
                  <a
                    className="post-title"
                    href={post.link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {post.title}
                  </a>
                  <div className="meta">
                    u/{post.author} &middot; {timeAgo(post.created)}
                    {post.flair ? ` · ${post.flair}` : ''}
                  </div>
                </td>
                <td>
                  <span className="tag">
                    <span className={`dot ${post.label}`} />
                    {post.label}
                  </span>
                </td>
                <td className="num">{fmtScore(post.score)}</td>
                <td>
                  <div className="words">
                    {post.positiveWords.slice(0, 3).map((word, i) => (
                      <span className="word pos" key={`p${i}${word}`}>
                        {word}
                      </span>
                    ))}
                    {post.negativeWords.slice(0, 3).map((word, i) => (
                      <span className="word neg" key={`n${i}${word}`}>
                        {word}
                      </span>
                    ))}
                    {post.matched === 0 && <span className="empty-note">none</span>}
                  </div>
                </td>
                <td className="num">{compact(post.ups)}</td>
                <td className="num">{compact(post.comments)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="empty-note">No titles match "{query}".</p>}
      </div>
    </section>
  )
}
