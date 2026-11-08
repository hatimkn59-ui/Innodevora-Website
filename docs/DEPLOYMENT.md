# Production deployment

This project is a single Node.js process that serves the public website, the
chat API, the SQLite database and the admin dashboard. It is **not** a static
site and cannot run its backend on Netlify static hosting.

## Current status (verified 8 November 2026)

- `https://innodevora.netlify.app/` is live, but it is a static deployment.
- `https://innodevora.netlify.app/api/health` returns `404`.
- `https://innodevora.netlify.app/admin/` returns `404`.
- `innodevora.com` and `www.innodevora.com` do not currently resolve
  (`NXDOMAIN`). The custom domain is not connected.
- No production backend, admin session or live AI provider is deployed yet.
- Local verification is possible, but it is not a production deployment.

Do not claim the assistant is live until the health check, admin login and a
real chat request have all been verified on the production URL.

## Verified local results (8 November 2026)

These results were produced on a temporary, local production-mode instance.
They prove the code paths, not a production deployment.

- `npm test`: 39/39 passing. `npm run check` and `npm run build`: OK.
- Selected Work Playwright matrix at 1440, 1024, 768 and 390 px in light and
  dark mode: five tabs in the required order, five screenshots loaded at
  1600 px, address bar text and `href` updated per project, pill / preview /
  address bar / active tab opened the live site, inactive tabs only switched
  the preview, auto-rotation advanced and paused on hover, no console errors,
  no horizontal overflow.
- The five live project URLs returned HTTP 200.
- Production-mode runtime check (temporary SQLite, temporary admin hash,
  demo AI): 25/25 checks passed — health, admin page, login, session cookie,
  `/api/admin/me`, protected assistant/leads/audit endpoints, anonymous 401,
  consent and chat, cross-origin 403, session and database persistence across
  a server restart, and logout invalidation.
- The temporary Docker container used for earlier checks was removed; no
  production data was touched.

## Recommended target: Render (Docker + persistent disk)

`render.yaml` and `Dockerfile` are included. The disk is required because the
SQLite database, visitor sessions and IP-hash salt must survive restarts. A
free instance without a disk will lose data on every deploy or restart.

1. Push this repository to GitHub (the deployment uses the repository, not a
   manual drag-and-drop).
2. In Render, create a new **Blueprint** from the repository. Render reads
   `render.yaml`.
3. Choose the `starter` plan (or another plan that supports persistent disks).
4. Set the secret environment variables in the Render dashboard. Do not put
   them in Git.
5. Deploy. Wait for the health check at `/api/health` to pass.
6. Set `SITE_ORIGIN` to the final HTTPS origin, for example
   `https://innodevora.onrender.com` or `https://www.innodevora.com`.
   `COOKIE_SECURE=true` is already set for the Render service.
7. Connect the custom domain in Render only after its DNS is registered and
   controlled. Then update `SITE_ORIGIN` to the custom domain and redeploy.
8. Verify:
   - `GET https://<host>/api/health` returns `200` and `"ok": true`.
   - `GET https://<host>/admin/` returns the sign-in page.
   - The existing admin credentials work and sign-out works.
   - A real chat request returns an answer in English, French and Arabic.
   - A consented lead appears in the admin dashboard.
   - After a service restart, the conversation and lead are still present.

## Required environment variables

Only names are listed here. Values belong in the hosting provider's secret
store, never in this repository.

| Name | Purpose |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `PORT` | `3000` |
| `SITE_ORIGIN` | Final public HTTPS origin |
| `TRUST_PROXY` | `true` behind Render's proxy |
| `COOKIE_SECURE` | `true` on HTTPS |
| `DATA_DIR` | Persistent disk directory |
| `DATABASE_PATH` | SQLite file on the persistent disk |
| `KNOWLEDGE_PATH` | Optional override for `knowledge/INNODEVORA.md` |
| `ADMIN_USERNAME` | Existing admin username |
| `ADMIN_PASSWORD_HASH` | Existing scrypt hash; never a plaintext password |
| `ADMIN_ROLE` | `owner`, `admin` or `viewer` |
| `AI_API_URL` | OpenAI-compatible chat-completions endpoint |
| `AI_API_KEY` | Server-side AI provider key |
| `AI_MODEL` | Provider model name |
| `AI_KEYLESS_DEMO` | `false` in production |
| `AI_TIMEOUT_MS` | Provider timeout, for example `45000` |
| `IP_HASH_SALT` | Optional stable salt for IP rate-limit hashes |

## Existing admin credentials

The code already contains the login, session, CSRF, rate-limit and logout
logic. Do not create a second admin system and do not reset an existing
production password without approval.

- Local: `http://127.0.0.1:3000/admin/`
- Production: `https://<host>/admin/`
- If the production database already has an admin user, keep it and set the
  same `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` values in the host. Changing the
  hash in the environment does **not** rotate an existing database user.
- If a fresh database needs an admin, generate a hash locally:
  `npm run admin:hash`
  Then paste the printed value into `ADMIN_PASSWORD_HASH` and leave
  `ADMIN_PASSWORD` empty. This creates the first admin only when the
  `admin_users` table is empty.

## Assistant controls

After signing in, open **Assistant** in the admin sidebar:

- Pause or re-enable the visitor-facing chatbot.
- Edit the welcome message and additional owner instructions.
- Edit the suggested questions.
- See provider/knowledge status and 24-hour request, fallback, error and
  latency counts.
- Open recent conversations and their lead profiles.
- Review recent AI error metadata (never message content).

The built-in non-negotiable safety, privacy, consent and anti-invention rules
remain in `server/prompts.js`; additional instructions cannot override them.
Company facts live in `knowledge/INNODEVORA.md`.

## Netlify static hosting

Netlify can continue to serve a static preview, but it cannot run this Node
server, keep SQLite sessions across requests, or serve `/admin/` and `/api/*`.
If the frontend stays on Netlify while the backend is on Render, the app needs
a deliberate split-origin deployment with CORS, cookie-domain and CSRF review.
The recommended deployment is to serve the whole site from the Node process so
the existing same-origin protections remain intact.

## Restart and checks

- Render restarts the service automatically after a crash or deploy.
- The SQLite database and `ip-hash-salt` are on the mounted disk.
- Check `GET /api/health` after every deploy.
- Check the Render logs for startup errors and provider failures.
- The admin **Assistant** view shows recent AI error codes and usage.
- Back up the persistent disk regularly; SQLite is a single file plus its WAL
  files.
