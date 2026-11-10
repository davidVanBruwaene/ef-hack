// The person server's /api as the console server calls it, naming the member who answers; the checks answer through it.
import { consoleToken } from './bob-state.mjs'
import { LOOPBACK, PORTS, PS } from './config.mjs'

const local = () => (LOOPBACK[new URL(PS).hostname] ? `http://127.0.0.1:${PORTS.ps}/api` : `${PS}/api`)

export function psApi(base = local()) {
  const call = async (path, body) => {
    const res = await fetch(`${base}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${consoleToken()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!res.ok) throw new Error(`the person server's /api${path} answered ${res.status} ${(await res.text()).slice(0, 160)}`)
    return res.json()
  }
  return {
    call,
    state: member => call(`/state${member ? `?member=${encodeURIComponent(member)}` : ''}`),
    // As a member following the interaction link: the code names the request, and an unbound agent's first mission needs it.
    async answerCode(code, decision, member, extra = {}) {
      const x = await call(`/codes/${encodeURIComponent(code)}`)
      return x.kind === 'mission'
        ? call(`/missions/${x.mission.id}`, { decision, member, code, ...extra })
        : call(`/reviews/${x.review.id}`, { decision, member })
    },
  }
}
