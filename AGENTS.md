# AGENTS.md

Guidance for AI agents (and humans) working in this repo. Read this before making changes — it captures conventions that aren't obvious from the code alone.

## What this is

React frontend for SolarOS, replacing the old vanilla-JS site at the sibling repo `../solaros-online`. Talks to the FastAPI backend at `../solaros-online-backend` — that repo's `ApiSpecs.md`/`DbSchema.md` are the nominal API contract, but **the backend's live `http://127.0.0.1:8000/openapi.json` is the actual source of truth** when the two disagree. This has happened more than once: `ApiSpecs.md` called the agreement public-accept endpoint "deferred," but it's implemented and working; several Quote fields (`price_per_watt`, `gst_rate`, `daily_yield`, etc.) were added to the live schema after a gap-analysis conversation without the prose being updated everywhere. Before building against an endpoint, check `openapi.json`'s `components.schemas` for the real field names/types/required-ness, not just the markdown doc.

Old repo (`../solaros-online`) is a vanilla HTML/JS/CSS static site with no build step, migrated from feature-by-feature. When porting a feature, its business logic (calculations, regex extraction, field names) is usually worth reading first — see "Ported logic" below.

## Stack

React 19 · TypeScript · Vite · react-router-dom · **no state management library, no UI component library, no CSS framework**. Styling is hand-written CSS per page/feature, using CSS custom-property tokens from `src/styles/tokens.css` (colors, radius, shadow, font). No test suite exists — verification is `npx tsc -b` (typecheck) plus manually driving the app against the real local backend (see "Verification convention" below).

## Layout

```
src/api/              one file per backend domain (leads.ts, quotes.ts, amcPlans.ts, ...) —
                       thin wrappers around apiRequest(), typed request/response shapes
src/lib/               cross-cutting: AuthContext, ProtectedRoute, RequireSystemAdmin,
                       roles.ts, AppLayout (sidebar/topbar shell), and two ported
                       calculation engines (quoteCalculations.ts, billExtractor.ts)
src/pages/<domain>/   one folder per feature area, each with its own page component(s)
                       and a co-located .css file (e.g. pages/quotes/QuoteBuilderPage.tsx
                       + QuoteBuilderPage.css)
src/styles/tokens.css  shared design tokens, imported once in main.tsx
src/App.tsx            all routing — public routes, /login|/register|/activate,
                       /app/* behind ProtectedRoute, /app/admin/* additionally behind
                       RequireSystemAdmin
```

`src/pages/teams/` exists as an empty directory from the initial scaffold — Phase 10 hasn't been built yet, don't assume anything lives there. `src/pages/projects/` now holds Phase 8 (`ProjectsPage`, `ProjectDetailPage`).

## Conventions to follow

**API client pattern.** Every backend domain gets one `src/api/<domain>.ts` file: typed request/response interfaces plus thin functions calling `apiRequest<T>(path, opts)` from `src/api/client.ts`. `apiRequest` handles the `Authorization: Bearer` header, JSON (or `FormData` for file uploads — see `uploadBrandingLogo`/logo upload), and throws `ApiError` (with `.status`/`.code`/`.message`) on any `{"error": {...}}` response — catch `ApiError` specifically in UI code, don't parse `.message` blindly since `.code` is more stable. Don't call `fetch` directly from a page component.

**Decimal fields come back as strings.** Backend Decimal columns (`total_amount`, `subsidy_amount`, `rate_per_kw`, etc.) serialize as JSON strings, not numbers, to avoid float precision loss. Wrap with `Number(...)` before doing math; the TS types in `src/api/*.ts` already mark these as `string | null` to make this explicit at the type level — don't "fix" the type to `number`.

**Auth is a bearer token in `localStorage`**, not cookies. `src/api/client.ts` holds it in a module-level variable synced to `localStorage`; `AuthContext` (`src/lib/AuthContext.tsx`) restores the session on page load via `GET /me` if a token exists, so a reload doesn't lose login state. Role-based landing/redirects live in `src/pages/HomeRedirect.tsx` and `src/lib/roles.ts` (`isSystemAdmin`) — system admins land on `/app/admin/entities`, entity users on `/app/leads`.

**The "add one line at a time" list editor is the standard pattern for any string-array field** editable by the user — AMC plan inclusions, entity Documents tab (quote_notes/agreement_notes/custom_terms_and_conditions), Quote/Agreement terms. One text input + an "+ Add" button (Enter key also works), existing entries render as removable chips below. This replaced an earlier newline-split-textarea approach that the user explicitly asked to change — don't reintroduce a textarea for a string-array field; copy the pattern from e.g. `src/pages/amc/AmcPlanForm.tsx` or `src/pages/entity/tabs/DocumentsTab.tsx`.

**Quote and Agreement share one calculation engine and one visual language, deliberately.** `src/lib/quoteCalculations.ts`'s `computeQuote()` is a pure port of the old repo's `quote-render.js` `compute()` — base cost, GST, subsidy (explicit amount or the residential-only PM Surya Ghar ladder via the exported `subsidyForKw()`), net investment, generation/savings/payback, 25-year lifetime savings, CO2/tree impact, payment milestones. **Agreement has no pricing/system fields of its own** (confirmed via the live `AgreementResponse` schema — just `terms`/`amc_id`/`amc_duration_years`/`status`/`signed_at`), so `AgreementBuilderPage` always computes from the lead's linked Quote, shown as a read-only "From quote" block, and reuses `QuoteBuilderPage.css` directly (`import "../quotes/QuoteBuilderPage.css"`) rather than duplicating the preview-panel styles. If Quote's calc logic changes, Agreement's preview changes with it for free — that's intentional, keep it that way.

**Entity document-customization defaults fold into the editable list, they don't stay separate.** `document_customization.custom_terms_and_conditions` + `quote_notes` (or `agreement_notes` for agreements) are merged into one `terms` array when a new Quote/Agreement is created — not kept as a separate free-text "Notes" field the admin has to reconcile. Each merged line is individually addable/removable via the same list editor. See the `terms:` construction in `QuoteBuilderPage`'s/`AgreementBuilderPage`'s load effect.

**Locked-state fields, not locked-state pages.** Once a Quote/Agreement's status leaves the editable state (`GENERATED`/`NEW`), don't hide the form — disable every input (`disabled={locked}`) and hide the remove/add controls, so the admin can still see exactly what was agreed. Matches the backend's `QUOTE_LOCKED`/`AGREEMENT_LOCKED` errors, which fire on write attempts past that point.

**Share links load eagerly, never behind a manual button.** `POST .../share` (quotes and agreements) is idempotent — same URL on every call once one exists, per `ApiSpecs.md`. Fetch it in a `useEffect` keyed on the quote/agreement id as soon as one exists, rather than requiring a "Get share link" click. (Quote's token *does* get replaced if the original is consumed by an accept action — that's expected, not a bug, since a consumed token can't be reused; Agreement's stays stable even after acceptance.)

**Auto-filled defaults must land in the actual input, not just the live preview.** If a value has a computed fallback (e.g. suggested subsidy amount, AMC duration defaulting to 1 year on plan selection), pre-populate the form field itself — don't rely on the preview alone to show what "will" be used. Track whether the admin has manually overridden a computed default with a `*Touched` boolean state (see `subsidyTouched` in `QuoteBuilderPage`) so autocompute doesn't clobber a real edit.

**Role-based route trees, not role-based components.** System-admin-only pages live under `/app/admin/*` behind `<RequireSystemAdmin />` in `App.tsx`; everything else behind `<ProtectedRoute />` alone. Sidebar links in `AppLayout.tsx` are conditionally rendered on `systemAdmin`/`user?.entity_id`, mirroring the route guards — keep both in sync when adding a page.

**Ported logic gets a comment explaining the port, not a rewrite from scratch.** `quoteCalculations.ts` and `billExtractor.ts` (electricity-bill PDF extraction, using `pdfjs-dist` as a real npm dependency instead of the old repo's CDN script) are line-for-line ports of working regex/math from the old repo, with the old repo's dead code (an unreachable Tesseract OCR fallback) deliberately dropped rather than carried forward. When porting another old-repo feature, check whether a referenced library/script tag is actually loaded anywhere before assuming it's live — `bill-extractor.js` referenced Tesseract but no page ever loaded it.

**`WorkOrderStatusResponse.project_status` is always populated, not just when the project actually advanced.** It reflects the parent project's status *after* the call either way — the backend only moves the project when the work order's `type`/`COMPLETED` transition matches the mapping table and the project is still at the exact fromstatus, and silently no-ops otherwise (no error). Don't word a UI message as "project moved to X" off this field alone unless you've confirmed a real transition happened (in practice: only surface it on `COMPLETED`, and phrase it as current state — "Project is now X" — not as a claimed move); this bit during Phase 9 verification (`ProjectDetailPage`/`WorkOrderDetailPage`'s transition handler).

## Verification convention

There's no automated test suite. Every feature in this repo has been verified by: `npx tsc -b` for typecheck, then driving the actual UI in a browser against the real local backend (`../solaros-online-backend`, must be running — see this repo's README), and cross-checking persistence with direct `curl` calls to the backend API. When the browser-automation pane gets visually stuck (a recurring flakiness in this environment, not an app bug), prefer DOM inspection via `javascript_tool`/`read_page` over trusting a screenshot — confirmed multiple times that a frozen-looking screenshot doesn't mean the app is actually broken.

Test data accumulates in the local Postgres DB across sessions (leads named "Test X", extra AMC plans, etc.) — that's expected and fine for a dev DB; don't feel obligated to clean it up unless it's actively confusing a specific test.

## Environment & config

`.env.development` sets `VITE_API_BASE_URL` (defaults to `http://127.0.0.1:8000/api/v1`). The dev server is **pinned to port 3000** in `vite.config.ts` (`server.port` + `strictPort`) because the backend's local `CORS_ORIGINS` only allows `http://localhost:3000` — don't change one without the other. See the README for the full local-dev walkthrough (pulling activation tokens from Postgres when `RESEND_API_KEY` isn't set, approving a test entity via the seeded system admin, etc.).

## Build status

Phases roughly follow the backend's `usecases.txt` ordering. As of this writing:

| Phase | Scope | Status |
|---|---|---|
| 0 | Scaffold (React+Vite+TS, API client, auth, routing) | Done |
| 0.5 | Public marketing site (landing page) | Done — offgrid calculator intentionally not ported |
| 1 | Auth & entity self-registration | Done |
| 2 | System admin (entity approval + `/admin/users`) | Done |
| 3 | Entity management (business info, preferences, entity users) | Done |
| 4 | AMC plans | Done |
| 5 | Leads (list/add/detail/edit/status, PDF bill autofill) | Done |
| 6 | Quotes (builder, live calc, share, public accept) | Done |
| 7 | Agreements (builder, share, public accept) | Done |
| 8 | Project lifecycle | Done — list (`/app/projects`, default view excludes `COMPLETED`/`REJECTED` per backend default), detail with a status stepper and the linear `PATCH .../status` transitions (next-in-chain button + `REJECTED` escape hatch from any non-terminal state), cross-linked from Lead detail once `AGREEMENT_ACCEPTED` via `GET .../leads/{leadId}/project` |
| 9 | Work orders | Done, scoped to project-created work orders only (not the lead-scoped pre-project creation path, deferred per your note) — a "Work orders" section on Project detail (type/notes create, disabled for a type already open per the backend's one-open-per-type-per-lead rule) and a dedicated `/app/work-orders/:id` detail page (status transition, assignment, delete-while-`NEW`). Assignment is user-only for now — `assignee_type: TEAM` is deferred until Phase 10 gives teams a management UI to pick from |
| 10 | Teams | Not started |

## Safety notes for agents

- `git status` before any command that could discard uncommitted work, per the standing repo-wide instruction.
- This repo's established practice has been to commit after each verified, working change with a descriptive message (see `git log` for the pattern/detail level expected) — but only when the user has actually asked for the feature; don't build ahead of what's been requested.
- Never fabricate verification — if the backend isn't running or a check can't actually be performed, say so rather than claiming something works.
