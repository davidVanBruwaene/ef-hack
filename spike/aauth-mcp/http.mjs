import { createServer, request } from 'node:http'
import { pathToFileURL } from 'node:url'

export const logger = party => (...a) => console.log(new Date().toISOString().slice(11, 19), `[${party}]`, ...a)
export const short = s => (s ? `${s.slice(0, 8)}…` : '(none)')
export const isMain = meta => process.argv[1] && meta.url === pathToFileURL(process.argv[1]).href

export function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}

export function listen(port, handler, log) {
  const server = createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch(err => {
      log('✗ handler error:', err.stack ?? err)
      if (!res.headersSent) json(res, 500, { error: 'server_error', error_description: String(err.message ?? err) })
    })
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

export async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}

// Sends the request on to a local port unchanged, Host header included, and returns the whole response.
export function forward(req, body, port) {
  return new Promise((resolve, reject) => {
    const upstream = request({ host: '127.0.0.1', port, method: req.method, path: req.url, headers: req.headers }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 502, headers: res.headers, body: Buffer.concat(chunks) }))
      res.on('error', reject)
    })
    upstream.on('error', reject)
    upstream.end(body.length ? body : undefined)
  })
}

export function relay(res, upstream) {
  res.writeHead(upstream.status, upstream.headers)
  res.end(upstream.body)
}
