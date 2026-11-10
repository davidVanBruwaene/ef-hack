// Proposes a mission as the agent, shows its member the approval link as a QR code, and saves it for proxy.mjs. Usage: node mission.mjs ["<text>"], with the text required on the people network
import QRCode from 'qrcode'
import { DEFAULT_MISSION, LOOPBACK, PS } from './config.mjs'
import { requestMission, saveMission } from './missions.mjs'

if (!process.argv[2] && (process.env.RP_ID || process.env.STORE_URL)) {
  console.error(`✗ Say what the agent should do: npm run mission -- "<text>". The default mission is about alice.json's Alice, who is not on the people network.`)
  process.exit(1)
}
const description = process.argv[2] ?? DEFAULT_MISSION
console.log(`Proposing to ${PS}:\n  "${description}"\n`)

const m = await requestMission(description, {
  onInteraction: async (url, code) => {
    const link = `${url}?code=${encodeURIComponent(code)}`
    console.log(await QRCode.toString(link, { type: 'terminal', small: true }))
    const port = LOOPBACK[new URL(url).hostname]
    const local = port ? `\nOn this machine: http://127.0.0.1:${port}${new URL(url).pathname}?code=${encodeURIComponent(code)}` : ''
    console.log(`Open ${link} on a phone signed in to the console, or scan the code${local}\n(code ${code}). Waiting for an answer…`)
  },
}).catch(err => { console.error(`✗ ${err.message}`); process.exit(1) })

saveMission(m)
console.log(`\n✓ Approved mission ${m.s256}`)
console.log(`  "${m.blob.description}"`)
console.log(`  expires ${m.blob.expires_at}. Saved to .keys/mission.json; the proxy runs under it.`)
