# HarvestSlot

**Harvest with a confirmed plan.** HarvestSlot coordinates fresh cassava harvests in Oyo State, Nigeria: before a farmer harvests, the platform confirms a buyer (processor), a processing slot with real capacity, and transport — and only then shows *Ready to harvest*. It then records collection, delivery, weighing, quality decisions, invoices, payment confirmations and disputes.

Roles: farmers (mobile-first PWA), processors (owner, manager, receiving officer, finance officer), transporters (dispatcher, driver), cooperatives (acting for members with recorded consent) and platform administrators.

> Demonstration data is fictional. No real business, farmer or partnership is implied, and the app makes no impact claims.

## Quick start

Requirements: Node 24 (22.12+ works), pnpm 10 (`corepack enable`). Docker is optional.

```bash
pnpm install
cp .env.example .env            # local defaults; edit if needed
```

**With Docker** (PostgreSQL, Redis, MinIO, Mailpit):

```bash
pnpm infra:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

**Without Docker** (Windows/macOS/Linux; real PostgreSQL 18 via `embedded-postgres`):

```bash
pnpm infra:local                # keep running in its own terminal (data in .local/postgres)
# in .env set: QUEUE_BACKEND=postgres, REDIS_URL=, STORAGE_DRIVER=filesystem,
#              MAIL_TRANSPORT=dev-capture, PAYMENT_PROVIDER=simulated
pnpm db:migrate
pnpm db:seed
pnpm dev
```

PowerShell users can run the same commands; `pnpm` scripts do not depend on a POSIX shell.

| Address | What |
|---|---|
| http://localhost:3000 | Web app (sign-in page has one-click demo personas in demo mode) |
| http://localhost:4000/api/v1 | API |
| http://localhost:4000/api/docs | OpenAPI / Swagger UI |
| http://localhost:4100/health | Worker health |
| http://localhost:8025 | Mailpit (Docker path) — or *Dev mailbox* in the app without Docker |
| http://localhost:9001 | MinIO console (Docker path) |

## Demo accounts

Password: **`HarvestSlot-Demo-2026`** (demo environments only).

| Role | Email |
|---|---|
| Farmer | farmer.adunni@demo.harvestslot.example |
| Processor manager | manager@ibadan-starch.demo.harvestslot.example |
| Receiving officer | receiving@ibadan-starch.demo.harvestslot.example |
| Finance officer | finance@ibadan-starch.demo.harvestslot.example |
| Transport dispatcher | dispatch@oke-ogun-haulage.demo.harvestslot.example |
| Driver | driver.tunde@demo.harvestslot.example |
| Cooperative representative | rep@akinyele-coop.demo.harvestslot.example |
| Administrator | admin@demo.harvestslot.example |

The walkthrough is in [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

## Commands

| Command | Does |
|---|---|
| `pnpm dev` | Builds shared packages, then runs API, worker and web with watch mode |
| `pnpm build` / `pnpm start` | Production builds / run the built apps |
| `pnpm lint` · `pnpm typecheck` | ESLint · TypeScript across the workspace |
| `pnpm test` | Unit tests (contracts, core, db, config, api) |
| `pnpm test:integration` | API integration tests on a real, disposable PostgreSQL (embedded, or `TEST_DATABASE_URL`) |
| `pnpm test:e2e` | Playwright browser tests on an isolated stack (fresh `<db>_e2e` database; run `pnpm build` first and stop `pnpm dev`) |
| `pnpm test:load` | Booking race and read-load test (`tests/load/booking-race.mjs`; needs a running stack with `APP_ENV=test`, e.g. `node e2e/stack.mjs`) |
| `pnpm db:migrate` · `pnpm db:migrate:create` | Apply committed migrations · create a new one |
| `pnpm db:seed` | Load demo data (refused outside local/demo/test, or if demo data exists) |
| `pnpm db:reset --confirm` | Drop and re-migrate a **local/test** database (refuses remote hosts) |
| `pnpm admin:create -- --email … --name …` | Create or promote an administrator (`HS_ADMIN_PASSWORD` from the environment) |
| `pnpm infra:up` / `pnpm infra:down` / `pnpm infra:local` | Docker infrastructure / stop it / embedded PostgreSQL without Docker |

## Integrations: what is real here

| Capability | Status in this repository | Notes |
|---|---|---|
| PostgreSQL | **Working** | All state, locks, constraints and the outbox; exercised by integration, browser and load tests |
| Background jobs (BullMQ) | **Working** on the PostgreSQL backend | Redis backend implemented and used by the Docker/production configuration; not run on the build machine |
| Email | **Simulated in development** (captured locally, never sent) | SMTP transport implemented; Mailpit in Docker. Real delivery **awaits SMTP credentials** |
| SMS (Termii) | **Awaiting credentials** | Adapter implemented; without it SMS is recorded as unavailable and phone recovery/claim are disabled (dev capture can stand in locally) |
| Payments (Paystack, service-fee invoices only) | **Awaiting credentials** | Initialise/verify/webhook adapter implemented; development uses a clearly labelled **simulator** that exercises the same webhook verification and reconciliation code. Produce and freight payments are always reported by the payer and confirmed by the recipient |
| Object storage (S3/MinIO) | **Awaiting a bucket** | S3 driver implemented; development uses the local filesystem driver (refused in production) |
| Malware scanning (ClamAV) | **Awaiting deployment** | Files are labelled *Not scanned* until configured |
| Maps / road routing | **Not implemented** | Straight-line distance with a labelled road-distance factor; exact pickup points open in OpenStreetMap |
| AI voice-to-draft | **Not implemented** | Flag stays off; the manual form is the complete path |

The live view of this table for any running environment is *Admin → Integrations* (`GET /api/v1/integrations/status`).

## Repository layout

```
apps/api        NestJS REST API (/api/v1), CLI (seed, create-admin, export-openapi)
apps/worker     BullMQ worker: outbox delivery, hold expiry, readiness re-checks, reminders, reconciliation
apps/web        Next.js 16 web app and PWA
packages/contracts  Zod schemas, enums, error codes, money/quantity/time helpers (shared web+API)
packages/core       Domain logic: state machines, readiness, matching, holds, invoicing, payments
packages/db         Prisma schema, committed SQL migrations, client
packages/config     Environment validation with production safety rules
e2e             Playwright tests and the isolated test-stack launcher
tests/load      Booking race / load test
infra           Docker Compose (local), production Compose + Caddy + backup scripts, embedded PostgreSQL launcher
docs            Architecture, domain, decisions, API, security, deployment, demo script, test results, status
```

## Documentation

* [Architecture](docs/ARCHITECTURE.md) · [Domain and state machines](docs/DOMAIN_AND_STATE_MACHINES.md) · [Decisions](docs/DECISIONS.md)
* [API](docs/API.md) (+ [openapi.json](docs/openapi.json)) · [Security and privacy](docs/SECURITY_AND_PRIVACY.md)
* [Deployment](docs/DEPLOYMENT.md) · [Demo script](docs/DEMO_SCRIPT.md) · [Test results](docs/TEST_RESULTS.md)
* [Implementation status](docs/IMPLEMENTATION_STATUS.md) · [Progress log](docs/PROGRESS.md)

## Known limitations

* Docker images, Compose files and CI are written but have not been run on the build machine (no Docker); see TEST_RESULTS.md.
* No embedded map; Yoruba translation covers navigation only and awaits review by a fluent speaker.
* Privacy notice and terms of use are templates for the operator and a lawyer to complete.
* Paystack, SMS, SMTP, S3 and ClamAV have not been exercised against real services.
