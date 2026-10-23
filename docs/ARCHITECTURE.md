# HarvestSlot — Architecture

HarvestSlot answers one question for a cassava farmer in Oyo State: **"Is there a confirmed plan for this harvest?"** It coordinates a buyer (processor), processing capacity, and transport before the crop is harvested.

## 1. Shape of the system

A **modular monolith** split into three processes that share domain code:

| Process | Package | Responsibility |
|---|---|---|
| Web | `apps/web` | Next.js App Router UI (PWA for farmers/transporters, desktop dashboards for processors/cooperatives/admins). Never touches the database. |
| API | `apps/api` | NestJS REST API under `/api/v1`. The only authority for business rules, permissions and persistence. OpenAPI at `/api/docs`. |
| Worker | `apps/worker` | Background work: outbox delivery (email/SMS), hold-expiry sweeps, readiness re-checks, payment reconciliation, receiving-review escalation, invoice reminders. |

Shared packages:

| Package | Contents |
|---|---|
| `packages/config` | Environment schema (Zod), startup validation and production safety rules, shared by API and worker. |
| `packages/contracts` | API request/response schemas (Zod), enums, stable error codes, money/quantity/time helpers. Used by web (forms, typed client) and API (validation, OpenAPI). |
| `packages/db` | Prisma schema, committed SQL migrations (including constraints Prisma cannot express), generated client, deterministic demo seed. |
| `packages/core` | Framework-free domain logic: money arithmetic, state machines, readiness, matching/ranking, permission policies, and transactional operations shared by API and worker (hold expiry, outbox, notification delivery, payment reconciliation). |

`packages/ui` from the suggested structure is intentionally not created: shadcn/ui primitives are source-copied components and only one web app consumes them, so they live in `apps/web/src/components/ui` (see DECISIONS.md).

```
browser ──HTTPS──▶ reverse proxy (Caddy) ──/api/*──▶ API (NestJS) ──▶ PostgreSQL (authoritative)
                                        └──/*─────▶ Web (Next.js)          │
                                                                          ├──▶ S3 / MinIO (private objects)
Worker ◀── BullMQ schedules (Redis, optional) ── polls outbox (PostgreSQL) ┘──▶ SMTP / SMS / Paystack
```

## 2. Authority and data ownership

* **PostgreSQL is authoritative** for capacity, supply allocation, confirmations, payments and audit. Redis is only used for BullMQ scheduling and rate-limit counters; losing Redis never loses or corrupts a reservation.
* The web app calls the API through the same origin (`/api/v1/*`). In development Next.js rewrites `/api/*` to the API; in production the reverse proxy does. There is no second database path.
* Authenticated API responses carry `Cache-Control: no-store, private` and `Vary: Cookie`. The service worker never caches `/api/*`.

## 3. Module map (API)

`auth, users, organisations, memberships, farmers, delegations, facilities, slots, harvests, matching, offers, reservations, bookings, transport, receiving, processing, invoicing, payments, disputes, notifications, uploads, messages, analytics, admin, audit, health, privacy, ai`

Each module owns its controllers and services. Cross-module calls go through exported services, never through another module's tables directly, except within a single database transaction orchestrated by the owning module (e.g. booking confirmation locks slot, booking and vehicle rows together).

## 4. Request pipeline

1. `helmet` security headers, restricted CORS, cookie parsing, request ID (`x-request-id`), structured pino logs with secret redaction.
2. **Session guard** — opaque session token in an HttpOnly cookie; the server stores only a SHA-256 hash. Sessions have idle and absolute expiry and can be revoked individually.
3. **CSRF guard** — every non-GET request must send `x-csrf-token` equal to the `hs_csrf` cookie, which is an HMAC bound to the session (signed double-submit), and the `Origin` must be allowed. The Paystack webhook is exempt and verified by signature instead.
4. **Rate limits** — per IP and per account/action (login, OTP, reset, uploads, payment initialisation).
5. **Zod validation pipe** — request bodies/queries validated with schemas from `packages/contracts`; the same schemas generate OpenAPI components.
6. **Authorisation** — `AccessService` resolves the actor's authority from the database (memberships, delegations, booking participation). The browser never supplies a role.
7. **Idempotency interceptor** — consequential operations require `Idempotency-Key`; keys are scoped to actor+operation and bound to a request hash.
8. **Error filter** — stable error codes (`{ error: { code, message, details, requestId } }`), 401/403/404/409/422/429 semantics.

## 5. Concurrency strategy

* Every reservation-affecting operation runs in a PostgreSQL transaction (`READ COMMITTED`) that takes row locks with `SELECT … FOR UPDATE` in a **fixed global order**: harvest request → processing slot → booking → vehicle → driver. Sums of active holds are recomputed under the lock, honouring `expiresAt` directly, so correctness never depends on the expiry worker.
* Database constraints back the application checks: a GiST exclusion constraint prevents overlapping slots per line; check constraints enforce non-negative quantities, `gross >= tare`, `net = gross - tare`, `accepted + rejected = net`; exclusion constraints prevent overlapping confirmed trips per vehicle/driver; immutability triggers protect terms versions, confirmations and audit events.
* Deadlocks/serialisation failures are retried a bounded number of times.
* Optimistic concurrency (`version` column) protects edits; stale writes return `409 VERSION_CONFLICT`.
* External calls (Paystack, SMTP, SMS, routing, AI) are never made while a transaction holds locks.

## 6. Background work

* **Transactional outbox**: business transactions write `outbox_events`. The worker claims rows with `FOR UPDATE SKIP LOCKED`, delivers, records `delivery_attempts`, retries with exponential backoff, dead-letters after a limit, and deduplicates by `dedupe_key`.
* **Schedules**: with `REDIS_URL` set, BullMQ repeatable jobs trigger the sweeps (one runner per schedule across workers). Without Redis the worker runs the same functions on in-process timers and reports that mode in integration health.

## 7. Integrations and honesty rules

| Integration | Implementation | Without configuration |
|---|---|---|
| Email | SMTP via nodemailer (Mailpit in development) | `dev-capture` transport stores the message locally and marks it *captured, not delivered* (development only) |
| SMS | Termii adapter | Delivery attempts recorded as `UNAVAILABLE`; phone OTP paths are disabled |
| Payments (fee invoices) | Paystack initialise → hosted checkout → signed webhook → server-side verify → idempotent reconciliation | Local simulator (visibly labelled, refused in production) exercising the same reconciliation code |
| Object storage | S3 API (MinIO locally) | `filesystem` driver for development only |
| Malware scanning | ClamAV `clamd` INSTREAM | Files marked `NOT_SCANNED`; sensitive files are only served as downloads |
| Maps | MapLibre GL with configurable style URL | List view; distances labelled *straight-line* |
| Routing | OSRM-compatible adapter | Straight-line distance with an explicitly labelled conservative road-distance factor |
| AI voice-to-draft | Feature-flagged, off by default | Hidden; manual form is the complete path |

`GET /api/v1/integrations/status` reports each capability as `configured`, `simulated` or `unconfigured` without revealing secrets.

## 8. Front end

* Next.js App Router, React 19, Tailwind CSS v4 tokens (forest green `#143E31`, secondary `#2F6B4E`, background `#F7F8F4`, amber `#E8B56B` used with dark text), shadcn/ui-style accessible primitives on Radix.
* TanStack Query for authenticated server state; React Hook Form + Zod (shared schemas) for forms.
* Farmers/transporters get mobile bottom navigation; processor/cooperative/admin get desktop side navigation.
* PWA: manifest, icons, app-shell service worker; offline harvest-request drafts in IndexedDB scoped to the account, with expiry, cleared on logout, synced with idempotency keys and version checks.
* English is complete; Yoruba strings carry an explicit review status and fall back to English.

## 9. Deployment

Single public origin behind Caddy (TLS) on an Ubuntu VPS; API, web and worker as separate containers; PostgreSQL and Redis with persistent volumes; S3-compatible object storage. See `DEPLOYMENT.md`.
