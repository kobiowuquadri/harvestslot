# Implementation status — requirement checklist

Legend: `[ ]` not started · `[~]` in progress / partial · `[x]` implemented **and** exercised by a check that was actually run (see TEST_RESULTS.md) · `[-]` deliberately out of scope (with reason)

Integration status words: **working** (real adapter exercised end to end here), **simulated** (development-only stand-in, visibly labelled, refused in production), **awaiting credentials** (real adapter implemented, not exercised because no credentials/service were available).

## Phase 1 — Foundation
- [ ] Repository audit, architecture plan, decisions log (§2)
- [ ] pnpm workspaces, pinned versions, lockfile (§4)
- [ ] Environment validation incl. production safety rules (§7, §25)
- [ ] Prisma schema covering all §8 entities, committed migrations, SQL constraints/triggers (§8, §11)
- [ ] Local infrastructure: Docker Compose (Postgres, Redis, MinIO, Mailpit, web, API, worker) + no-Docker embedded Postgres option (§25)
- [ ] Auth: register (email/password, phone when SMS configured), login, logout, sessions list/revoke, email verification, password reset, account settings, recovery (§7)
- [ ] CSRF, rate limiting, OTP limits, admin MFA (TOTP + recovery codes), request IDs, redacted logs, helmet, CORS (§7)
- [ ] Organisations, memberships, roles, permission policies (§6)
- [ ] Design tokens, base UI primitives, layouts (mobile bottom nav / desktop side nav), public pages (§5, §22)

## Phase 2 — Core booking slice
- [ ] Farmer profile, farm locations (approximate vs exact), harvest request wizard, draft/publish/edit/close/withdraw (§13)
- [ ] Facilities, processing lines, slots (non-overlap), capacity adjustments, capacity calendar/list (§14)
- [ ] Deterministic explainable matching + infeasibility explanations (§12)
- [ ] Offers: create/revise/counter/accept/decline/withdraw/expire/lapse with DB-backed holds (§5 domain doc)
- [ ] Bookings: DRAFT/AWAITING/CONFIRMED, immutable terms versions, confirmations with carry-forward (§9, §10)
- [ ] Transport: vehicles, drivers, availability, service areas, quotes, acceptance, assignment, conflict checks with buffer (§15)
- [ ] Readiness computation + readiness events (§10)
- [ ] Idempotency keys + optimistic versions (§11)

## Phase 3 — Operational fulfilment
- [ ] Harvest commencement, ready-for-pickup (§13)
- [ ] Driver milestones, pickup/delivery handover codes, exceptions (§15)
- [ ] Receiving: gross/tare/net, weight evidence, quality decision, farmer review, escalation (§16)
- [ ] Over-delivery amendment (§16)
- [ ] Processing start/complete, yield vs loss (§16)
- [ ] Cancellation (pre-harvest), incidents (post-harvest), transport cancellation + replacement (§10, §15)
- [ ] Invoices (produce, freight, platform fee), lines, adjustments (§17)
- [ ] Payment reporting, evidence, receipt confirmation, partial payments, refunds, overpayment guard (§17)
- [ ] Paystack initialise/webhook/verify/reconcile + local simulator (§17)
- [ ] Disputes, messages, resolution, adjustments (§17)

## Phase 4 — Supporting platform
- [ ] Cooperatives: members, represented farmers, consent/delegations, acting-for, account claim (§6, §13)
- [ ] Notification inbox, transactional outbox, email delivery, SMS adapter, retries/dead-letter (§18)
- [ ] Private uploads: validation, signed links, scanning status, image compression (§19)
- [ ] Booking message threads (§18)
- [ ] Admin: verification, users/orgs, suspension, incidents, disputes, policies, integration health, outbox, audit log, exports (§6, §22)
- [ ] Analytics with metric definitions; demo vs live separation (§21)
- [ ] PWA: manifest, icons, service worker, offline drafts, conflict handling (§19)
- [ ] Privacy notice, terms template, consent records, data export/deletion requests (§19)
- [ ] Maps (MapLibre) + routing adapter with honest fallbacks (§19, §12)
- [ ] Optional AI voice-to-draft (§20)
- [ ] i18n structure; Yoruba strings with review status (§5)

## Phase 5 — Quality and delivery
- [ ] Deterministic demo seed (15 farmers, 4 processors, 2 coops, 6 vehicles, 20 requests, ≥12 bookings…) (§23)
- [ ] Demo role switching (dev only) (§23)
- [ ] Unit tests (§24)
- [ ] Integration tests with real PostgreSQL (§24)
- [ ] Playwright E2E (§24)
- [ ] Responsive/accessibility review (§24)
- [ ] Smoke/load test (§24)
- [ ] CI workflow (§24)
- [ ] Production Dockerfiles, Caddy, health checks, non-root, graceful shutdown (§25)
- [ ] Documentation set (§27)
