import { existsSync } from 'node:fs'

const envFile = new URL('../../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

const identifier = (name, fallback) => (process.env[name] || fallback).replace(/\/+$/, '')

// AAuth server identifiers must be https with no port; set these to the public hostnames when tunnelled.
export const PS = identifier('AAUTH_PS', 'https://ps.aauth.test')
export const RESOURCE = identifier('AAUTH_RESOURCE', 'https://alice.aauth.test')
export const AGENT = identifier('AAUTH_AGENT', 'https://bob-agent.aauth.test')
export const AGENT_SUB = `aauth:claude@${new URL(AGENT).hostname}`
export const BOB_NAME = process.env.BOB_NAME || 'Bob'
export const DEFAULT_MISSION = 'I met Alice at the hackathon. Check whether we should talk, and if so book 30 minutes.'

const port = (name, fallback) => Number(process.env[name]) || fallback

// Local listen ports; set them to run a second world beside the first. mockin sits behind the person-server front and is never exposed.
export const PORTS = {
  ps: port('AAUTH_PS_PORT', 4401),
  resource: port('AAUTH_RESOURCE_PORT', 4402),
  agent: port('AAUTH_AGENT_PORT', 4403),
  mockin: port('AAUTH_MOCKIN_PORT', 4411),
}

// *.aauth.test identifiers resolve to these loopback ports instead of DNS; any other host goes to the network.
export const LOOPBACK = Object.fromEntries(
  [[PS, PORTS.ps], [RESOURCE, PORTS.resource], [AGENT, PORTS.agent]]
    .map(([url, port]) => [new URL(url).hostname, port])
    .filter(([host]) => host.endsWith('.aauth.test')),
)

export const KEY_DIR = new URL('./.keys/', import.meta.url)
export const DATA_DIR = new URL('./.data/', import.meta.url)

