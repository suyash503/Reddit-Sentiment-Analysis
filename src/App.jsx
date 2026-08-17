import { useEffect, useRef, useState } from 'react'
import { getHotPosts, cleanName } from './lib/reddit.js'
import { analyzePosts } from './lib/sentiment.js'
import { samplePosts, SAMPLE_SUB } from './lib/sampleData.js'
import StatTiles from './components/StatTiles.jsx'
import VibeScore from './components/VibeScore.jsx'
import MoodSplit from './components/MoodSplit.jsx'
import ScoreSpread from './components/ScoreSpread.jsx'
import Engagement from './components/Engagement.jsx'
import WordDrivers from './components/WordDrivers.jsx'
import PostTable from './components/PostTable.jsx'

const PRESETS = ['AskReddit', 'worldnews', 'aww', 'technology', 'wallstreetbets', 'india']

export default function App() {
  const [input, setInput] = useState('AskReddit')
  const [sub, setSub] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isSample, setIsSample] = useState(false)
  // start from whatever the OS is set to, then remember what the user picks
  const [theme, setTheme] = useState(
    () =>
      localStorage.getItem('vibe-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  )

  // keeps an old request from overwriting a newer one
  const request = useRef(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('vibe-theme', theme)
  }, [theme])

  async function load(name) {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller

    setLoading(true)
    setError(null)

    try {
      const result = await getHotPosts(name, controller.signal)
      setSub(result.sub)
      setInput(result.sub)
      setData(analyzePosts(result.posts))
      setIsSample(false)
    } catch (err) {
      if (err.name === 'AbortError') return
      setError(err.message)
      // If the very first load fails there's nothing on screen at all, which
      // makes the app look broken rather than blocked. Show the bundled posts
      // instead - the banner above them says plainly that they aren't live.
      if (!data) showSample(true)
    } finally {
      if (request.current === controller) setLoading(false)
    }
  }

  // Load something on first paint so the dashboard isn't a blank page.
  useEffect(() => {
    load('AskReddit')
    return () => request.current?.abort()
  }, [])

  // keepError is for the automatic fallback above, where the error explains
  // why you're looking at sample data in the first place.
  function showSample(keepError = false) {
    request.current?.abort()
    setLoading(false)
    if (!keepError) setError(null)
    setSub(SAMPLE_SUB)
    setData(analyzePosts(samplePosts))
    setIsSample(true)
  }

  const current = cleanName(input)

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <h1>The Subreddit Vibe Check</h1>
          <p>
            Pulls the top 50 hot posts from any subreddit and scores the mood of every
            title in your browser, with AFINN word ratings.
          </p>
        </div>
        <button
          className="theme-toggle"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </header>

      <div className="search">
        <form
          className="search-row"
          onSubmit={(e) => {
            e.preventDefault()
            load(input)
          }}
        >
          <label className="field">
            <span>r/</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="subreddit name"
              aria-label="Subreddit name"
              autoComplete="off"
              spellCheck="false"
            />
          </label>
          <button className="btn" type="submit" disabled={loading || !current}>
            {loading ? 'Checking…' : 'Check the vibe'}
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={() => load(sub || input)}
            disabled={loading || !sub || isSample}
          >
            Refresh
          </button>
        </form>

        <div className="presets">
          <span className="label">Try:</span>
          {PRESETS.map((preset) => (
            <button
              key={preset}
              className="chip"
              aria-current={sub?.toLowerCase() === preset.toLowerCase()}
              onClick={() => {
                setInput(preset)
                load(preset)
              }}
            >
              r/{preset}
            </button>
          ))}
          <button className="chip" onClick={() => showSample()}>
            Use sample data
          </button>
        </div>
      </div>

      {error && (
        <div className="notice error">
          <strong>Couldn't load that.</strong> {error}{' '}
          <button className="chip" onClick={() => showSample()}>
            Use sample data instead
          </button>
        </div>
      )}

      {isSample && (
        <div className="notice demo">
          <strong>Sample data.</strong> These 50 posts are bundled with the app, not
          fetched from Reddit. Search a subreddit above for live results.
        </div>
      )}

      {data ? (
        <div className="results" data-busy={loading}>
          <StatTiles data={data} />
          <div className="grid">
            <VibeScore data={data} sub={sub} />
            <MoodSplit data={data} />
            <ScoreSpread data={data} />
            <Engagement data={data} />
            <WordDrivers data={data} />
            <PostTable posts={data.posts} />
          </div>
        </div>
      ) : (
        !error && (
          <div className="placeholder">
            <h2>{loading ? 'Fetching posts…' : 'Pick a subreddit to get started'}</h2>
            <p>The top 50 hot posts get scored as soon as they land.</p>
          </div>
        )
      )}

      <footer className="footer">
        Sentiment from AFINN-165 via the <code>sentiment</code> package. Titles only, no
        comment text. Built for the SportsOrca assignment.
      </footer>
    </div>
  )
}
