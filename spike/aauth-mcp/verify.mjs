import { parseDictionary, verify as httpSigVerify } from '@hellocoop/httpsig'
import { verifyToken } from '@aauth/resource'
import { sha256 } from './store.mjs'

// -11 §10.3 profile: a body is signed through Content-Digest, and at a PS (typedBody) through Content-Type too.
const PS_BODY_INPUT = ['@method', '@authority', '@path', 'content-type', 'content-digest', 'signature-key']

const covered = (req, label) => {
  try { return (parseDictionary(String(req.headers['signature-input'] ?? '')).get(label)?.[0] ?? []).map(([c]) => c) } catch { return [] }
}

// Returns { sig, token }, or { error, detail, signed, signatureError? } where signatureError is what a Signature-Error header names.
export async function verifySignedRequest(req, url, raw, { resource, accept, typedBody = false }) {
  const signed = ['signature', 'signature-input', 'signature-key'].some(h => req.headers[h] !== undefined)
  const sig = await httpSigVerify({
    method: req.method ?? 'POST',
    authority: req.headers.host ?? '',
    path: url.pathname,
    query: url.search.replace(/^\?/, '') || undefined,
    headers: req.headers,
    body: raw.length ? raw : undefined,
  }, { supportedAlgorithms: ['Ed25519'], requireContentDigest: true })
  if (!sig.verified || !sig.jwt?.raw) return { error: 'invalid_signature', detail: sig.error ?? 'unsigned request or bad signature', signed, signatureError: sig.signatureError }
  if (typedBody && raw.length && !covered(req, sig.label).includes('content-type')) {
    return { error: 'invalid_signature', detail: 'content-type must be a covered component on a request with a body', signed, signatureError: { error: 'invalid_input', required_input: PS_BODY_INPUT } }
  }
  try {
    const token = await verifyToken({ jwt: sig.jwt.raw, httpSignatureThumbprint: sig.thumbprint, resource, accept })
    return { sig, token, request: requestBinding(req, url, sig, token) }
  } catch (err) {
    return { sig, error: err.code ?? 'invalid_token', detail: err.message, signed }
  }
}

// What a record keeps of the signed request: with the body and the token token_s256 commits to, signature re-verifies against agent_jkt.
export function requestBinding(req, url, sig, token) {
  let created = null
  try { created = parseDictionary(String(req.headers['signature-input'])).get(sig.label)?.[1]?.get('created') ?? null } catch {}
  return {
    method: req.method ?? 'POST',
    authority: req.headers.host ?? '',
    path: url.pathname,
    content_type: req.headers['content-type'] ?? null,
    content_digest: req.headers['content-digest'] ?? null,
    signature_input: String(req.headers['signature-input'] ?? ''),
    signature: String(req.headers['signature'] ?? ''),
    created,
    agent_jkt: sig.thumbprint,
    token_jti: token?.jti ?? token?.claims?.jti ?? null,
    token_s256: sha256(sig.jwt.raw),
  }
}
