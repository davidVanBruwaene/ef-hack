import { parseDictionary, verify as httpSigVerify } from '@hellocoop/httpsig'
import { verifyToken } from '@aauth/resource'

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
    return { sig, token }
  } catch (err) {
    return { sig, error: err.code ?? 'invalid_token', detail: err.message, signed }
  }
}
