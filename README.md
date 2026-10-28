# STANDALONE_CLUEGA_DESIGN

Cluega Design as its own app: sign in, then land straight on the Flow workspace.
No chat, Pulse, dashboards or ads modules — only:

| Route | What |
| --- | --- |
| `/login`, `/select-org` | Sign in (email + password, optional Turnstile), organization picker |
| `/flow` | Design Home: hero, workflow agent launcher, recent projects |
| `/flow?tab=project` | Projects |
| `/flow?tab=usage` | Usage analytics |
| `/flow/brand-kit`, `/flow/brand-kit/new`, `/flow/brand-kit/<id>` | Brand Kit |
| `/workflow/<id>` | Workflow editor (`@dogclaw-ad/workflow` + agent panel) |
| `/policy` | Terms & policy (linked from the editor's account menu) |

`/` goes to `/flow`. Old product-app addresses (`/app/flow…`, `/app/workflow/…`)
redirect to the new ones; any other `/app/*` lands on `/flow`.

Split from `FRONTEND_CLUEGA_HOME` (`apps/app` + `packages/shared`) at commit
`eac73300d`. Files keep their original paths (`resources/app/pages/app/components/Flow/…`,
`components/workflow/…`), so a fix there can be carried over by path.

## Run locally

```sh
export NPM_TOKEN=<GitHub classic PAT with read:packages>   # private @dogclaw-ad/* packages
npm install
cp .env.example .env.local   # then fill in, see below
npm run dev                  # http://localhost:3000
```

Port 3000 is also the old monorepo's landing zone (`npm run dev:landing`); stop it first.

| Script | |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm run build` / `npm start` | Production build / serve on :3000 |
| `npm run typecheck` | `tsc --noEmit` (the build skips type checking) |
| `npm run lint` | ESLint (next core-web-vitals + typescript) |

## Environment

Every variable is described in [.env.example](.env.example). The backends are the same
as the product app's; the browser only ever calls this app's own origin
(`/api/v1/*` is proxied server-side to the CDP core API).

- **Required:** `APP_AUTH_SECRET` (signs the session cookie; required in production),
  `CDP_BACKEND_URL` and/or `NEXT_PUBLIC_CDP_API_URL`.
- **Recommended:** `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ARTIFACT_PUBLIC_BASE_URL`,
  `NEXT_PUBLIC_MEDIA_AI_API_URI`, `NEXT_PUBLIC_MID_PLATFORM_API_URL`, `NEXT_PUBLIC_GTM_ID`.
- **Optional:** `GOOGLE_FONTS_API_KEY`, `NEXT_PUBLIC_HELP_ZONE_URL`,
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (both or neither).

## Deploy to Vercel

1. Import the repository (framework: Next.js; defaults for install/build/output).
2. Project → Settings → Environment Variables:
   - `NPM_TOKEN` — needed at **install** time for `@dogclaw-ad/*` from GitHub Packages
     (`.npmrc` reads it from the environment).
   - Everything under *Required* and *Recommended* above. Set `NEXT_PUBLIC_SITE_URL`
     to the Vercel domain. A missing `APP_AUTH_SECRET` makes every production login fail.
3. If Turnstile is on, add the Vercel domain to the Turnstile widget.
4. After the first deploy, check:
   - **Upload size.** Uploads go through the `/api/v1` proxy, and Vercel Functions
     cap a request body at about 4.5 MB. Upload a file over 5 MB to a workflow; if
     it fails, send the upload prefix straight to the backend with a `rewrites()`
     rule to `CDP_BACKEND_URL`.
   - **Long streams.** The proxy declares `maxDuration = 300`; the plan's limit applies.
   - **OAuth returns.** The Post-to-social node's connect flow returns to this
     app's origin; the backend may need the new domain allowed.
