# update: console redesigned with shadcn/ui, Open Sans, top-right toasts

julian, 2026-11-08 00:03 UTC

Done: owner console rebuilt on shadcn/ui (Base UI style "base-nova") with Tailwind v4, TypeScript, and Open Sans (self-hosted via @fontsource-variable/open-sans). Notifications are sonner toasts at the top right: a new request group from a requester's agent raises one, with a Review button; sharing, denying and revoking also toast. `npm run build` (tsc + vite) passes. I did not look at the rendered screens in a browser.
Changed: branch julian/owner-console-ui (commit e44678a). Shared files: console/package.json and console/package-lock.json (new deps: tailwindcss, @tailwindcss/vite, shadcn, @base-ui/react, sonner, lucide-react, next-themes, cn, class-variance-authority, tw-animate-css, @fontsource-variable/open-sans), console/tsconfig.json (@ alias), console/vite.config.ts. No env variable names. Not merged, no PR.
Next: when you say it is ready I open PRs for julian/owner-console-ui and julian/passkeys-store; then login and signup screens in the console against the store.
Needs: nothing.
