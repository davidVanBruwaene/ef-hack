// The pages Bob opens from a QR code or link: approve a mission his agent proposed.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const STYLE = `
:root { --bg: #f6f5f2; --card: #fff; --ink: #1d1c1a; --muted: #6b6862; --line: #e4e1da; --accent: #1f5f4a; --deny: #8a2f2f; }
@media (prefers-color-scheme: dark) { :root { --bg: #151514; --card: #1f1e1c; --ink: #edebe6; --muted: #a29e96; --line: #34322e; --accent: #5fbf9b; --deny: #e08b8b; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 -apple-system, system-ui, sans-serif; }
main { max-width: 560px; margin: 0 auto; padding: 24px 16px 48px; }
.eyebrow { color: var(--muted); font-size: 13px; letter-spacing: .04em; text-transform: uppercase; margin: 0 0 8px; }
h1 { font-size: 22px; line-height: 1.3; margin: 0 0 16px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin: 0 0 16px; }
dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 6px 12px; font-size: 14px; }
dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; }
label { display: block; font-size: 14px; color: var(--muted); margin: 0 0 6px; }
textarea { width: 100%; min-height: 140px; font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
.row { display: flex; gap: 12px; margin-top: 16px; }
button { flex: 1; font: inherit; font-weight: 600; padding: 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--ink); }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
button.deny { color: var(--deny); }
.fine { color: var(--muted); font-size: 13px; }
.done { font-size: 18px; font-weight: 600; }
`

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head>
<body><main><p class="eyebrow">Bob's person server</p>${body}</main></body></html>`

export function missionPage(m, { bobName }) {
  const facts = `<dl><dt>Agent</dt><dd><code>${esc(m.agent)}</code></dd>${
    m.resources?.length ? `<dt>Will reach</dt><dd>${m.resources.map(esc).join('<br>')}</dd>` : ''}</dl>`
  if (m.status !== 'pending') {
    const text = m.status === 'approved' ? 'Approved. Your agent can go ahead.' : 'Denied. Your agent will not start this mission.'
    return page('Mission', `<h1>${esc(text)}</h1><div class="card">${facts}</div>${
      m.status === 'approved' ? `<div class="card"><label>Approved mission</label><div style="white-space:pre-wrap">${esc(m.approved_description)}</div></div>
      <p class="fine">Expires ${esc(new Date(m.expires_at).toUTCString())}. Mission ${esc(m.s256.slice(0, 12))}…</p>` : ''}`)
  }
  return page('Approve mission', `<h1>${esc(bobName)}, your agent wants to start a mission</h1>
<div class="card">${facts}</div>
<form method="post" action="/interact" class="card">
  <input type="hidden" name="code" value="${esc(m.code)}">
  <label for="d">Mission. Edit it before approving if you want it narrower.</label>
  <textarea id="d" name="description">${esc(m.description)}</textarea>
  <div class="row"><button class="primary" name="decision" value="approve">Approve</button><button class="deny" name="decision" value="deny">Deny</button></div>
</form>
<p class="fine">Lasts 24 hours from approval. Each request your agent makes under it is checked against this text.</p>`)
}

export const notFoundPage = () => page('Not found', '<h1>That link has expired or is not valid.</h1>')
