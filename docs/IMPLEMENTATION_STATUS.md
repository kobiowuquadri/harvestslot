# Implementation status — requirement checklist

Legend: `[x]` implemented **and** exercised by a check that was actually run (see TEST_RESULTS.md) · `[~]` implemented but only partly exercised, or partial · `[ ]` not done · `[-]` deliberately out of scope (with reason)

Integration words: **working** (real adapter exercised end to end here), **simulated** (development-only stand-in, visibly labelled, refused in production), **awaiting credentials** (real adapter implemented, not exercised because no credentials/service were available).

## Phase 1 — Foundation
- [x] Repository audit, architecture plan, decisions log (§2) — ARCHITECTURE.md, DECISIONS.md
- [x] pnpm workspaces, pinned versions, committed lockfile (§4)
- [x] Environment validation incl. production safety rules (§7, §25) — unit-tested (13 tests)
- [x] Prisma schema covering all §8 entities, committed migrations, SQL constraints/triggers (§8, §11) — exclusion constraints, check constraints, append-only triggers; applied by every test run
- [~] Local infrastructure (§25): embedded PostgreSQL option **working**; Docker Compose (Postgres, Redis, MinIO, Mailpit, ClamAV, web, API, worker) **written, not run** (no Docker here)
- [x] Auth: register (email/password; phone when SMS configured; STAFF accounts for invitees), login, logout, sessions list/revoke, email verification, password reset, phone recovery, account settings (§7)
- [x] CSRF, rate limiting, lockout, admin MFA (TOTP + recovery codes), request IDs, redacted logs, helmet, CORS (§7)
- [x] Organisations, memberships, roles, staff invitations, permission policies (§6)
- [x] Design tokens (contrast-checked), UI primitives, layouts (bottom bar on phones, side nav on larger screens), public pages (§5, §22)

## Phase 2 — Core booking slice
- [x] Farmer profile, farm locations (approximate vs exact, GPS with accuracy), harvest request wizard, draft/publish/edit/close/withdraw (§13)
- [x] Facilities, processing lines, slots (non-overlap), series creation, capacity adjustments with reasons, capacity list by day (§14)
- [x] Deterministic explainable matching + infeasibility explanations (§12)
- [x] Offers: create/revise/counter/accept/decline/withdraw/expire/lapse with DB-backed holds (§5)
- [x] Bookings: DRAFT/AWAITING/CONFIRMED/ACTIVE/COMPLETED/CANCELLED/EXPIRED, immutable hashed terms versions, confirmations with carry-forward (§9, §10)
- [x] Transport: vehicles, drivers, availability, service areas, quotes, acceptance, assignment, conflict checks with buffer (§15)
- [x] Readiness computation + readiness events, live updates (SSE) (§10)
- [x] Idempotency keys + optimistic versions (§11)

## Phase 3 — Operational fulfilment
- [x] Harvest commencement, ready-for-pickup (§13)
- [x] Driver milestones with GPS + accuracy, pickup/delivery confirmation in-app or by one-time code, handover exceptions (§15)
- [x] Receiving: gross/tare/net, weight evidence, quality decision, farmer review, escalation (never auto-accepted) (§16)
- [~] Over-delivery: decisions above tolerance are refused (`OVER_TOLERANCE`) and an amendment can be proposed from the booking; not covered by a browser test (§16)
- [~] Processing start/complete, yield vs loss: implemented in API and receiving screen; not covered by an automated test (§16)
- [x] Cancellation (pre-harvest), incidents, transport cancellation + replacement (§10, §15)
- [x] Invoices (produce, freight, platform fee), lines, adjustments, printable documents (§17)
- [x] Payment reporting, evidence, receipt confirmation, partial payments, refunds, overpayment guard (§17)
- [~] Paystack initialise/webhook/verify/reconcile — **awaiting credentials**; the local **simulator** (labelled) exercises the same verification and reconciliation path (§17)
- [x] Disputes, messages, settlement proposals, admin resolution with adjustments (§17)

## Phase 4 — Supporting platform
- [x] Cooperatives: members, represented farmers, witnessed consent, delegations with scopes, acting-for banner, claim invitations (§6, §13)
- [~] Notification inbox, transactional outbox, retries/dead-letter **working**; email **simulated** locally (SMTP awaiting credentials); SMS adapter **awaiting credentials** (§18)
- [~] Private uploads: content sniffing, re-encoding, signed per-user links **working** (filesystem driver); S3 **awaiting a bucket**; ClamAV **awaiting deployment** (§19)
- [x] Booking message threads (§18)
- [x] Admin: verification, users/orgs, suspension, incidents, disputes, policies, locations, integration status, outbox/webhooks, audit log, CSV exports, privacy requests (§6, §22)
- [x] Analytics with metric definitions; demo vs live separation; empty-data reasons (§21)
- [x] PWA: manifest, icons, service worker (never caches the API), offline drafts, reconnection and conflict handling (§19)
- [x] Privacy notice and terms templates (marked for legal review), consent records, data export/deletion requests (§19)
- [-] Embedded maps (MapLibre): not built — exact points open in OpenStreetMap; distances honestly labelled straight-line (§19, §12)
- [-] Road-routing adapter (OSRM): not implemented; distances are straight-line with a labelled road-distance factor, and the integration status says so (§12)
- [-] Optional AI voice-to-draft: not implemented (data model and disabled flag only); the manual form is complete (§20)
- [~] i18n structure; Yoruba covers navigation and common labels only, marked “needs fluent review” (§5)

## Phase 5 — Quality and delivery
- [x] Deterministic demo seed via the real services (15 farmers, 4 processors, 2 coops, 6 vehicles, 24 requests, 15 bookings in all states…) (§23)
- [x] Demo persona switching, refused outside local/test/demo (§23)
- [x] Unit tests (§24) — 137
- [x] Integration tests with real PostgreSQL (§24) — 21
- [x] Playwright E2E (§24) — 21, covering every listed browser scenario
- [x] Responsive/accessibility review (§24) — overflow checks at 3 widths; axe-core WCAG 2.1 AA with zero violations on key screens; dialog focus
- [x] Smoke/load test (§24) — capacity and supply races + read load, results in TEST_RESULTS.md
- [~] CI workflow (§24) — written (`.github/workflows/ci.yml`), not yet executed
- [~] Production Dockerfile (non-root, health checks, tini), Caddy, backups and restore drill (§25) — written, not run here
- [x] Documentation set (§27)
