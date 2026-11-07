import { createHash } from 'node:crypto'

export const PS = 'https://ps.aauth.test'
export const RESOURCE = 'https://alice.aauth.test'
export const AGENT = 'https://bob-agent.aauth.test'
export const AGENT_SUB = 'aauth:claude@bob-agent.aauth.test'
export const SCOPE = 'read'

// Loopback ports stand in for DNS: AAuth server identifiers must be https with no port.
export const PORTS = { 'ps.aauth.test': 4401, 'alice.aauth.test': 4402, 'bob-agent.aauth.test': 4403 }
export const portOf = identifier => PORTS[new URL(identifier).hostname]

export const KEY_DIR = new URL('./.keys/', import.meta.url)

// No person server implements mission_endpoint yet, so the mission hash is SHA-256 of the intent text.
export const missionHash = text => createHash('sha256').update(text, 'utf8').digest('base64url')
