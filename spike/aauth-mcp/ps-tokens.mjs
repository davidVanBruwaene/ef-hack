// The person server's tokens (-11): person and auth tokens for the member a mission belongs to, and the checks on the resource and presented tokens an agent brings.
import { createHmac, randomUUID } from 'node:crypto'
import { DWK, SIGNING_ALG, TOKEN_TYP } from '@aauth/protocol'
import { discoverJwks } from '@aauth/resource'
import { SignJWT, calculateJwkThumbprint, createLocalJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify } from 'jose'
import { PS } from './config.mjs'
import { persistentKey } from './keys.mjs'
import { bearerToken } from './store.mjs'

const MAX_TTL = 3600
// An iat further ahead than this is the issuer's clock, not a forgery: clock_skew, so the agent waits instead of refreshing.
const IAT_SKEW = 60

const signing = await persistentKey('ps-signing', 'ps-signing-1')
export const jwks = { keys: [{ ...signing.publicJwk, key_ops: ['verify'] }] }
const own = createLocalJWKSet(jwks)
const secret = bearerToken('PS_SUBJECT_SECRET', 'ps-subject-secret')

// Pairwise per resource, keyed so a resource that knows a member id cannot recompute it (-11 §Person Token Structure).
export const subjectFor = (member, aud) => createHmac('sha256', secret).update(`${member}|${aud}`).digest('base64url')

const fail = (error, detail, status = 400) => ({ error, detail, status })

// -11 §Resource Identifier: https, scheme and host only, lowercase, no port; loopback http for local runs.
export function badResource(value) {
  if (typeof value !== 'string' || !value) return 'resource is required'
  let url
  try { url = new URL(value) } catch { return `resource "${value}" is not an absolute URL` }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return `resource "${value}" must use https`
  if (url.search || url.hash || url.pathname !== '/' || value.endsWith('/')) return `resource "${value}" must be scheme and host only, with no trailing slash`
  if (url.port && !loopback) return `resource "${value}" must not contain a port`
  if (value !== value.toLowerCase()) return `resource "${value}" must be lowercase`
  return null
}

const sign = (payload, typ) => new SignJWT(payload).setProtectedHeader({ alg: SIGNING_ALG, typ, kid: signing.kid }).sign(signing.privateKey)
const clamp = (iat, ...limits) => Math.min(iat + MAX_TTL, ...limits.filter(Number.isFinite))

export async function issuePersonToken({ member, resource, agentJwk, agentExp, mission }) {
  const iat = Math.floor(Date.now() / 1000)
  const exp = clamp(iat, agentExp, Math.floor(Date.parse(mission.expires_at) / 1000))
  const person_token = await sign({
    iss: PS, dwk: DWK.person, aud: resource, sub: subjectFor(member, resource), cnf: { jwk: agentJwk },
    jti: randomUUID(), iat, exp, mission_s256: mission.s256,
  }, TOKEN_TYP.person)
  return { person_token, expires_in: exp - iat }
}

// Copies sub, mission_s256, tenant and account from the verified resource token; never outlives the presented token.
export async function issueAuthToken({ rt, presentedExp, agentJwk, name }) {
  const iat = Math.floor(Date.now() / 1000)
  const exp = clamp(iat, presentedExp)
  if (exp <= iat) return fail('expired_presented_token', 'the presented token expired while the request waited; ask the resource again')
  const auth_token = await sign({
    iss: PS, dwk: DWK.person, ps: PS, sub: rt.sub, aud: rt.iss, scope: rt.scope ?? '', cnf: { jwk: agentJwk },
    ...(name ? { name } : {}),
    ...(rt.mission_s256 ? { mission_s256: rt.mission_s256 } : {}),
    ...(rt.tenant ? { tenant: rt.tenant } : {}),
    ...(rt.account ? { account: rt.account } : {}),
    jti: randomUUID(), iat, exp,
  }, TOKEN_TYP.auth)
  return { auth_token, expires_in: exp - iat }
}

const decoded = jwt => { try { return { header: decodeProtectedHeader(jwt), payload: decodeJwt(jwt) } } catch { return null } }

// -11 §Resource Token Verification steps 1-5: signed by the resource it names, for this PS, bound to the key that signed the request.
export async function verifyResourceToken(jwt, signerJkt) {
  const d = typeof jwt === 'string' ? decoded(jwt) : null
  if (!d) return fail('invalid_resource_token', 'resource_token is not a JWT')
  const { header, payload } = d
  if (header.typ !== TOKEN_TYP.resource) return fail('invalid_resource_token', `resource_token typ must be ${TOKEN_TYP.resource}`)
  if (header.alg !== SIGNING_ALG) return fail('invalid_resource_token', `resource_token alg must be ${SIGNING_ALG}`)
  if ((payload.dwk ?? DWK.resource) !== DWK.resource) return fail('invalid_resource_token', `resource_token dwk must be ${DWK.resource}`)
  if (badResource(payload.iss)) return fail('invalid_resource_token', `resource_token iss: ${badResource(payload.iss)}`)
  try {
    const keys = await discoverJwks({ iss: payload.iss, dwk: DWK.resource })
    await jwtVerify(jwt, createLocalJWKSet(keys), { algorithms: [SIGNING_ALG], audience: PS })
  } catch (err) {
    return err.code === 'ERR_JWT_EXPIRED'
      ? fail('expired_resource_token', 'resource_token expired')
      : fail('invalid_resource_token', `resource_token: ${err.message}`)
  }
  if (payload.agent_jkt !== signerJkt) return fail('invalid_resource_token', 'resource_token agent_jkt does not match the key that signed this request')
  const presented_jti = payload.presented_jti ?? payload.person_token_jti
  if (!presented_jti || !payload.ps || !payload.sub) return fail('invalid_resource_token', 'resource_token needs presented_jti, ps and sub')
  return { rt: { ...payload, presented_jti } }
}

// Step 6: the presented token is one this PS issued, for the same resource, key, subject, mission and tenant as the resource token.
export async function verifyPresentedToken(jwt, rt) {
  const d = typeof jwt === 'string' ? decoded(jwt) : null
  if (!d) return fail('invalid_presented_token', 'presented_token is not a JWT')
  const { header, payload } = d
  const kind = header.typ === TOKEN_TYP.person ? 'person' : header.typ === TOKEN_TYP.auth ? 'auth' : null
  if (!kind) return fail('invalid_presented_token', `presented_token typ must be ${TOKEN_TYP.person} or ${TOKEN_TYP.auth}`)
  if (payload.iss !== PS || payload.dwk !== DWK.person) return fail('invalid_presented_token', 'presented_token was not issued by this person server')
  try {
    await jwtVerify(jwt, own, { algorithms: [SIGNING_ALG] })
  } catch (err) {
    return err.code === 'ERR_JWT_EXPIRED'
      ? fail('expired_presented_token', 'presented_token expired: get a fresh person token, then a fresh resource token')
      : fail('invalid_presented_token', `presented_token: ${err.message}`)
  }
  if (typeof payload.iat === 'number' && payload.iat > Date.now() / 1000 + IAT_SKEW) return fail('clock_skew', 'presented_token iat is ahead of this server\'s clock')
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!auds.includes(rt.iss)) return fail('invalid_presented_token', `presented_token aud does not name ${rt.iss}`)
  let jkt
  try { jkt = await calculateJwkThumbprint(payload.cnf?.jwk) } catch { return fail('invalid_presented_token', 'presented_token has no valid cnf.jwk') }
  if (jkt !== rt.agent_jkt) return fail('invalid_presented_token', 'presented_token cnf.jwk does not match resource_token agent_jkt')
  if (payload.jti !== rt.presented_jti) return fail('invalid_resource_token', 'resource_token presented_jti does not name the presented token')
  if (rt.ps !== PS) return fail('invalid_resource_token', 'resource_token ps does not name this person server')
  if (rt.sub !== payload.sub) return fail('invalid_resource_token', 'resource_token sub does not match the presented token')
  // A dropped mission_s256 is the stripping this check exists to catch, so absent against present fails both ways.
  if ((rt.mission_s256 || null) !== (payload.mission_s256 || null)) return fail('invalid_resource_token', 'resource_token mission_s256 does not match the presented token')
  if ((rt.tenant || null) !== (payload.tenant || null)) return fail('invalid_resource_token', 'resource_token tenant does not match the presented token')
  return { presented: { kind, exp: payload.exp } }
}
