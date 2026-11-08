// Bob's demo mission, token requests for Alice's items (scope item:<id>), and a stand-in for OpenRouter.
export const AGENT = 'aauth:claude@bob-agent.aauth.test'
export const RESOURCE = 'https://alice.aauth.test'
export const S256 = 'fixture-mission-s256'
export const NOW = Date.parse('2026-11-08T00:00:00Z')
export const MODEL = 'typesafe/jev-1.14-20261014'
export const TEST_KEY = 'test-key-not-a-real-key-0000'
export const TEST_ENV = { OPENROUTER_API_KEY: TEST_KEY }

export const blob = {
  agent: AGENT,
  approved_at: '2026-11-07T23:00:00.000Z',
  expires_at: '2026-11-08T23:00:00.000Z',
  description: 'I met Alice at the hackathon. Check whether we should talk, and if so book 30 minutes.',
  approved_resources: [RESOURCE],
}

export const record = (b = blob, extra = {}) => ({
  id: 'm_fixture', s256: S256, status: 'approved', blob_b64: Buffer.from(JSON.stringify(b)).toString('base64url'), ...extra,
})
export const mission = record()

export const tokenRequest = (scope, justification) => ({
  type: 'token_request', agent: AGENT, resource: RESOURCE, scope, ...(justification ? { justification } : {}),
})

export const acts = {
  calendar: tokenRequest('item:calendar', 'Find a free 30-minute slot next week for the meeting.'),
  projects: tokenRequest('item:projects', 'See what Alice is working on, to judge whether the two should talk.'),
  address: tokenRequest('item:address', 'Find out where Alice lives.'),
  phone: tokenRequest('item:phone'),
}

export const entry = (act, decision, by = 'jev') => ({ at: '2026-11-07T23:30:00.000Z', mission_s256: S256, act, decision, by })

export const noul = (p, model = MODEL) => ({ model, answers: { consistent: { type: 'noul', noul: p } } })

// Records each call; answers with the given reply, an HTTP status, a thrown error, or never ('hang').
export function fakeFetch(reply, { status = 200 } = {}) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) })
    if (reply === 'hang') return new Promise(() => {})
    if (reply instanceof Error) throw reply
    const text = typeof reply === 'string' ? reply : JSON.stringify(reply)
    return new Response(text, { status, headers: { 'content-type': 'application/json' } })
  }
  fn.calls = calls
  return fn
}
