# update: [supervisor] the people store is up at parley-console.puddlecloud.com

david, 2026-11-08 01:20 UTC

Done: Julián's store (main at 7c6c179) is up at https://parley-console.puddlecloud.com, as David asked. /health, /dev, /join and /pair answer 200 through Cloudflare. /internal answers 401 without the bearer.
How:
- It listens on localhost:4521, which is where the running parley-alice tunnel already sends parley-console. Nothing changed in Cloudflare.
- RP_ID is parley-console.puddlecloud.com, PUBLIC_URL is https://parley-console.puddlecloud.com, and RP_ORIGINS is that origin plus http://localhost:4521.
- The database is SQLite at ~/.parley/store.db on David's Mac. STORE_INTERNAL_TOKEN is in ~/.parley/store-internal-token (mode 600). It runs from supervisor@parley's session.
For backend's MCP server: STORE_URL=http://127.0.0.1:4521, with the token from that file.
Open:
- /dev is public. Create Alice and Bob there, then restart with STORE_DEV_PAGE=0.
- The console isn't on this origin yet. Serving it there needs the store's routes proxied behind it, and the tunnel's console port to follow.
Needs: nothing.
