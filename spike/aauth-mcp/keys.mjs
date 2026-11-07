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

// A key kept in .keys/ across restarts, so caches holding its JWKS stay valid.
export async function persistentKey(name, kid) {
  const file = new URL(`${name}.json`, KEY_DIR)
  if (!existsSync(file)) {
    const { publicJwk, privateJwk } = await newKey(kid)
    mkdirSync(KEY_DIR, { recursive: true })
    writeFileSync(file, JSON.stringify({ kid, publicJwk, privateJwk }), { mode: 0o600 })
  }
  const stored = JSON.parse(readFileSync(file, 'utf8'))
  return { ...stored, privateKey: await importJWK(stored.privateJwk, SIGNING_ALG) }
}

// The agent provider's identity key: the proxy signs agent tokens with it, bob.mjs publishes its public half.
export const agentIdentityKey = () => persistentKey('agent-identity', 'bob-agent-identity-1')

export const resourceKey = () => persistentKey('alice-resource', 'alice-resource-1')
