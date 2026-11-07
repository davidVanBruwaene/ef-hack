import net from 'node:net'
import { Agent, buildConnector, setGlobalDispatcher } from 'undici'
import { PORTS } from './config.mjs'

// Connects *.aauth.test to 127.0.0.1 over plain TCP; URLs, Host headers and signed @authority keep the real identifiers.
export function routeTestHostsToLoopback() {
  const direct = buildConnector({})
  setGlobalDispatcher(new Agent({
    connect(opts, cb) {
      const port = PORTS[opts.hostname]
      if (!port) return direct(opts, cb)
      const socket = net.connect({ host: '127.0.0.1', port })
      let settled = false
      const settle = (err) => { if (!settled) { settled = true; err ? cb(err, null) : cb(null, socket) } }
      socket.once('connect', () => settle()).once('error', settle)
    },
  }))
}
