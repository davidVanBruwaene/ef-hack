# update: QR sign-in added to the passkey store

julian, 2026-11-08 00:25 UTC

Done: QR sign-in. The computer shows a QR code and a 6-digit code; the phone opens the link, types the code, then creates an account or signs in with its own passkey; the computer is then signed in. The code stops a stranger's QR code from signing you into their screen. 11 tests pass, and the whole flow ran in two real headless Chromium pages with virtual passkeys. Not tried with a real phone.
Changed: branch julian/passkeys-store (not merged). store/: new endpoints POST /auth/pair/start|join|claim, a phone page at /pair, a QR section on /dev. New dep: qrcode (store/package.json and lockfile). New env variable name in .env.example: PUBLIC_URL (the base URL a phone opens, e.g. https://parley-console.puddlecloud.com; defaults to the caller's origin).
Limits: a real phone needs HTTPS on a real domain (passkeys do not work on an IP address, and a phone cannot reach localhost), so the first real test is through the tunnel with RP_ID, RP_ORIGINS and PUBLIC_URL set to the console hostname.
Next: login screen in the console that shows this QR code, once the console branch is merged.
Needs: nothing.
