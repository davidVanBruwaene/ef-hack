# Two laptops behind named Cloudflare tunnels

Bob's laptop runs `npm run bob` (Bob's person server and agent provider) and Claude Code. Alice's laptop runs `npm run alice` (Alice's server) and her console. Each side reaches the other through its own named tunnel, and so do the phones, so neither laptop needs an inbound connection or a shared network. The spike README's "Behind Cloudflare" section has the tunnel commands; this page covers the order of work and how to check each hop.

All commands run in `spike/aauth-mcp`. `<domain>` is a zone on the Cloudflare account, and the hostnames below are placeholders until David picks them.

## Pick the hostnames

Three hostnames, each one level under the zone, for example `ps.<domain>`, `bob-agent.<domain>` and `alice.<domain>`. Cloudflare's Universal SSL certificate covers `*.<domain>` only, so a name like `ps.parley.<domain>` fails TLS unless the zone has an advanced certificate.

Alice's console is not an AAuth server and gets no hostname here. To open it on a phone it needs one of its own, and Julián's passkey `RP_ID` and `RP_ORIGINS` must match that hostname before anyone registers.

## Once

1. **Tunnels and DNS.** On a laptop logged in to the account (`cloudflared tunnel login`), create `ef-hack-bob` and `ef-hack-alice`, and route the hostnames to them, as in the README. Keep the id each `tunnel create` prints.
2. **Checkouts.** On both laptops, use the same commit and run `npm ci --ignore-scripts`.
3. **`.env`.** On both laptops, `.env` at the repo root needs the same three lines:

   ```bash
   AAUTH_PS=https://ps.<domain>
   AAUTH_AGENT=https://bob-agent.<domain>
   AAUTH_RESOURCE=https://alice.<domain>
   ```

4. **Tunnel config.** Each side writes its own config from `.env`:

   ```bash
   node tunnel.mjs config bob --tunnel <ef-hack-bob id> --out ~/.cloudflared/ef-hack-bob.yml        # Bob's laptop
   node tunnel.mjs config alice --tunnel <ef-hack-alice id> --out ~/.cloudflared/ef-hack-alice.yml  # Alice's laptop
   cloudflared tunnel --config ~/.cloudflared/ef-hack-bob.yml ingress validate
   ```

   The config names the credentials file `~/.cloudflared/<id>.json`, which `tunnel create` wrote on the laptop that ran it. A laptop without that file runs with the tunnel's token instead: `cloudflared tunnel token <name>` prints it. Hand it over in person, never through git or notes. Add `--token <token>` after `run` in the commands below. The token route is untried here.
5. **Keys.** Leave `.keys/` alone. Each side generates its own keys on first start and publishes the public halves, so nothing is copied between the laptops.

## Each run

| Bob's laptop | Alice's laptop |
|---|---|
| `npm run bob` | `npm run alice` |
| `cloudflared tunnel --config ~/.cloudflared/ef-hack-bob.yml run` | `cloudflared tunnel --config ~/.cloudflared/ef-hack-alice.yml run` |
| `node tunnel.mjs check` | `node tunnel.mjs check` |

`tunnel.mjs check` fetches each server's metadata at its public URL and confirms that the `issuer` it reports matches the identifier in `.env`. Passing it from both laptops shows that DNS, TLS, both tunnels and all three servers line up. Then, on Bob's laptop:

```bash
npm run mission          # QR code: Bob approves the mission on his phone
node mission-check.mjs   # Bob's side against -11, through the tunnel
npm run mcp-config       # then Claude Code, as in the README
```

`npm run check` answers some cases as Alice through her `/api`, so on Bob's laptop it needs `ALICE_CONSOLE_TOKEN` set to Alice's token. Without it, the script generates a token of its own and Alice's server refuses it. The token is a secret, so hand it over in person.

## When a hop fails

| Symptom | Cause | Fix |
|---|---|---|
| `check`: ENOTFOUND | No DNS record, or a cached miss | `cloudflared tunnel route dns`, then wait a few minutes or try another network |
| `check`: ERR_TLS_CERT_ALTNAME_INVALID | The hostname is two levels under the zone | Use a first-level hostname |
| `check`: 530 | No tunnel connected for that hostname | Start cloudflared on that side and read its log |
| `check`: 502 | The tunnel is up, but nothing answers on the port | Start `npm run bob` or `npm run alice`. The servers listen on 127.0.0.1 only, which is why the config says 127.0.0.1 and not localhost |
| `check`: 404 | No ingress rule for the hostname, or DNS points it at the other side's tunnel | Rerun `tunnel.mjs config`, restart cloudflared, check `route dns` |
| `check`: wrong issuer | The server started with other `AAUTH_*` values, for example without `.env` | Fix `.env` and restart the server |
| cloudflared cannot connect | The network blocks port 7844, which cloudflared uses to reach Cloudflare over QUIC and then HTTP/2 | Try `--protocol http2`, or tether to a phone |
| Signature or `clock_skew` errors on one side only | The laptops' clocks differ | Turn on automatic time on both |

Don't set `httpHostHeader`: the HTTP signatures cover the public hostname in `Host`. The fallbacks are both tunnels plus `npm run world` on one laptop, or quick tunnels. The README covers both.
