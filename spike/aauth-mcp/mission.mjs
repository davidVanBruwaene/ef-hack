// Proposes a mission as Bob's agent, shows Bob the approval link as a QR code, and saves it for proxy.mjs. Usage: node mission.mjs ["<text>"]
import QRCode from 'qrcode'
import { DEFAULT_MISSION, LOOPBACK, PS } from './config.mjs'
import { requestMission, saveMission } from './missions.mjs'

const description = process.argv[2] ?? DEFAULT_MISSION
console.log(`Proposing to ${PS}:\n  "${description}"\n`)

const m = await requestMission(description, {
  onInteraction: async (url, code) => {
    const link = `${url}?code=${encodeURIComponent(code)}`
    console.log(await QRCode.toString(link, { type: 'terminal', small: true }))
    const port = LOOPBACK[new URL(url).hostname]
    const local = port ? `\nOn this machine: http://127.0.0.1:${port}/interact?code=${encodeURIComponent(code)}` : ''
    console.log(`Bob: scan the code, or open ${link}${local}\n(code ${code}). Waiting for your answer…`)
  },
}).catch(err => { console.error(`✗ ${err.message}`); process.exit(1) })

saveMission(m)
console.log(`\n✓ Approved mission ${m.s256}`)
console.log(`  "${m.blob.description}"`)
console.log(`  expires ${m.blob.expires_at}. Saved to .keys/mission.json; the proxy runs under it.`)
