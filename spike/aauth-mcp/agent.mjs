// An agent: a fresh session key, bound to an agent identity by agent tokens from the agent provider, renewed before they expire.
import { DWK, SIGNING_ALG, TOKEN_TYP } from '@aauth/protocol'
import { SignJWT } from 'jose'
import { AGENT, AGENT_SUB, PS } from './config.mjs'
import { agentIdentityKey, newKey } from './keys.mjs'

const TTL = 3600

export async function agentSession(sub = AGENT_SUB) {
  const identity = await agentIdentityKey()
  const session = await newKey('agent-session-1')
  let agentToken, exp = 0
  async function mint() {
    const now = Math.floor(Date.now() / 1000)
    exp = now + TTL
    agentToken = await new SignJWT({
      iss: AGENT, dwk: DWK.agent, sub, ps: PS, cnf: { jwk: session.publicJwk }, iat: now, exp,
    }).setProtectedHeader({ alg: SIGNING_ALG, typ: TOKEN_TYP.agent, kid: identity.kid }).sign(identity.privateKey)
  }
  return {
    sub,
    getKeyMaterial: async () => {
      if (exp - 300 < Date.now() / 1000) await mint()
      return { signingKey: session.privateJwk, signatureKey: { type: 'jwt', jwt: agentToken } }
    },
  }
}
