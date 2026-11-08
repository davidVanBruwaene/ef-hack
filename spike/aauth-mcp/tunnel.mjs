// Named Cloudflare tunnels for two laptops: writes one side's cloudflared config from .env, or checks the public hostnames. See two-laptops.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { AGENT, PORTS, PS, RESOURCE } from './config.mjs'

const USAGE = `usage: node tunnel.mjs config bob|alice [--credentials <tunnel .json>] [--tunnel <name or id>] [--console <port>] [--out <file> [--force]]
       node tunnel.mjs check`

const SERVERS = {
  ps: { id: PS, port: PORTS.ps, metadata: '/.well-known/aauth-person.json', what: "Bob's person server" },
  agent: { id: AGENT, port: PORTS.agent, metadata: '/.well-known/aauth-agent.json', what: "Bob's agent provider" },
  resource: { id: RESOURCE, port: PORTS.resource, metadata: '/.well-known/aauth-resource.json', what: "Alice's server" },
}
// mockin's port is absent on purpose: only the front on PORTS.ps may reach it.
const SIDES = {
  bob: { label: "Bob's", tunnel: 'parley-bob', servers: [SERVERS.ps, SERVERS.agent] },
  alice: { label: "Alice's", tunnel: 'parley-alice', servers: [SERVERS.resource] },
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_CONFIG = join(homedir(), '.cloudflared', 'config.yml')
// The console is not an AAuth server; its hostname is the passkey RP_ID that the store reads.
const CONSOLE_HOST = process.env.RP_ID?.trim()

const fail = msg => { console.error(`✗ ${msg}`); process.exit(1) }
// A quoted ~ reaches node unexpanded.
const expand = p => resolve(p.replace(/^~(?=$|\/)/, homedir()))

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

function consoleHost() {
  if (!CONSOLE_HOST) fail("--console needs RP_ID, the console's hostname, in .env at the repo root")
  if (CONSOLE_HOST !== CONSOLE_HOST.toLowerCase() || !/^[a-z0-9.-]+$/.test(CONSOLE_HOST)) fail(`RP_ID is "${CONSOLE_HOST}", which is not a lowercase hostname`)
  return CONSOLE_HOST
}

function checkDistinct() {
  const hosts = [...Object.values(SERVERS).map(s => new URL(s.id).hostname), ...(CONSOLE_HOST ? [CONSOLE_HOST] : [])]
  if (new Set(hosts).size !== hosts.length) fail(`AAUTH_PS, AAUTH_AGENT, AAUTH_RESOURCE and RP_ID need different hostnames; got ${hosts.join(', ')}`)
}

// The id comes from the credentials file; the secret in it is never printed.
function tunnelOf(flags, side) {
  if (!flags.credentials) {
    const tunnel = flags.tunnel ?? side.tunnel
    return { tunnel, credentials: UUID.test(tunnel) ? join(homedir(), '.cloudflared', `${tunnel}.json`) : undefined }
  }
  const credentials = expand(flags.credentials)
  let raw, id
  try { raw = readFileSync(credentials, 'utf8') } catch (err) { fail(`cannot read ${credentials}: ${err.code}`) }
  try { id = JSON.parse(raw).TunnelID } catch { fail(`${credentials} is not a cloudflared credentials file`) }
  if (!flags.tunnel && !UUID.test(id ?? '')) fail(`${credentials} has no TunnelID; pass --tunnel <id>`)
  return { tunnel: flags.tunnel ?? id, credentials }
}

function config(sideName, flags) {
  const side = SIDES[sideName] ?? fail(`the side is bob or alice, not "${sideName ?? ''}"\n${USAGE}`)
  if (flags.console && sideName !== 'alice') fail("--console belongs on Alice's side, which serves the console")
  if (flags.console && !/^\d+$/.test(flags.console)) fail(`--console takes the console's local port, not "${flags.console}"`)
  const out = flags.out && expand(flags.out)
  if (out === DEFAULT_CONFIG) fail(`--out must not be ${DEFAULT_CONFIG}: it is cloudflared's default and names another tunnel. Write a parley file, such as ~/.cloudflared/parley-${sideName}.yml.`)
  checkDistinct()
  const { tunnel, credentials } = tunnelOf(flags, side)
  const routes = side.servers.map(s => ({ host: publicHost(s), port: s.port }))
  if (flags.console) routes.push({ host: consoleHost(), port: Number(flags.console) })
  const yaml = [
    `# ${side.label} side, written by spike/aauth-mcp/tunnel.mjs from .env and the local ports. Rerun it after changing either.`,
    `tunnel: ${JSON.stringify(tunnel)}`,
    ...(credentials ? [`credentials-file: ${JSON.stringify(credentials)}`] : []),
    'ingress:',
    ...routes.flatMap(r => [`  - hostname: ${r.host}`, `    service: http://127.0.0.1:${r.port}`]),
    '  - service: http_status:404',
    '',
  ].join('\n')

  let note = ''
  if (!out) process.stdout.write(yaml)
  else if (!existsSync(out) || flags.force) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, yaml); note = `wrote ${out}` }
  else if (readFileSync(out, 'utf8') === yaml) note = `${out} is already up to date`
  else fail(`${out} exists with other contents. Look at it, then add --force to replace it.`)

  const file = out ?? '<this config>'
  console.error([
    note,
    credentials ? '' : `No credentials-file: cloudflared then finds "${tunnel}" by name, which needs cert.pem from cloudflared tunnel login. On another laptop pass --credentials <the tunnel's .json>.`,
    existsSync(DEFAULT_CONFIG) ? 'cloudflared falls back to ~/.cloudflared/config.yml whenever --config is missing, so pass --config on every cloudflared command, route dns included.' : '',
    sideName === 'alice' && !flags.console ? `No console route: add --console <port> to serve ${CONSOLE_HOST ?? 'the RP_ID hostname'} from this tunnel.` : '',
    'Each run, from spike/aauth-mcp:',
    `  npm run ${sideName}`,
    `  cloudflared tunnel --config ${file} run`,
    '  node tunnel.mjs check',
  ].filter(Boolean).join('\n'))
}

// Cloudflare's answers when the hop behind a hostname is missing.
const STATUS_HINTS = {
  404: 'the tunnel has no ingress rule for this hostname: rerun tunnel.mjs config on that side and restart cloudflared',
  502: 'the tunnel is up but nothing answers on the local port: start that side\'s server',
  530: 'no tunnel is connected for this hostname: start cloudflared on that side',
}
const ERROR_HINTS = {
  ENOTFOUND: 'no DNS answer here. If dig @1.1.1.1 <host> answers, this resolver cached the miss for up to 30 minutes; if not, run route dns',
  ERR_TLS_CERT_ALTNAME_INVALID: "no certificate covers this hostname: Cloudflare's Universal SSL covers only one level under the zone",
}

async function check() {
  checkDistinct()
  const targets = Object.values(SERVERS).map(s => ({ ...s, host: publicHost(s), url: `${s.id}${s.metadata}` }))
  if (CONSOLE_HOST) targets.push({ what: "Alice's console", host: consoleHost(), url: `https://${CONSOLE_HOST}/` })
  let bad = 0
  for (const t of targets) {
    try {
      const res = await fetch(t.url, { signal: AbortSignal.timeout(10_000), redirect: 'manual' })
      const body = t.id ? await res.json().catch(() => ({})) : {}
      const ok = t.id ? res.status === 200 && body.issuer === t.id : res.status >= 200 && res.status < 400
      const why = ok ? '' : STATUS_HINTS[res.status]
        ?? (t.id && res.status === 200 ? `issuer is ${body.issuer ?? 'missing'}: the server there was started with other AAUTH_* values, or the ingress points at the wrong port` : '')
      if (!ok) bad++
      console.log(`${ok ? '✓' : '✗'} ${t.what}: ${t.url} answered ${res.status}${why ? `; ${why}` : ''}`)
    } catch (err) {
      bad++
      const code = err.cause?.code ?? err.name
      console.log(`✗ ${t.what}: ${t.url} failed with ${code}${ERROR_HINTS[code] ? `; ${ERROR_HINTS[code]}` : `: ${err.cause?.message ?? err.message}`}`)
    }
  }
  console.log(bad ? `${bad} of ${targets.length} hostnames do not reach the right server` : `all ${targets.length} hostnames reach the right servers`)
  process.exitCode = bad ? 1 : 0
}

const [mode, ...rest] = process.argv.slice(2)
const flags = {}
const positional = []
for (let i = 0; i < rest.length; i++) {
  const m = rest[i].match(/^--(tunnel|credentials|console|out|force)$/)
  if (!m) positional.push(rest[i])
  else if (m[1] === 'force') flags.force = true
  else flags[m[1]] = rest[++i] ?? fail(`--${m[1]} needs a value\n${USAGE}`)
}
if (mode === 'config') config(positional[0], flags)
else if (mode === 'check') await check()
else fail(USAGE)
