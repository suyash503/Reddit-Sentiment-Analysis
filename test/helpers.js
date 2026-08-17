import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

// fileURLToPath, not the pathname off a URL - the latter leaves %20 in the path
// and this folder lives under a username with a space in it.
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const handlerPath = join(root, 'api', 'reddit.js')

// The handler caches its OAuth token in module scope, which is the right thing
// for a warm function and the wrong thing for tests - so each test that cares
// imports its own copy.
let counter = 0
export async function loadHandler() {
  const url = `${pathToFileURL(handlerPath).href}?copy=${counter++}`
  return (await import(url)).default
}

// Just enough of Vercel's res object for the handler to talk to.
export function fakeRes() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(key, value) {
      this.headers[key] = value
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
  }
}

export function listingOf(posts) {
  return { kind: 'Listing', data: { children: posts.map((p) => ({ kind: 't3', data: p })) } }
}

export function post(i) {
  return {
    id: `p${i}`,
    title: `Post number ${i}`,
    author: 'someone',
    ups: 100 + i,
    num_comments: i,
    created_utc: 1786957499,
    permalink: `/r/javascript/comments/p${i}/post_number_${i}/`,
    over_18: false,
  }
}

// Canned upstream responses.
export const reply = {
  json: (payload, status = 200) => ({
    ok: status < 400,
    status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  }),
  // what Reddit actually sends a datacenter IP
  blocked: () => ({
    ok: false,
    status: 403,
    text: async () => '<body class="blocked">Blocked</body>',
  }),
  dead: () => {
    throw new Error('ECONNREFUSED')
  },
}

/** Swap in a fake fetch, remember every call, and put the real one back after. */
export function stubFetch(handler) {
  const calls = []
  const original = globalThis.fetch

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options })
    return handler(String(url), options, calls.length - 1)
  }

  return {
    calls,
    restore: () => {
      globalThis.fetch = original
    },
  }
}
