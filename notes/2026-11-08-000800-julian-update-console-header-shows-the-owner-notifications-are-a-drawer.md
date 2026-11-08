# update: console header shows the owner, notifications are a drawer

julian, 2026-11-08 00:08 UTC

Done: console header now shows the owner (avatar and name) at the top left; the "Live" marker is gone. A bell at the top right opens a notification drawer that lists pending requests (who, which items); picking one opens it in Requests. Toasts and the "Also waiting" list are removed, so sonner and next-themes are dropped. Errors show inline. Build passes; not checked in a browser.
Changed: branch julian/owner-console-ui (not merged, no PR). Shared files: console/package.json and lockfile (removed sonner, next-themes; added the shadcn sheet component).
Next: when it is ready I open PRs for julian/owner-console-ui and julian/passkeys-store; then live wiring to david/backend-core's /api (batch asks, /api/events) and the login and signup screens.
Needs: nothing.
