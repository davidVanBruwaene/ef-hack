import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { askJev, DEFAULT_KEY_FILE, JEV_MODEL, JEV_URL, keyFile, readKey } from '../jev.mjs'
import { fakeFetch, MODEL, noul, TEST_ENV, TEST_KEY } from './fixtures.mjs'

const dir = await mkdtemp(join(tmpdir(), 'parley-supervisor-'))
after(() => rm(dir, { recursive: true, force: true }))
const MISSING = { OPENROUTER_KEY_FILE: join(dir, 'no-such-key') }
const ask = (fetch, extra = {}) => askJev('the state', 'Is this act consistent with the mission?', { fetch, env: TEST_ENV, ...extra })

test('one POST to OpenRouter System One with the pinned model and one noul question', async () => {
  const fetch = fakeFetch(noul(0.97))
  assert.deepEqual(await ask(fetch), { p: 0.97, model: MODEL })
  assert.equal(fetch.calls.length, 1)
  const [{ url, init, body }] = fetch.calls
  assert.equal(url, 'https://openrouter.ai/api/v1/systemone')
  assert.equal(url, JEV_URL)
  assert.equal(init.method, 'POST')
  assert.equal(init.headers.authorization, `Bearer ${TEST_KEY}`)
  assert.equal(init.headers['content-type'], 'application/json')
  assert.equal(JEV_MODEL, 'typesafe/jev-1.14-20261014')
  assert.deepEqual(body, {
    model: JEV_MODEL,
    state: 'the state',
    questions: { consistent: { type: 'noul', instructions: 'Is this act consistent with the mission?' } },
  })
})

test('the model the reply names is what gets recorded', async () => {
  assert.deepEqual(await ask(fakeFetch(noul(0.5, ' typesafe/jev-1.15-20261101 '))), { p: 0.5, model: 'typesafe/jev-1.15-20261101' })
  assert.deepEqual(await ask(fakeFetch(noul(0))), { p: 0, model: MODEL })
  assert.deepEqual(await ask(fakeFetch(noul(1))), { p: 1, model: MODEL })
})

test('an HTTP error, a broken body or a failed connection is no answer', async () => {
  assert.deepEqual(await ask(fakeFetch({ error: 'nope' }, { status: 401 })), { error: 'HTTP 401' })
  assert.deepEqual(await ask(fakeFetch(noul(0.97), { status: 503 })), { error: 'HTTP 503' })
  assert.deepEqual(await ask(fakeFetch('{"model": "typesafe/jev')), { error: 'request failed (SyntaxError)' })
  assert.deepEqual(await ask(fakeFetch(new TypeError('fetch failed'))), { error: 'request failed (TypeError)' })
})

test('no reply within the timeout is no answer, and the wait is bounded', async () => {
  const started = Date.now()
  assert.deepEqual(await ask(fakeFetch('hang'), { timeoutMs: 50 }), { error: 'no reply within 50 ms' })
  assert.ok(Date.now() - started < 1000)
})

test('the request is aborted once the deadline passes', async () => {
  let signal
  const fetch = (url, init) => {
    signal = init.signal
    return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))
  }
  assert.deepEqual(await ask(fetch, { timeoutMs: 20 }), { error: 'no reply within 20 ms' })
  assert.equal(signal.aborted, true)
})

test('a reply that names no model is no answer', async () => {
  for (const reply of [{ answers: { consistent: { type: 'noul', noul: 0.97 } } }, noul(0.97, ''), noul(0.97, 7), null, []]) {
    assert.deepEqual(await ask(fakeFetch(reply)), { error: 'reply names no model' }, JSON.stringify(reply))
  }
})

test('a missing or out-of-range noul is no answer, with the model kept', async () => {
  const bad = [1.5, -0.1, true, '0.9', null, undefined]
  for (const p of bad) {
    assert.deepEqual(await ask(fakeFetch(noul(p))), { error: 'reply has no yes probability from 0 to 1', model: MODEL }, String(p))
  }
  assert.deepEqual(await ask(fakeFetch({ model: MODEL, answers: {} })), { error: 'reply has no yes probability from 0 to 1', model: MODEL })
  assert.deepEqual(await ask(fakeFetch({ model: MODEL, answers: { verdict: { noul: 0.97 } } })), {
    error: 'reply has no yes probability from 0 to 1', model: MODEL,
  })
})

test('with no key there is no request', async () => {
  const fetch = fakeFetch(noul(0.97))
  assert.deepEqual(await ask(fetch, { env: MISSING }), { error: 'no OpenRouter key' })
  assert.deepEqual(await ask(fetch, { env: { ...MISSING, OPENROUTER_API_KEY: '  ' } }), { error: 'no OpenRouter key' })
  assert.equal(fetch.calls.length, 0)
})

test('the key file is read on every call, so a rotated key is used at once', async () => {
  const file = join(dir, 'key')
  const env = { OPENROUTER_KEY_FILE: file }
  const fetch = fakeFetch(noul(0.97))
  await writeFile(file, 'first-test-key\n')
  await ask(fetch, { env })
  await writeFile(file, 'second-test-key\n')
  await ask(fetch, { env })
  assert.deepEqual(fetch.calls.map(c => c.init.headers.authorization), ['Bearer first-test-key', 'Bearer second-test-key'])
})

test('OPENROUTER_API_KEY wins over the file; a blank one falls through to it', async () => {
  const file = join(dir, 'key-2')
  await writeFile(file, 'file-test-key')
  assert.equal(await readKey({ OPENROUTER_API_KEY: 'env-test-key', OPENROUTER_KEY_FILE: file }), 'env-test-key')
  assert.equal(await readKey({ OPENROUTER_API_KEY: '', OPENROUTER_KEY_FILE: file }), 'file-test-key')
  await writeFile(file, '\n')
  assert.equal(await readKey({ OPENROUTER_KEY_FILE: file }), null)
})

test('the key file defaults to ~/keys/openrouter/key, and ~ expands', () => {
  assert.equal(DEFAULT_KEY_FILE, join(homedir(), 'keys', 'openrouter', 'key'))
  assert.equal(keyFile({}), DEFAULT_KEY_FILE)
  assert.equal(keyFile({ OPENROUTER_KEY_FILE: ' ' }), DEFAULT_KEY_FILE)
  assert.equal(keyFile({ OPENROUTER_KEY_FILE: '~/k/openrouter' }), join(homedir(), 'k', 'openrouter'))
  assert.equal(keyFile({ OPENROUTER_KEY_FILE: '/run/secrets/openrouter_key' }), '/run/secrets/openrouter_key')
})

test('nothing returned carries the key', async () => {
  const replies = [
    fakeFetch(noul(0.97)), fakeFetch({}, { status: 401 }), fakeFetch('not json'), fakeFetch(new Error(`boom ${TEST_KEY}`)),
    fakeFetch(noul(2)), fakeFetch({ answers: {} }),
  ]
  for (const fetch of replies) assert.ok(!JSON.stringify(await ask(fetch)).includes(TEST_KEY))
})
