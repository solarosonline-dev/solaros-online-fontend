# SolarOS Frontend

React + Vite + TypeScript frontend for the SolarOS platform, talking to the FastAPI backend in [`solaros-online-backend`](../solaros-online-backend) (cloned as a sibling directory).

## Prerequisites

- Node.js (see `.nvmrc` if present, otherwise any recent LTS)
- The backend running locally — see `../solaros-online-backend/README.md` for its own setup (Postgres via Docker, `make db-up`, `make migrate`, `make run`)
- Docker, if you need to inspect the local Postgres DB directly (see below)

## Local development

```bash
npm install
npm run dev
```

The dev server is pinned to **port 3000** (`vite.config.ts`) because the backend's local `CORS_ORIGINS` only allows `http://localhost:3000`. Don't change the port without also updating `CORS_ORIGINS` in the backend's `.env` and restarting it.

The frontend expects the backend at `http://127.0.0.1:8000/api/v1` (`.env.development`, `VITE_API_BASE_URL`). If your backend runs on a different port, update that file.

## Typecheck / build

```bash
npm run build
```

runs `tsc -b && vite build`. Use this (or `npx tsc -b`) to verify types — **not** bare `npx tsc --noEmit`, which silently checks nothing from this repo's root: `tsconfig.json` is solution-style (`"files": []`, just references to `tsconfig.app.json`/`tsconfig.node.json`), so without `-b` there's nothing for plain `tsc` to check and it exits clean even with real type errors present.

## Auth token handling

The API client (`src/api/client.ts`) stores the session token (an opaque backend-issued string, not a JWT — see the backend's `AGENTS.md`) in `localStorage` under `solaros_token` and attaches it as `Authorization: Bearer <token>` on every authenticated request. `src/lib/AuthContext.tsx` holds the in-memory user object; `ProtectedRoute` redirects unauthenticated users to `/login`.

Login (`POST /auth/login`) accepts either an email address or a phone number in one `identifier` field — see `LoginPage.tsx`/`src/api/auth.ts`.

## Testing flows locally that require an email/activation token

The backend only sends activation emails if `RESEND_API_KEY` is set in its `.env`. In local dev it typically isn't, so the email step is skipped (logged, not sent) and you need to pull the token straight from the DB:

```bash
docker exec solaros-postgres psql -U solaros -d solaros -c \
  "SELECT token, purpose, purpose_object_id, expires_at, consumed_at FROM tokens ORDER BY token_id DESC LIMIT 1;"
```

Use that token's value as the `token` field in `POST /auth/activate`.

## Testing the entity-approval step locally

New entities register in `PENDING_APPROVAL` state and can't log in until a `SYSTEM_SUPER_ADMIN` approves them via `PATCH /admin/entities/{entityId}/state`. Check for a seeded system admin:

```bash
docker exec solaros-postgres psql -U solaros -d solaros -c \
  "SELECT u.user_id, u.email, u.state, r.name FROM users u JOIN user_roles ur ON ur.user_id = u.user_id JOIN roles r ON r.role_id = ur.role_id WHERE r.name LIKE 'SYSTEM%';"
```

Log in as that user, then call the approval endpoint with their token:

```bash
curl -X PATCH http://127.0.0.1:8000/api/v1/admin/entities/<entityId>/state \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"state": "ACTIVE"}'
```

## Project structure

```
src/
  api/            Typed API client + per-domain request functions
  lib/            Auth context, ProtectedRoute, shared frontend utilities
  pages/          One folder per domain area (auth, admin, entity, leads, quotes, agreements,
                  projects, workorders, teams — teams is still an empty placeholder, no
                  dedicated Teams management page yet). Work orders can belong to a Lead
                  directly (before a Project exists, e.g. an early site survey) or to a
                  Project — see LeadWorkOrders.tsx / ProjectWorkOrders.tsx.
  components/     Shared/reusable UI components (Modal, SignaturePad, CopyLinkButton)
legacy-reference/ Business-logic files ported from the old solaros-online repo
                  (finance-engine.js, quote/agreement renderers, translations)
                  — reference only, being ported into TS modules incrementally
```

## Backend contract

The backend's API is documented in `../solaros-online-backend/ApiSpecs.md` (endpoints, request/response shapes, error codes, state machines) and `../solaros-online-backend/DbSchema.md` (table definitions). Check these before building against an endpoint — they're the source of truth, not this README.

## Error handling convention

The backend returns errors as `{ "error": { "code": "STRING_CODE", "message": "..." } }`. The API client throws `ApiError` (`src/api/client.ts`) with `.status`, `.code`, and `.message` — catch it and branch on `.code` for specific error handling rather than parsing `.message`.
