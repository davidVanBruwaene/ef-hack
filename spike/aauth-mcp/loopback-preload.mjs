// Loaded into mockin with --import so its discovery fetches reach the local *.aauth.test servers.
import { routeTestHostsToLoopback } from './loopback.mjs'

routeTestHostsToLoopback()
