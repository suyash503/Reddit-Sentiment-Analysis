import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The dev server proxies Reddit so the browser never makes a cross-origin call.
// Reddit's API etiquette asks for a descriptive User-Agent that names the author.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/reddit': {
        target: 'https://www.reddit.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/reddit/, ''),
        headers: {
          'User-Agent': 'web:subreddit-vibe-check:v1.0.0 (by /u/BigBag2433)',
        },
      },
    },
  },
})
