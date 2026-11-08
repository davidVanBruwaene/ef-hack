// Named Cloudflare tunnels for two laptops: writes one side's cloudflared config from .env, or checks the public hostnames. See two-laptops.md.
import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { AGENT, PORTS, PS, RESOURCE } from './config.mjs'

const USAGE = `usage: node tunnel.mjs config bob|alice [--tunnel <name or id>] [--credentials <file>] [--out <file>]
       node tunnel.mjs check`

const SERVERS = {
  ps: { id: PS, port: PORTS.ps, metadata: '/.well-known/aauth-person.json', what: "Bob's person server" },
  agent: { id: AGENT, port: PORTS.agent, metadata: '/.well-known/aauth-agent.json', what: "Bob's agent provider" },
  resource: { id: RESOURCE, port: PORTS.resource, metadata: '/.well-known/aauth-resource.json', what: "Alice's server" },
}
// mockin's port is absent on purpose: only the front on PORTS.ps may reach it.
const SIDES = {
  bob: { label: "Bob's", tunnel: 'ef-hack-bob', servers: [SERVERS.ps, SERVERS.agent] },
  alice: { label: "Alice's", tunnel: 'ef-hack-alice', servers: [SERVERS.resource] },
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const fail = msg => { console.error(`✗ ${msg}`); process.exit(1) }

// §11.1.1: https, lowercase, scheme and host only.
function publicHost({ id, what }) {
  const u = new URL(id)
  if (u.protocol !== 'https:' || u.port || id !== u.origin || id !== id.toLowerCase()) {
    fail(`${what} is ${id}, but an AAuth identifier is https://<host>, lowercase, with no port or path`)
  }
  if (u.hostname.endsWith('.aauth.test')) {
    fail(`${what} is still ${id}, the loopback default. Set AAUTH_PS, AAUTH_AGENT and AAUTH_RESOURCE in .env at the repo root to the public hostnames.`)
  }
  return u.hostname
}

function checkDistinct() {
  const hosts = Object.values(SERVERS).map(s => new URL(s.id).hostname)
  if (new Set(hosts).size !== hosts.length) fail(`AAUTH_PS, AAUTH_AGENT and AAUTH_RESOURCE need three different hostnames; got ${hosts.join(', ')}`)
}

function config(sideName, flags) {
  const side = SIDES[sideName] ?? fail(`the side is bob or alice, not "${sideName ?? ''}"\n${USAGE}`)
  checkDistinct()
  const tunnel = flags.tunnel ?? side.tunnel
  const credentials = flags.credentials ? resolve(flags.credentials)
    : UUID.test(tunnel) ? join(homedir(), '.cloudflared', `${tunnel}.json`) : undefined
  const hosts = side.servers.map(publicHost)
  const yaml = [
    `# ${side.label} side, written by spike/aauth-mcp/tunnel.mjs from .env and the local ports. Rerun it after changing either.`,
    `tunnel: ${JSON.stringify(tunnel)}`,
    ...(credentials ? [`credentials-file: ${JSON.stringify(credentials)}`] : []),
    'ingress:',
    ...side.servers.flatMap((s, i) => [`  - hostname: ${hosts[i]}`, `    service: http://127.0.0.1:${s.port}`]),
    '  - service: http_status:404',
    '',
  ].join('\n')

  if (flags.out) writeFileSync(flags.out, yaml)
  else process.stdout.write(yaml)
  const file = flags.out ?? '<this config>'
  console.error([
    flags.out ? `wrote ${flags.out}` : '',
    credentials ? '' : `No credentials-file: cloudflared finds "${tunnel}" by name only on a laptop logged in to the account. Elsewhere pass --tunnel <id>, or run with --token.`,
    'Once, on a laptop logged in to Cloudflare (cloudflared tunnel login):',
    ...(UUID.test(tunnel) ? [] : [`  cloudflared tunnel create ${tunnel}`]),
    ...hosts.map(h => `  cloudflared tunnel route dns ${tunnel} ${h}`),
    'Each run, from spike/aauth-mcp:',
    `  npm run ${sideName}`,
    `  cloudflared tunnel --config ${file} run`,
    '  node tunnel.mjs check',
  ].filter(Boolean).join('\n'))
}

// Cloudflare's answers when the hop behind a hostname is missing.
const STATUS_HINTS = {
  404: "the tunnel has no ingress rule for this hostname: rerun tunnel.mjs config on that side and restart cloudflared",
  502: 'the tunnel is up but nothing answers on the local port: start npm run bob or npm run alice on that side',
  530: 'no tunnel is connected for this hostname: start cloudflared on that side',
}
const ERROR_HINTS = {
  ENOTFOUND: 'no DNS record for this hostname yet: cloudflared tunnel route dns, then allow a few minutes for caches',
  ERR_TLS_CERT_ALTNAME_INVALID: "no certificate covers this hostname: Cloudflare's Universal SSL covers only one level under the zone",
}

async function check() {
  checkDistinct()
  let bad = 0
  for (const s of Object.values(SERVERS)) {
    publicHost(s)
    const url = `${s.id}${s.metadata}`
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      const body = await res.json().catch(() => ({}))
      const ok = res.status === 200 && body.issuer === s.id
      const why = ok ? '' : STATUS_HINTS[res.status]
        ?? (res.status === 200 ? `issuer is ${body.issuer ?? 'missing'}: the server there was started with other AAUTH_* values, or the ingress points at the wrong port` : '')
      if (!ok) bad++
      console.log(`${ok ? '✓' : '✗'} ${s.what}: ${url} answered ${res.status}${why ? `; ${why}` : ''}`)
    } catch (err) {
      bad++
      const code = err.cause?.code ?? err.name
      console.log(`✗ ${s.what}: ${url} failed with ${code}${ERROR_HINTS[code] ? `; ${ERROR_HINTS[code]}` : `: ${err.cause?.message ?? err.message}`}`)
    }
  }
  console.log(bad ? `${bad} of 3 unreachable as configured` : 'all 3 hostnames reach the right servers')
  process.exitCode = bad ? 1 : 0
}

const [mode, ...rest] = process.argv.slice(2)
const flags = {}
const positional = []
for (let i = 0; i < rest.length; i++) {
  const m = rest[i].match(/^--(tunnel|credentials|out)$/)
  if (m) flags[m[1]] = rest[++i] ?? fail(`--${m[1]} needs a value\n${USAGE}`)
  else positional.push(rest[i])
}
if (mode === 'config') config(positional[0], flags)
else if (mode === 'check') await check()
else fail(USAGE)
