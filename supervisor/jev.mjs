// TypeSafe's Jev through OpenRouter's System One endpoint: one yes/no question, where any failure means no answer.
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const JEV_URL = 'https://openrouter.ai/api/v1/systemone'
export const JEV_MODEL = 'typesafe/jev-1.14-20261014'
export const JEV_TIMEOUT_MS = 4000
export const DEFAULT_KEY_FILE = join(homedir(), 'keys', 'openrouter', 'key')
const QUESTION_ID = 'consistent'

export const keyFile = (env = process.env) => (env.OPENROUTER_KEY_FILE?.trim() || DEFAULT_KEY_FILE).replace(/^~(?=$|\/)/, homedir())

// Read on every call, so a rotated key takes effect without a restart.
export async function readKey(env = process.env) {
  const direct = env.OPENROUTER_API_KEY?.trim()
  if (direct) return direct
  try {
    return (await readFile(keyFile(env), 'utf8')).trim() || null
  } catch {
    return null
  }
}

const isProbability = p => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1
const failure = (name, message) => Object.assign(new Error(message), { name })

// Resolves to {p, model} or {error, model?}. It never rejects, and nothing it returns carries the key.
export async function askJev(state, question, opts = {}) {
  const { fetch = globalThis.fetch, env = process.env, url = JEV_URL, model = JEV_MODEL, timeoutMs = JEV_TIMEOUT_MS } = opts
  const key = await readKey(env)
  if (!key) return { error: 'no OpenRouter key' }
  const controller = new AbortController()
  let timer
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(failure('TimeoutError', `no reply within ${timeoutMs} ms`)), timeoutMs)
  })
  const exchange = (async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, state, questions: { [QUESTION_ID]: { type: 'noul', instructions: question } } }),
      signal: controller.signal,
    })
    if (!res.ok) throw failure('HttpError', `HTTP ${res.status}`)
    return res.json()
  })()
  let reply
  try {
    reply = await Promise.race([exchange, deadline])
  } catch (err) {
    const known = err?.name === 'TimeoutError' || err?.name === 'HttpError'
    return { error: known ? err.message : `request failed (${err?.name ?? 'Error'})` }
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
  const reported = typeof reply?.model === 'string' ? reply.model.trim() : ''
  if (!reported) return { error: 'reply names no model' }
  const p = reply.answers?.[QUESTION_ID]?.noul
  if (!isProbability(p)) return { error: 'reply has no yes probability from 0 to 1', model: reported }
  return { p, model: reported }
}
