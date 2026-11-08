// The pages Bob opens on his phone: a mission or request from its QR code, and his own page, where held requests appear live.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const STYLE = `
:root { --bg: #f6f5f2; --card: #fff; --ink: #1d1c1a; --muted: #6b6862; --line: #e4e1da; --accent: #1f5f4a; --deny: #8a2f2f; }
@media (prefers-color-scheme: dark) { :root { --bg: #151514; --card: #1f1e1c; --ink: #edebe6; --muted: #a29e96; --line: #34322e; --accent: #5fbf9b; --deny: #e08b8b; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 -apple-system, system-ui, sans-serif; }
main { max-width: 560px; margin: 0 auto; padding: 24px 16px 48px; }
a { color: var(--accent); }
.eyebrow { color: var(--muted); font-size: 13px; letter-spacing: .04em; text-transform: uppercase; margin: 0 0 8px; }
h1 { font-size: 22px; line-height: 1.3; margin: 0 0 16px; }
h2 { font-size: 17px; margin: 24px 0 12px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin: 0 0 16px; }
dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 6px 12px; font-size: 14px; }
dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; }
label { display: block; font-size: 14px; color: var(--muted); margin: 0 0 6px; }
textarea, input[type=text] { width: 100%; font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
textarea { min-height: 140px; }
.row { display: flex; gap: 12px; margin-top: 16px; }
button { flex: 1; font: inherit; font-weight: 600; padding: 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--ink); }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
button.deny { color: var(--deny); }
.fine { color: var(--muted); font-size: 13px; }
.why { color: var(--muted); font-size: 14px; margin: 8px 0 0; }
.said { font-size: 15px; margin: 10px 0 0; padding-left: 10px; border-left: 3px solid var(--line); }
.item { font-weight: 600; }
.code { font: 600 20px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; }
.text { white-space: pre-wrap; }
`

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head>
<body><main><p class="eyebrow">Bob's person server</p>${body}</main></body></html>`

const itemsOf = scopes => scopes.map(s => s.replace(/^item:/, '')).join(', ')
const facts = m => `<dl><dt>Agent</dt><dd><code>${esc(m.agent)}</code></dd>${
  m.resources?.length ? `<dt>Will reach</dt><dd>${m.resources.map(esc).join('<br>')}</dd>` : ''}</dl>`
const asks = r => `<div>Your agent asks <code>${esc(r.resource)}</code> for <span class="item">${esc(itemsOf(r.scopes))}</span>.</div>
  ${r.justification ? `<p class="said">Your agent says: “${esc(r.justification)}”</p>` : ''}
  ${(r.verdicts ?? []).filter(v => v.decision !== 'ALLOW').map(v => `<p class="why">${esc(v.scope)}: ${esc(v.reason)}${v.p != null ? ` (p ${esc(v.p)})` : ''}</p>`).join('')}`
const answer = yes => `<div class="row"><button class="primary" name="decision" value="approve">${yes}</button><button class="deny" name="decision" value="deny">Deny</button></div>`
const home = '<p class="fine"><a href="/bob">Your person server</a></p>'

export const codeEntryPage = () => page('Enter code', `<h1>Enter the code your agent showed you</h1>
<form method="get" action="/interact" class="card"><label for="c">Code</label><input type="text" id="c" name="code" autocapitalize="characters" autocomplete="off" autofocus>
<div class="row"><button class="primary">Continue</button></div></form>`)

// What anyone holding the code may see: the agent proposed it, so nothing here is news to the agent.
export function previewPage(x, m, { bobName }) {
  const what = x.scopes
    ? `<h1>${esc(bobName)}, your agent is asking for something</h1><div class="card">${asks(x)}</div>`
    : `<h1>${esc(bobName)}, your agent wants to start a mission</h1><div class="card">${facts(x)}</div>
<div class="card"><label>Proposed mission</label><div class="text">${esc(x.description)}</div></div>`
  return page('Sign in to answer', `${what}
<div class="card"><label>Code</label><div class="code">${esc(x.code)}</div><p class="fine">Check it matches the code your agent showed you.</p></div>
<div class="card"><strong>Only ${esc(bobName)} can answer.</strong> This browser is not signed in to ${esc(bobName)}'s person server.
On ${esc(bobName)}'s laptop run <code>npm run pair</code>, scan the code it shows, then open this link again.</div>`)
}

export const pairFirstPage = ({ bobName }) => page('Sign in', `<h1>This browser is not signed in as ${esc(bobName)}</h1>
<div class="card">On ${esc(bobName)}'s laptop run <code>npm run pair</code> and scan the code it shows. It signs this browser in for seven days.</div>`)

const missionCard = m => `<div class="card"><div>Your agent wants to start a mission.</div><p class="said">${esc(m.description)}</p>
<form method="get" action="/bob/missions/${esc(m.id)}" class="row"><button class="primary">Review mission</button></form></div>`

const reviewCard = r => `<form method="post" action="/bob/reviews/${esc(r.id)}" class="card">${asks(r)}${answer('Allow')}</form>`

// The live part of Bob's page: everything waiting on him, oldest first.
export const needsYou = open => (open.length
  ? open.map(x => (x.scopes ? reviewCard(x) : missionCard(x))).join('')
  : '<p class="fine">Nothing needs you right now. New missions, and requests your supervisor cannot decide, appear here.</p>')

// Polls while the page is open; the list is replaced only when it changes, so a tap in progress survives.
const live = `<script>
(function () {
  var box = document.getElementById('needs'), shown = box.innerHTML;
  function tick() {
    fetch('/bob/live', { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (d) { if (d && d.html !== shown) { box.innerHTML = d.html; shown = d.html } })
      .catch(function () {})
  }
  setInterval(tick, 2000)
})()
</script>`

export function homePage({ bobName, open, active }) {
  const missions = active.length
    ? active.map(m => `<div class="card"><div class="text">${esc(m.approved_description)}</div>
<p class="fine">Expires ${esc(new Date(m.expires_at).toUTCString())}. Mission ${esc(m.s256.slice(0, 12))}…</p></div>`).join('')
    : '<p class="fine">No active missions.</p>'
  return page(`${bobName}'s person server`, `<h1>${esc(bobName)}, here is what your agent is doing</h1>
<h2>Needs you</h2><section id="needs">${needsYou(open)}</section>
<h2>Active missions</h2>${missions}${live}`)
}

export function missionPage(m, { bobName, open }) {
  if (!open) {
    const text = m.status === 'approved' ? 'Approved. Your agent can go ahead.' : m.status === 'denied' ? 'Denied. Your agent will not start this mission.' : 'This proposal has expired.'
    return page('Mission', `<h1>${esc(text)}</h1><div class="card">${facts(m)}</div>${
      m.status === 'approved' ? `<div class="card"><label>Approved mission</label><div class="text">${esc(m.approved_description)}</div></div>` : ''}${home}`)
  }
  return page('Approve mission', `<h1>${esc(bobName)}, your agent wants to start a mission</h1>
<div class="card">${facts(m)}</div>
<form method="post" action="/bob/missions/${esc(m.id)}" class="card">
  <label for="d">Mission. Edit it before approving if you want it narrower.</label>
  <textarea id="d" name="description">${esc(m.description)}</textarea>
  ${answer('Approve')}
</form>
<p class="fine">Lasts 24 hours from approval. Each request your agent makes under it is checked against this text.</p>${home}`)
}

export function reviewPage(r, m, { bobName, open }) {
  if (!open) {
    const text = r.status === 'approved' ? 'Allowed.' : r.status === 'denied' ? 'Denied.' : 'This request has expired.'
    return page('Request', `<h1>${text}</h1><div class="card">Your agent asked <code>${esc(r.resource)}</code> for <span class="item">${esc(itemsOf(r.scopes))}</span>.</div>${home}`)
  }
  return page('Your agent is asking', `<h1>${esc(bobName)}, your supervisor wants your call</h1>
<div class="card"><label>Under your mission</label><div class="text">${esc(m?.approved_description ?? '')}</div></div>
<form method="post" action="/bob/reviews/${esc(r.id)}" class="card">${asks(r)}${answer('Allow')}</form>${home}`)
}

const PROBLEMS = {
  used: 'That code has already been used. Each code works once.',
  unknown: 'That code is not valid. Check it against the one your agent showed you.',
  expired: 'That request has expired. Ask your agent to start again.',
  limited: 'Too many codes that did not match. Wait ten minutes and try again.',
}
export const codeProblemPage = kind => page('Code', `<h1>${esc(PROBLEMS[kind])}</h1>${home}`)

export const notFoundPage = () => page('Not found', '<h1>That link has expired or is not valid.</h1>')
