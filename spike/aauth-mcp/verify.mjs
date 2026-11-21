import { verify as httpSigVerify } from '@hellocoop/httpsig'
import { verifyToken } from '@aauth/resource'

// Verifies the HTTP signature and the token in its Signature-Key; returns { sig, token } or { error, detail }.
// requireContentDigest: a request with a body must sign its Content-Digest, as -11 requires at a PS.
export async function verifySignedRequest(req, url, raw, { resource, accept, requireContentDigest = false }) {
  const sig = await httpSigVerify({
    method: req.method ?? 'POST',
    authority: req.headers.host ?? '',
    path: url.pathname,
    query: url.search.replace(/^\?/, '') || undefined,
    headers: req.headers,
    body: raw.length ? raw : undefined,
  }, { supportedAlgorithms: ['Ed25519'], requireContentDigest })
  if (!sig.verified || !sig.jwt?.raw) return { error: 'invalid_signature', detail: sig.error ?? 'unsigned request or bad signature' }
  try {
    const token = await verifyToken({ jwt: sig.jwt.raw, httpSignatureThumbprint: sig.thumbprint, resource, accept })
    return { sig, token }
  } catch (err) {
    return { sig, error: err.code ?? 'invalid_token', detail: err.message }
  }
}
