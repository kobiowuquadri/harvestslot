# Test results

Every result below comes from a command that was actually run on the build machine (Windows 11, Node 24.16, 4 cores, PostgreSQL 18.4 via `embedded-postgres`). Nothing here was run in Docker or CI: Docker is not installed on this machine, and the CI workflow has not executed yet.

Last full run: **2026-10-24**.

### Re-run after adding the second crop (2026-11-21)

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | pass |
| Typecheck (all packages and apps) | `pnpm typecheck` | pass |
| Unit tests | `pnpm test` | 164 passed (config 17, contracts 14, db 72, core 53, api 8); web and worker have no unit tests |
| Integration tests (embedded PostgreSQL, migrations applied fresh) | `pnpm --filter @harvestslot/api test:integration` | 27 passed in 5 files, including `crops.test.ts` (2) |
| Demo seed on a fresh local database | `pnpm --filter @harvestslot/api seed` | completed: 20 users, 7 organisations, 28 harvest requests, 14 bookings |
| API smoke test of the crop journey (demo personas) | scratch script against a local API | tomato harvests match only the tomato buyer; each buyer's requests show only its crop |
| Browser tests (Playwright) | `pnpm test:e2e` | **not re-run** for this change; texts changed in two specs were updated by hand |

### Re-run after the 2026-11-16 redesign

Only the web app and the browser tests changed (DECISIONS #28–#32), so these checks were run again on 2026-11-16:

| Check | Command | Result |
|---|---|---|
| Lint (whole repository) | `pnpm lint` | **0 problems** |
| Type check (web) | `pnpm --filter @harvestslot/web typecheck` | **passed** |
| Production build (web) | `pnpm --filter @harvestslot/web build` | **passed** (includes the new `/credits` page) |
| Colour contrast of design tokens | `pnpm --filter @harvestslot/web contrast` | **21 of 21 pairs pass** WCAG AA |
| Browser tests, including axe-core WCAG 2.1 AA | `pnpm test:e2e` on ports 3100/4200/4300 ([Running beside `pnpm dev`](#running-beside-pnpm-dev)) | **21 passed** in 6.0 min |

Package unit tests, API integration tests and the load test were not re-run, because no API or shared-package code changed.

Two browser-test problems were fixed along the way:
* The farmer happy path checked for "Reported by payer" while the report-payment dialog was still open. The dialog's description contains that phrase, so the check could pass before the payment was saved. The test now waits for the dialog to close and matches the badge text exactly. This was a defect in the test, not the product.
* The first redesign run failed the focus-visibility check because form fields had replaced the focus outline with a faint halo. Fields now use the standard 2px green outline.

| Check | Command | Result |
|---|---|---|
| Lint (whole repository) | `pnpm lint` | **0 problems** |
| Type check (all packages and apps) | `pnpm typecheck` | **passed** |
| Unit tests | `pnpm test` | **137 passed**: contracts 14, db 70, core 32, config 13, api 8 |
| Integration tests (real PostgreSQL) | `pnpm test:integration` | **21 passed** in 4 files (≈ 2 min), clean exit |
| Production build (all packages and apps) | `pnpm build` | **passed** (web: 66 routes) |
| Browser tests (Playwright, Chromium) | `pnpm test:e2e` | **21 passed** in 9 files (see below) |
| Booking race / load test | `node tests/load/booking-race.mjs` | **passed** (see below) |
| OpenAPI export | `pnpm --filter @harvestslot/api openapi:export` | 188 paths → `docs/openapi.json` |
| Colour contrast of design tokens | `pnpm --filter @harvestslot/web contrast` | all pairs pass WCAG AA |
| Demo seed | run by `e2e/stack.mjs` on a fresh database at every browser-test start (and `pnpm db:seed` on the dev database) | completed (counts in DEMO_SCRIPT.md) |
| Docker images / Compose | — | **not run** (no Docker on this machine); `images` CI job builds them |

## Unit tests

* `packages/contracts` — money rounding (half-up, single rule), kg/tonne/gram conversions, Naira formatting, farmer net estimate, **quantity validation never throws on malformed input** (regression for a bug found by the browser tests), harvest form validation paths.
* `packages/core` — readiness checks, state-machine transitions (valid/invalid), terms hashing and material-change detection (carry-forward), matching eligibility and ranking explanations.
* `packages/db` — Prisma enums match the shared contract enums (70 checks).
* `packages/config` — production safety: demo mode, dev tools, simulator, insecure cookies, missing MFA, http base URL, filesystem storage, dev mail capture, localhost origins and test Paystack keys are each refused; demo/dev features are never allowed in production.
* `apps/api` — TOTP/HOTP against the **RFC 6238 / RFC 4226 test vectors**, clock-drift window, recovery-code format, CSRF tokens bound to session and secret, expiring per-user attachment links, AES-256-GCM secret storage with tamper detection, CSV formula-injection guard.

## Integration tests (`apps/api/test/integration`, real PostgreSQL, migrations applied with `prisma migrate deploy`)

* **booking-flow (3)**: request → explained matches → offer (capacity hold) → acceptance → transport quote/assignment → readiness true only when every party confirmed; amendment invalidates stale approvals; DRAFT preparation by a representative.
* **concurrency (11)**: two requests racing for the last capacity (one wins); concurrent allocations never exceed a request's supply; vehicle double-booking refused; driver overlap blocked by the exclusion constraint; confirmation racing hold expiry (three timings) yields one valid outcome; lazy expiry on read; duplicate cancellation releases once; expired offer cannot be accepted; rejected amendment leaves the previous version intact; delegation scope and revocation enforced.
* **fulfilment (5)**: demo steps 8–12 (1,900 kg delivered → 1,800 accepted / 100 rejected → farmer accepts → produce invoice on 1,800 kg → payment reported then confirmed by the payee); simulator payment events are idempotent and out-of-order safe; forged webhook refused; payment evidence cannot mark an invoice provider-verified; dispute adjustment; transport cancellation and replacement; upload validation and authorisation.
* **outbox (2)**: provider failure → FAILED with backoff → retry without double send; dead-letter after max attempts and re-queue.

Two test-isolation problems surfaced when files ran in a different order (shared database): the outbox tests now settle other files' queued events first, and the matching test gives its fixture a distinct price. A Windows-only teardown lock (`EBUSY` on the embedded server's temp directory) no longer fails the run. None was a product defect.

## Browser tests (`e2e/tests`, Playwright 1.64 + Chromium, isolated stack)

`e2e/stack.mjs` drops and recreates `harvestslot_e2e`, applies migrations, loads the demo seed, and runs the built API, worker and web app with `APP_ENV=test`.

### Running beside `pnpm dev`

The default ports (web 3000, API 4000, worker health 4100) clash with a running `pnpm dev`. To use other ports, build the web app against the test API port (Next.js fixes its rewrites at build time), run the suite, then rebuild so `pnpm start` uses the default port again:

```
API_INTERNAL_URL=http://localhost:4200 pnpm --filter @harvestslot/web build
E2E_BASE_URL=http://localhost:3100 API_PORT=4200 API_INTERNAL_URL=http://localhost:4200 WORKER_HEALTH_PORT=4300 pnpm test:e2e
pnpm --filter @harvestslot/web build
```

| Spec | Tests | What it proves |
|---|---|---|
| farmer-happy-path | 1 | Demo steps 1–12 in the browser across five sessions (farmer on a phone viewport, processor, dispatcher, driver on a phone with GPS, receiving): registration, location, 2,000 kg request, explained matches, offer, acceptance, quote, acceptance, driver assignment, readiness, harvest, collection, handover, delivery, weighing 1,900 kg, 1,800/100 decision with evidence, farmer acceptance, ₦450,000 invoice, payment reported and confirmed. |
| access-control | 5 | Signed-out redirect and 401; another farmer's booking is 404 by URL and API (reads and writes); non-admin refused admin pages/API; CSRF required; unknown demo persona refused. |
| offline-draft | 2 | Draft kept on the phone while offline (nothing sent), sent once after reconnecting; editing a request changed elsewhere shows a conflict instead of overwriting. |
| mobile-and-validation | 6 | No horizontal overflow at 360 px, 820 px and 1366 px on six farmer screens; bottom navigation, menu dialog and Escape; registration and wizard validation messages. |
| cooperative | 1 | Representative with data-entry permission can create requests and only *prepare* an acceptance (API refuses approval with `DELEGATION_SCOPE_MISSING`); after recorded consent to approve sales, approval succeeds and the confirmation records acting-for. |
| processor | 1 | Facility and line created in the UI, a week of slots published, overlapping slot refused, capacity adjusted with a reason. |
| cancellation-and-dispute | 2 | Transporter cancels; booking becomes not ready; a replacement transporter sees a REPLACEMENT opportunity, the processor accepts, the farmer's confirmation is carried forward. Partial acceptance: the farmer disputes the rejected quantity in the UI; the undisputed 1,800 kg is still invoiced; the processor replies in the dispute thread. |
| accessibility | 3 | axe-core WCAG 2.1 A/AA rules: zero violations on public pages, sign-in, and farmer/processor/driver working screens; dialogs keep focus inside, have names, show a focus indicator, and return focus to their opener. |

Total: **21 passed in a single run of all specs (4.7 min including stack start-up)**.

Defects these tests found and that were fixed: wizard could not advance (quantity validator threw), offer table unreachable on phones, page overflow from CSS grid sizing, offline save navigated to a page that cannot load offline, stale version sent by a quick second tap, dialogs not returning focus, invalid ARIA on the invoice filter, a processor-side transport-cancel button the API (correctly) refuses, a representative's prepared acceptance not explained, invited staff unable to create an account.

## Load / race test (`tests/load/booking-race.mjs`)

Run against the isolated stack on the same laptop (API, worker, web and PostgreSQL all local; requests go through the Next.js same-origin proxy):

```
setup A: 1 processor and 20 farmers with 1,000 kg requests (5.2s)
race A: 20 simultaneous 1,000 kg offers on a 5,000 kg slot in 1580 ms → {"201 OK":5,"409 CAPACITY_EXCEEDED":15}; p50 1440 ms, p95 1563 ms, max 1576 ms
        slot after race: held 5000.000 kg, committed 0.000 kg, available 0.000 kg
race B: 5 simultaneous acceptances of 1,000 kg offers on a 2,000 kg request in 782 ms → {"409 INVALID_STATE_TRANSITION":3,"200 OK":2}; p50 726 ms, p95 779 ms, max 779 ms
        request after race: allocated 2000.000 kg of 2000.000 kg
reads: 200 requests in 5.7s (35/s with 40 in flight), errors 0; p50 790 ms, p95 1967 ms, max 2028 ms
PASSED: no capacity or supply was oversold; every losing request was refused cleanly.
```

In race B the losing acceptances report `INVALID_STATE_TRANSITION` because the winning acceptances lapse offers that no longer fit the remaining supply (DECISIONS #10). These figures describe this laptop only; **no claim is made about production throughput**.

## Not verified here

* Docker images, Docker Compose files and the Caddy configuration (no Docker on this machine).
* The CI workflow (not yet executed on GitHub).
* Paystack (no credentials; the adapter is *awaiting credentials*), Termii SMS, real SMTP delivery, S3/MinIO object storage, ClamAV scanning — see the integration table in README.md.
* Restore drill script (`infra/production/restore-test.sh`) — needs Docker.
