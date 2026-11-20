# Security and privacy

HarvestSlot records commercial agreements, farm locations, phone numbers, weights and payments for people who may be new to digital services. The design goal is that **the server is the only authority**, every consequential action is attributable, and personal data is shown only to people with a reason to see it.

## Accounts and sessions

* **Passwords**: Argon2id (`@node-rs/argon2`, 19 MiB, t=2), minimum 8 characters, common/repetitive passwords refused. Unknown accounts take the same time to reject (a dummy hash is verified).
* **Lockout**: after 5 failed attempts, sign-in is locked with exponential back-off (15 min doubling, max 24 h), plus per-IP and per-identifier rate limits.
* **Sessions**: 256-bit opaque tokens; only a SHA-256 hash is stored. HttpOnly, `SameSite=Lax`, `Secure` in production cookies. Idle timeout 12 h and absolute timeout 14 days by default; users can list and revoke sessions; password change/reset revokes other sessions.
* **Two-factor authentication**: TOTP (RFC 6238, verified against the RFC test vectors) with single-use recovery codes; secrets encrypted at rest with AES-256-GCM (`DATA_ENCRYPTION_KEY`). **Required for administrators in production** (`ADMIN_REQUIRE_MFA=true` is enforced by startup validation).
* **Recovery**: email reset links and SMS codes are single-use, short-lived and stored hashed; responses never reveal whether an account exists.
* **Demo logins** and **dev tools** (captured mailbox, payment simulator) are refused by the server unless `APP_ENV` is local/test/demo; production startup fails if they are enabled. Demo persona switching is therefore never an authentication bypass in production.

## Requests

* **CSRF**: signed double-submit token bound to the session, plus `Origin` allow-list, on every state-changing request. The Paystack webhook is the only exemption and is authenticated by HMAC-SHA512 over the raw body.
* **Authorisation**: resolved on every request from the database (memberships and roles, cooperative delegations and their scopes, booking participation). The browser never supplies a role. Organisation-scoped routes carry the organisation id and membership is re-checked. Records the caller cannot see return `404`, so existence is not disclosed (tested end to end).
* **Validation**: every body and query is validated with shared Zod schemas; quantities and money use exact decimal/integer arithmetic (kobo, grams).
* **Idempotency and versions**: duplicate submissions cannot double-allocate, double-pay or double-cancel; stale edits are refused.
* **Headers**: helmet (CSP `default-src 'none'` on the API, HSTS when cookies are secure), web CSP without third-party scripts, `X-Frame-Options: DENY`, `nosniff`, strict referrer policy. Authenticated API responses are `no-store`.
* **Logs**: structured pino logs with request ids; cookies, authorisation headers, passwords, tokens, codes and secrets are redacted, and tokens in URLs are masked.

## Delegation (cooperatives acting for farmers)

* A representative can act for a farmer only through an **active delegation** with explicit scopes (data entry, approve sales, confirm handover, view finances, confirm payment receipt). Delegations recorded on the farmer's behalf need a witness or a signed form; farmers with accounts manage their own and can revoke them instantly.
* Every action records both the representative and the farmer (`actingForFarmerId` and the delegation id in audit events, confirmations, messages and payments), and every screen shows an “Acting for …” banner.
* A representative without *approve sales* can only prepare an acceptance (booking `DRAFT`); the API refuses approval (`DELEGATION_SCOPE_MISSING`).

## Files

* Uploads are limited in size (10 MB default) and type by **content sniffing**, not by name: JPEG/PNG/WebP images are re-encoded to JPEG with metadata (including GPS EXIF) stripped; PDFs are accepted as-is.
* Files are stored privately (S3-compatible bucket with no public policy; local filesystem in development) and served only through **5-minute signed links bound to the requesting user**, with `Content-Security-Policy: sandbox`, `nosniff` and `no-store`.
* Optional ClamAV scanning; without it files are labelled *Not scanned*.
* Photos and tickets are **evidence of what someone recorded**; the UI never presents them as certification of weight or quality.

## Location privacy

* Farm locations store an exact point (with its source and accuracy) and a rounded approximate point. Processors browsing requests see only the LGA/community and approximate area. The exact point and directions are visible only to the farmer, their delegates, and — once a booking is confirmed — the assigned transporter, driver and the processor.
* Farmer phone numbers are shown to booking parties only while a booking is confirmed or active.

## Money

* HarvestSlot never holds produce or freight money. Payments between users are **reported by the payer and confirmed by the recipient**; only then do they count. Online payment (Paystack) is used only for HarvestSlot service-fee invoices and counts only after server-side verification; webhook events are signature-checked, stored, de-duplicated and reconciled idempotently; amount mismatches are flagged for admin review.
* Verification levels are always shown: *Reported by payer*, *Confirmed by recipient*, *Verified by payment provider*, *Simulated (development)*. A screenshot can never make a payment provider-verified.

## Audit and integrity

* Append-only `audit_events`, booking terms versions, confirmations and dispute history are protected by database triggers against update/delete. Terms carry a SHA-256 content hash; a confirmation must quote the hash of the exact version reviewed.
* Admin changes (verification, suspension, policies, locations, data requests, exports, re-queues) require a reason and are audited.
* CSV exports neutralise spreadsheet formulas.

## Privacy rights and data handling

* Consent records (terms, privacy notice, email/SMS contact, location) with document versions and method.
* **Export**: users request a copy of their data; the worker produces a JSON export stored privately and offered through a signed link.
* **Deletion**: reviewed by an administrator. Personal data not needed for retained transaction history is removed or anonymised; agreements, invoices, disputes and audit records required for legal/accounting reasons are kept in pseudonymised form. The privacy notice explains this.
* Demo data uses reserved example domains and fictional numbers; external delivery is suppressed for demo accounts.
* The privacy notice and terms of use in the app are **templates** with highlighted items for the operator to complete and have reviewed by a lawyer before production use (including NDPA/NDPC registration and data-processing agreements with providers).

## Secrets and configuration

* Secrets live only in environment variables (`.env` locally, `infra/production/.env.production` on the server); both are git-ignored and excluded from Docker build contexts. `.env.example` and `env.production.example` contain placeholders only.
* Production startup refuses development defaults, insecure cookies, http base URLs, localhost origins, filesystem storage, mail capture, the payment simulator, demo mode and dev tools, and test-mode Paystack keys when `PAYSTACK_MODE=live` (unit-tested).
* The web bundle contains no secrets: the browser talks only to its own origin and never sees API keys.

## Known limitations

* No independent penetration test or code audit has been performed.
* Malware scanning depends on deploying ClamAV.
* SMS-based recovery and phone verification need an SMS provider; without one they are disabled and the UI says so.
* Rate limits use in-memory counters unless Redis is configured; with several API instances, configure Redis so limits are shared.
