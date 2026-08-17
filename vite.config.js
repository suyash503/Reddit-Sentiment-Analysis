import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The dev server proxies Reddit so the browser never makes a cross-origin call.
// Reddit's API etiquette asks for a descriptive User-Agent that names the author.
//
// /relay is the backup: Reddit hands out 403s to a lot of networks (mine
// included, on college wifi), and going through a public relay from the dev
// server gets around it without the browser ever hitting CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/reddit': {
        target: 'https://www.reddit.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/reddit/, ''),
        headers: {
          'User-Agent': 'web:vibe-check-dashboard:v1.0.0 (by /u/BigBag2433)',
        },
      },
      '/relay': {
        target: 'https://api.allorigins.win',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/relay/, ''),
      },
    },
  },
})
