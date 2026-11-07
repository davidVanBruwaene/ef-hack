// Runs Bob's side and Alice's side in one process, for a single laptop. On two laptops run bob.mjs and alice.mjs instead.
import { startAlice } from './alice.mjs'
import { startBob } from './bob.mjs'

await startBob()
await startAlice()
