// Switches mockin to require Bob's consent, runs client-check.mjs, approves via the consent link after 2s, then restores auto-approve.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { PORTS } from './config.mjs'

const mock = body => fetch(`http://127.0.0.1:${PORTS['ps.aauth.test']}/mock/aauth`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
await mock({ person_requirement: 'interaction', auto_approve: false })

const child = spawn(process.execPath, [fileURLToPath(new URL('./client-check.mjs', import.meta.url)), 'granted'], {
  stdio: ['ignore', 'pipe', 'pipe'],
})
let out = ''
child.stdout.on('data', b => { out += b })
child.stderr.on('data', b => {
  const s = b.toString()
  process.stderr.write(s)
  const m = s.match(/consent needed: open (\S+)/)
  if (!m) return
  const url = new URL(m[1])
  setTimeout(async () => {
    // Stands in for Bob's phone opening the link from a QR code.
    const res = await fetch(`http://127.0.0.1:${PORTS[url.hostname]}${url.pathname}${url.search}`)
    console.error(`[bob] opened ${url.origin}${url.pathname}?code=… after 2s: HTTP ${res.status}`)
  }, 2000)
})
child.on('exit', async code => {
  await mock({ person_requirement: null, auto_approve: true })
  console.log(out.trim())
  console.log(`client exit ${code}`)
  process.exitCode = code ?? 1
})
