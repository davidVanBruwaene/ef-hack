import net from 'node:net'
import { Agent, buildConnector, setGlobalDispatcher } from 'undici'
import { LOOPBACK } from './config.mjs'

// A failed connect has sent no request bytes, so retrying it is safe for any method.
const retrying = (connector, attempts) => (opts, cb) =>
  connector(opts, (err, socket) => (err && attempts > 1 ? retrying(connector, attempts - 1)(opts, cb) : cb(err, socket)))

// Connects *.aauth.test to 127.0.0.1 over plain TCP; URLs, Host headers and signed @authority keep the real identifiers.
export function routeTestHostsToLoopback() {
  const direct = retrying(buildConnector({}), 3)
  setGlobalDispatcher(new Agent({
    connect(opts, cb) {
      const port = LOOPBACK[opts.hostname]
      if (!port) return direct(opts, cb)
      const socket = net.connect({ host: '127.0.0.1', port })
      let settled = false
      const settle = (err) => { if (!settled) { settled = true; err ? cb(err, null) : cb(null, socket) } }
      socket.once('connect', () => settle()).once('error', settle)
    },
  }))
}
