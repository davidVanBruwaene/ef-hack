import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { exportJWK, generateKeyPair, importJWK } from 'jose'
import { SIGNING_ALG } from '@aauth/protocol'
import { KEY_DIR } from './config.mjs'

export async function newKey(kid) {
  const { privateKey, publicKey } = await generateKeyPair('Ed25519', { extractable: true })
  return {
    kid,
    privateKey,
    publicJwk: { ...(await exportJWK(publicKey)), alg: SIGNING_ALG, kid, use: 'sig' },
    privateJwk: { ...(await exportJWK(privateKey)), alg: SIGNING_ALG, kid },
  }
}

// The agent provider's identity key: the proxy signs agent tokens with it, world.mjs publishes its public half.
export async function agentIdentityKey() {
  const file = new URL('agent-identity.json', KEY_DIR)
  if (!existsSync(file)) {
    const { kid, publicJwk, privateJwk } = await newKey('bob-agent-identity-1')
    mkdirSync(KEY_DIR, { recursive: true })
    writeFileSync(file, JSON.stringify({ kid, publicJwk, privateJwk }), { mode: 0o600 })
  }
  const { kid, publicJwk, privateJwk } = JSON.parse(readFileSync(file, 'utf8'))
  return { kid, publicJwk, privateJwk, privateKey: await importJWK(privateJwk, SIGNING_ALG) }
}
