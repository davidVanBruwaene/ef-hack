# Two laptops behind named Cloudflare tunnels

Bob's laptop runs `npm run bob`, which starts Bob's person server and agent provider, and it runs Claude Code. Alice's laptop runs three things: `npm run alice`, which starts Alice's server; the people store in `store/`; and `npm run console`, which serves the console that Alice and Bob both use. Each laptop runs one named tunnel. The other laptop and the phones reach it through Cloudflare, so neither laptop needs an inbound connection or a shared network. All commands below run in `spike/aauth-mcp`.

## The names

| Hostname | Tunnel | Local port | Serves |
|---|---|---|---|
| `parley-bob.puddlecloud.com` | parley-bob | 4401 | The person server (`AAUTH_PS`) |
| `parley-agent.puddlecloud.com` | parley-bob | 4403 | Bob's agent provider (`AAUTH_AGENT`) |
| `parley-alice.puddlecloud.com` | parley-alice | 4402 | Alice's MCP server and `/api` (`AAUTH_RESOURCE`) |
| `parley-console.puddlecloud.com` | parley-alice | 4531 for `npm run console`, 8790 for the store | The console for Alice and Bob, and the passkey store (`RP_ID`) |

The tunnels and DNS records already exist in David's Cloudflare account. Every hostname is one level under the zone, because Cloudflare's Universal SSL certificate covers only that level. A deeper name such as `bob.parley.puddlecloud.com` would fail TLS.

**Always pass `--config` to cloudflared.** On David's laptop, `~/.cloudflared/config.yml` names another tunnel, and cloudflared falls back to that file whenever `--config` is missing. That includes `route dns`.

## Once per laptop

1. **Checkout.** Use the same commit on both laptops and run `npm ci --ignore-scripts`.
2. **`.env`.** Put the same lines in `.env` at the repo root on both laptops. The last two serve Julián's store, and they let `tunnel.mjs check` cover the console too:

   ```bash
   AAUTH_PS=https://parley-bob.puddlecloud.com
   AAUTH_AGENT=https://parley-agent.puddlecloud.com
   AAUTH_RESOURCE=https://parley-alice.puddlecloud.com
   RP_ID=parley-console.puddlecloud.com
   RP_ORIGINS=https://parley-console.puddlecloud.com
   ```

3. **Credentials.** A laptop needs the credentials file of the tunnel it runs, `~/.cloudflared/<tunnel id>.json`. parley-bob is `5d32c91e-d00f-4ac7-af35-44c56fadb0e8` and parley-alice is `5356e70a-87a0-45c9-a315-5cd7bda96241`. David's laptop holds both files. David hands the second laptop its file in person, never through git or notes, and it goes in the same place there.
4. **Tunnel config.** Each side writes its config from `.env` and the local ports:

   ```bash
   # Bob's laptop
   node tunnel.mjs config bob --credentials ~/.cloudflared/5d32c91e-d00f-4ac7-af35-44c56fadb0e8.json --out ~/.cloudflared/parley-bob.yml
   cloudflared tunnel --config ~/.cloudflared/parley-bob.yml ingress validate
   # Alice's laptop
   node tunnel.mjs config alice --credentials ~/.cloudflared/5356e70a-87a0-45c9-a315-5cd7bda96241.json --console 4531 --store 8790 --out ~/.cloudflared/parley-alice.yml
   cloudflared tunnel --config ~/.cloudflared/parley-alice.yml ingress validate
   ```

   The script takes the tunnel id from the credentials file and never prints the secret. If the output file exists with other contents, the script stops unless you add `--force`, and it never writes `~/.cloudflared/config.yml`. The ports come from `config.mjs`, which reads `AAUTH_PS_PORT`, `AAUTH_AGENT_PORT` and `AAUTH_RESOURCE_PORT` from `.env`. Rerun it whenever `.env` or the ports change. The console's route says `localhost` rather than 127.0.0.1, because Vite listens on `[::1]` only on macOS. With `--store`, Alice's server answers `/api/`, the console server answers `/`, `/assets/` and `/agent/`, and the store answers every other path on the hostname, so all three see the store's sign-in cookie.
5. **Keys.** Leave `.keys/` alone. Each side generates its own keys on first start and publishes the public halves, so nothing is copied between the laptops.

## Each run

| Bob's laptop | Alice's laptop |
|---|---|
| `npm run bob` | `npm run alice`, `npm start` in `store/`, and `npm run console` after `VITE_API=live npm run build` in `console/` |
| `cloudflared tunnel --config ~/.cloudflared/parley-bob.yml run` | `cloudflared tunnel --config ~/.cloudflared/parley-alice.yml run` |
| `node tunnel.mjs check` | `node tunnel.mjs check` |

`tunnel.mjs check` fetches each server's metadata at its public URL and confirms that the `issuer` it reports matches `.env`. It also confirms that the console answers. When it passes on both laptops, DNS, TLS, both tunnels and every server line up. Then, on Bob's laptop:

```bash
npm run mission -- "<text>"   # QR code: Bob opens it signed in to the console and approves; the text is required here
npm run check:missions   # Bob's person server and supervisor against -11, through both tunnels
npm run mcp-config       # then Claude Code, as in the README
```

Bob answers his agent in the same console as Alice: he signs in at `https://parley-console.puddlecloud.com/` with his store passkey, and the interaction link lands there with the code. Approving the agent's first mission binds the agent to him, and the console then shows him its missions and the requests the supervisor holds, beside anything asked of him. `npm run console` calls the person server's `/api` with the console token, so Alice's laptop needs `BOB_CONSOLE_TOKEN` set to it, handed over in person. Until directory linking lands, `MEMBER_MAP` still tells Alice's server which member a person server's requests come from.

`check:missions` answers through `/api` as a test member and approves its missions rules-only. Its first approval binds the agent to that test member, after which no real member can answer for it, and each run leaves about 20 approved test missions for 24 hours. Run it only against a world no member uses, for example a fresh `AAUTH_DATA_DIR`. `JEV_LIVE=1 npm run check:missions` also runs the two cases Jev decides, which spends a few OpenRouter calls.

Some `npm run check` cases answer as Alice through her `/api`. On Bob's laptop that needs `ALICE_CONSOLE_TOKEN` set to Alice's token. Without it, the script generates a token of its own, which Alice's server refuses. The token is a secret, so hand it over in person.

## When a hop fails

| Symptom | Cause | Fix |
|---|---|---|
| `check` says ENOTFOUND, but `dig @1.1.1.1 <host>` answers | This laptop's resolver cached the name as missing before the record existed. The zone lets resolvers keep that answer for up to 30 minutes | Wait it out, or switch networks |
| `check` says ENOTFOUND everywhere | No DNS record | `cloudflared tunnel --config <that side's file> route dns <tunnel> <host>` |
| ERR_TLS_CERT_ALTNAME_INVALID | The hostname is two levels under the zone | Use a first-level hostname |
| 530 | No tunnel is connected for that hostname | Start cloudflared on that side and read its log |
| 502 | The tunnel is up, but nothing answers on the port | Start that side's server. The AAuth servers listen on 127.0.0.1 only, which is why their routes say 127.0.0.1 rather than localhost |
| 403 "Blocked request. This host is not allowed" from parley-console | Vite refuses any hostname that `server.allowedHosts` in `console/vite.config.ts` does not name | Add `parley-console.puddlecloud.com` to `server.allowedHosts` |
| 404 | The ingress has no rule for the hostname, or DNS points it at the other tunnel | Rerun `tunnel.mjs config`, restart cloudflared, and check `route dns` |
| Wrong issuer | The server started with other `AAUTH_*` values, for example without `.env` | Fix `.env` and restart the server |
| cloudflared cannot connect | The network blocks port 7844, which cloudflared uses to reach Cloudflare (QUIC, then HTTP/2) | Try `--protocol http2`, or tether to a phone |
| Signature or `clock_skew` errors on one side only | The laptops' clocks differ | Turn on automatic time on both laptops |

Don't set `httpHostHeader`, because the HTTP signatures cover the public hostname in `Host`. If something can't be fixed in time, there are two fallbacks: both tunnels and `npm run world` on one laptop, or quick tunnels. The spike README covers both under "Behind Cloudflare".
