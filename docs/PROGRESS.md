# Progress log (resumable checkpoint)

## Environment facts (build machine)
- Windows 11, Node 24.16.0, pnpm 10.34.6, git 2.54. 4 CPU cores.
- **No Docker, no WSL distribution, no native PostgreSQL/Redis.** Real PostgreSQL 18 runs via `embedded-postgres`:
  - Dev DB: `pnpm infra:local` (data in `.local/postgres`, port 5432, user/pass `harvestslot`).
  - Integration tests start their own disposable embedded cluster (UTF-8) unless `TEST_DATABASE_URL` is set.
- Redis/MinIO/Mailpit are not available here → local `.env` uses `QUEUE_BACKEND=postgres`, `STORAGE_DRIVER=filesystem`, `MAIL_TRANSPORT=dev-capture`, `PAYMENT_PROVIDER=simulated`.
- Gotchas found: embedded PG on Windows defaults to WIN1252 → always init with `--encoding=UTF8`; keep migration SQL ASCII. Vitest + unplugin-swc cannot transform the global-setup module → it is plain `.mjs`. Python edits on Windows write CRLF (git normalises via .gitattributes).

## Status by phase
- Phase 1 foundation: **done** (workspace, env validation, schema + 2 migrations, contracts, core domain, auth/security, organisations).
- Phase 2 core booking slice: **API done and integration-tested** (farmers/coops, facilities/slots, harvests, matching/inbox, offers, booking engine, transport quotes/assignments, readiness). Web UI not started.
- Phase 3 API: **done and integration-tested** (receiving/quality/processing, invoices, payments + simulator/Paystack adapter, disputes, cancellation/replacement transport).
- Phase 4 API: uploads, notifications, admin, analytics, privacy **done**; worker app **done** and run locally on BullMQ's PostgreSQL backend (all 7 schedules executed; health endpoint OK).
- Phase 5: demo seed **done** (`pnpm db:reset --confirm && pnpm db:seed`), runs the real services under a seed-only clock. Web app, e2e, docker, CI, docs: not started.

## Checks actually run (latest)
- `packages/contracts`: vitest — 12 passed.
- `packages/core`: vitest — 32 passed.
- `packages/db`: vitest enum drift — 70 passed.
- `apps/api` integration (real PostgreSQL 18, embedded): booking-flow 3, concurrency 11, fulfilment 5, outbox 2 — all passed (each file run separately on this slow machine; ~80–125 s each).
- Seed on local DB: completed; counts printed (15 bookings in 7 states, 14 invoices, 2 disputes).
- Known warning: pg prints a one-time "client.query() when the client is already executing a query" deprecation warning (from a dependency path; not yet traced).
- `tsc -b` clean for config, contracts, db, core, api.

## Log
- 2026-10-23: Spec read; repo audited (spec only). Toolchain/version research. Architecture, domain doc, checklist, decisions written.
- 2026-10-23: Foundation packages + schema/migrations; core domain with unit tests. Commit d1bac1c.
- 2026-10-23: API modules for the core slice; integration harness; commit 55aba01.
- 2026-10-23: Concurrency tests (capacity race, supply race, vehicle double-booking, exclusion constraint, hold-expiry race, lazy expiry, duplicate cancellation, amendments, delegation) all passing.

## Next concrete task
Web app (apps/web): Next.js 16 + Tailwind 4 design tokens, UI primitives, API client with CSRF/idempotency, auth pages, role dashboards and all workflows; PWA; then e2e (Playwright), Docker/Caddy/CI, docs.
