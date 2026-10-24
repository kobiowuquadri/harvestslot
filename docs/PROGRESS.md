# Progress log (resumable checkpoint)

## Environment facts (build machine)
- Windows 11, Node 24.16.0, pnpm 10.34.6, git 2.54, 4 CPU cores. Chromium for Playwright is installed.
- **No Docker, no WSL, no native PostgreSQL/Redis.** Real PostgreSQL 18 runs via `embedded-postgres`:
  - Dev DB: `pnpm infra:local` (data in `.local/postgres`, port 5432, user/pass `harvestslot`), seeded with demo data.
  - Integration tests start their own disposable embedded cluster unless `TEST_DATABASE_URL` is set.
  - Browser tests and the load test use `e2e/stack.mjs`, which recreates `harvestslot_e2e` on the same server.
- Local `.env`: `QUEUE_BACKEND=postgres`, `STORAGE_DRIVER=filesystem`, `MAIL_TRANSPORT=dev-capture`, `PAYMENT_PROVIDER=simulated`, `DEMO_MODE=true`, `DEV_TOOLS_ENABLED=true`.
- Gotchas: embedded PG on Windows needs `--encoding=UTF8`; keep migration SQL ASCII. Vitest global setup is plain `.mjs`. Long bash heredocs containing quotes break in this shell — write files with the editor. The E2E stack uses ports 3000/4000/4100: stop `pnpm dev` first. Next.js page files may only export the page (move helpers to components).

## Status
All five phases are implemented. Checklist with honest statuses: `docs/IMPLEMENTATION_STATUS.md`. Not implemented by decision: embedded maps, road routing, AI voice drafts (DECISIONS #25). Written but not run here: Docker images/Compose/Caddy, CI workflow, backup/restore scripts.

## Checks actually run (2026-10-24, all passing) — details in TEST_RESULTS.md
- `pnpm lint` 0 problems · `pnpm typecheck` passed · `pnpm build` passed (web 66 routes)
- `pnpm test` 137 unit tests · `pnpm test:integration` 21 tests on real PostgreSQL
- `pnpm test:e2e` 21 Playwright tests in one run (4.7 min), incl. axe-core WCAG 2.1 AA checks
- `tests/load/booking-race.mjs`: capacity race 5/20 offers won, supply race 2/5 acceptances won, no overselling; reads 35 req/s on this laptop

## Log
- 2026-10-23: Spec read; architecture, domain doc, decisions. Foundation packages, schema/migrations, core domain (d1bac1c). API core slice and integration harness (55aba01). Concurrency tests (c555182). Fulfilment, finance, disputes, uploads, admin, analytics, privacy (d309984). Worker and demo seed (a0e8a68).
- 2026-10-24: Web app — public site, auth, app shell, all role workspaces, booking detail with live updates, receiving, invoices/payments, disputes, settings, admin, PWA (e3f305e). Browser tests and the UX fixes they surfaced (b0e5d66). Lint clean-up, unit tests for API security helpers and config safety, load test, Dockerfile, Compose (local + production), Caddy, backups/restore drill, CI, full documentation set.

## Next concrete tasks (if continuing)
1. Run the CI workflow on GitHub; fix anything the Linux/Docker jobs surface (images and Compose have never been built).
2. Rehearse `docs/DEPLOYMENT.md` on a staging VPS; run the restore drill; record results in TEST_RESULTS.md.
3. Exercise Paystack in test mode, SMTP and Termii with real credentials; update the integration table.
4. Optional features: embedded map view, OSRM routing adapter, fuller Yoruba translation reviewed by a fluent speaker, voice-to-draft.
