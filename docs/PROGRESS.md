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
- Phase 3: next — receiving/processing, invoicing/payments (+ Paystack webhook & simulator), disputes, shipments already done.
- Phase 4/5: not started (worker app, uploads, notifications API, admin, analytics, privacy, seed, web, e2e, docker, CI, docs).

## Checks actually run (latest)
- `packages/contracts`: vitest — 12 passed.
- `packages/core`: vitest — 32 passed.
- `packages/db`: vitest enum drift — 70 passed.
- `apps/api` integration (real PostgreSQL 18, embedded): 14 passed (booking-flow 3, concurrency 11).
- `tsc -b` clean for config, contracts, db, core, api.

## Log
- 2026-10-23: Spec read; repo audited (spec only). Toolchain/version research. Architecture, domain doc, checklist, decisions written.
- 2026-10-23: Foundation packages + schema/migrations; core domain with unit tests. Commit d1bac1c.
- 2026-10-23: API modules for the core slice; integration harness; commit 55aba01.
- 2026-10-23: Concurrency tests (capacity race, supply race, vehicle double-booking, exclusion constraint, hold-expiry race, lazy expiry, duplicate cancellation, amendments, delegation) all passing.

## Next concrete task
Phase 3 API: receiving/quality/processing module, invoicing + payments (report, receipt confirmation, refunds, Paystack checkout/webhook/verify, simulator), disputes; then the worker app (BullMQ postgres/redis backends) and the remaining platform modules (notifications, uploads, admin, analytics, privacy), then the seed, then the web app.
