// Bob's agent: a fresh session key, bound to the agent identity by an agent token from Bob's agent provider.
import { DWK, SIGNING_ALG, TOKEN_TYP } from '@aauth/protocol'
import { SignJWT } from 'jose'
import { AGENT, AGENT_SUB, PS } from './config.mjs'
import { agentIdentityKey, newKey } from './keys.mjs'

export async function agentSession() {
  const identity = await agentIdentityKey()
  const session = await newKey('bob-agent-session-1')
  const now = Math.floor(Date.now() / 1000)
  const agentToken = await new SignJWT({
    iss: AGENT, dwk: DWK.agent, sub: AGENT_SUB, ps: PS, cnf: { jwk: session.publicJwk }, iat: now, exp: now + 3600,
  }).setProtectedHeader({ alg: SIGNING_ALG, typ: TOKEN_TYP.agent, kid: identity.kid }).sign(identity.privateKey)
  return {
    getKeyMaterial: async () => ({ signingKey: session.privateJwk, signatureKey: { type: 'jwt', jwt: agentToken } }),
  }
}
