// Signs a phone in as Bob at his person server: prints a one-time link as a QR code. Usage: node pair.mjs
import QRCode from 'qrcode'
import { consoleToken } from './bob-state.mjs'
import { BOB_NAME, LOOPBACK, PORTS, PS } from './config.mjs'

const local = LOOPBACK[new URL(PS).hostname] ? `http://127.0.0.1:${PORTS.ps}` : undefined
const res = await fetch(`${local ?? PS}/api/pair`, { method: 'POST', headers: { authorization: `Bearer ${consoleToken()}` } })
  .catch(err => ({ ok: false, status: err.cause?.code ?? err.message }))
if (!res.ok) {
  console.error(`✗ ${PS} answered ${res.status}. Start Bob's side first: npm run bob, or npm run world.`)
  process.exit(1)
}
const { url, code, expires_at: expiresAt } = await res.json()
console.log(await QRCode.toString(url, { type: 'terminal', small: true }))
console.log(`${BOB_NAME}: scan this with your phone, or open ${url}${local ? `\nOn this machine: ${local}/pair?code=${code}` : ''}`)
console.log(`It works once, until ${new Date(expiresAt).toLocaleTimeString()}. That browser then answers for ${BOB_NAME} at ${PS}/bob for seven days.`)
