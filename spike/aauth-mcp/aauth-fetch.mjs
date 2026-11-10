// The agent's fetch toward a resource: AAuth signing and token flows (@aauth/agent), the tool call's reason as the justification, and asking again without the scopes the person server refused.
import { createAAuthFetch } from '@aauth/agent'
import { serializeAuthFlows } from '@aauth/mcp-stdio'
import { PS } from './config.mjs'

// The person server refuses a whole token request over any one item; the detail lists the item scopes it refused in brackets.
const REFUSED = /\[((?:item:[^\s\]]+ ?)+)\]/
const withHeader = (headers, name, value) => { const h = new Headers(headers); h.set(name, value); return h }

const reasonOf = body => {
  try { const r = JSON.parse(body)?.params?.arguments?.reason; return typeof r === 'string' && r ? r : undefined } catch { return undefined }
}

// The reason quotes the member's mission, so it goes into the tool result here and never to the resource, which learns only the scopes.
async function addReasons(res, reasons) {
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) return res
  const body = await res.json()
  for (const msg of Array.isArray(body) ? body : [body]) {
    const part = msg?.result?.content?.find?.(c => c.type === 'text')
    if (!part) continue
    try { part.text = JSON.stringify({ ...JSON.parse(part.text), refused_why: reasons.join(' ') }, null, 2) } catch { part.text += `\n${reasons.join(' ')}` }
  }
  const headers = new Headers(res.headers)
  headers.delete('content-length')
  headers.delete('content-encoding')
  return new Response(JSON.stringify(body), { status: res.status, headers })
}

export function agentFetch({ getKeyMaterial, missionS256, onInteraction, say = () => {} }) {
  // A tool call's `reason` goes to the person server as the -11 justification; toJSON reads it when the token request is serialized.
  let reason
  const justification = { toJSON: () => reason }
  // Inside serializeAuthFlows, so only one POST, and its auth flow, runs at a time.
  const withReason = inner => async (url, init) => {
    if (init?.method !== 'POST') return inner(url, init)
    reason = typeof init.body === 'string' ? reasonOf(init.body) : undefined
    try { return await inner(url, init) } finally { reason = undefined }
  }
  const withRefusals = inner => async (url, init) => {
    const refused = [], reasons = []
    for (;;) {
      try {
        const res = await inner(url, refused.length ? { ...init, headers: withHeader(init.headers, 'x-refused-scopes', refused.join(' ')) } : init)
        return reasons.length ? addReasons(res, reasons) : res
      } catch (err) {
        const named = init?.method === 'POST' && err?.error === 'denied' ? REFUSED.exec(err.detail ?? '')?.[1].trim().split(' ') ?? [] : []
        if (!named.length || named.some(s => refused.includes(s)) || reasons.length >= 3) throw err
        say(`${PS} refused [${named.join(' ')}]; asking again without them`)
        refused.push(...named)
        reasons.push(err.detail)
      }
    }
  }
  return serializeAuthFlows(withRefusals(withReason(createAAuthFetch({
    getKeyMaterial,
    personServerUrl: PS,
    justification,
    ...(missionS256 ? { missionS256 } : {}),
    ...(onInteraction ? { onInteraction } : {}),
    ...(process.env.AAUTH_DEBUG ? { onEvent: e => say(JSON.stringify(e).slice(0, 300)) } : {}),
  }))))
}
