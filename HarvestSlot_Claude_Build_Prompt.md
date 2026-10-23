# HarvestSlot — Complete Platform Build Prompt for Claude Code

You are the lead product engineer, backend architect, frontend designer, and QA engineer building HarvestSlot. Work directly in the repository and deliver the implementation, not merely a plan or sample screens.

Read this entire specification before coding. Treat it as the product specification and acceptance contract. Build a complete, connected, deployable first release with persistent data, tested business rules, polished interfaces, and honest integration status.

## 1. Product purpose and positioning

HarvestSlot helps cassava farmers in Oyo State, Nigeria arrange a buyer, processing capacity, and transport before harvesting.

The central question the product answers is: "Is there a confirmed plan for this harvest?"

A farmer should know:
- Who is buying the cassava.
- What quantity has been reserved.
- Which facility will receive and process it.
- The agreed price and quality requirements.
- When harvesting, collection, delivery, and processing should happen.
- Who is transporting it and who pays for transport.
- What is still awaiting confirmation.
- What happens if a participant cancels or the delivered quantity differs.
- What payment is due and whether the recipient has confirmed receipt.

Primary SDG alignment: SDG 12, Responsible Consumption and Production.
Supporting alignment: SDG 2, Zero Hunger; SDG 8, Decent Work and Economic Growth.

Treat reduction in losses and improvement in income as hypotheses to measure. Do not invent impact statistics, successful pilots, partnerships, farmers served, or testimonials.

Working tagline: "Harvest with a confirmed plan."

## 2. Execution requirements

Inspect the repository, existing instructions, package manager, application structure, environment, and current changes first. Preserve unrelated work. Extend a suitable existing foundation; scaffold a new application only if needed.

Before substantial coding:
1. Write a concise architecture and implementation plan.
2. Establish the domain entities, authority rules, status transitions, and commercial calculations.
3. Choose compatible, maintained dependency versions using current official documentation.
4. Save a requirement-to-implementation checklist in docs/IMPLEMENTATION_STATUS.md.

Then implement the phases below without stopping after the plan or after each phase to request routine approval. Make reasonable reversible decisions and record them in docs/DECISIONS.md.

Do not substitute a frontend mockup for the required backend. Do not create buttons that pretend to save, pay, confirm, export, or send. A visible action must perform the specified operation or clearly explain an actual unmet prerequisite.

Keep progress notes, commands, failing checks, and the next concrete task in docs/PROGRESS.md. If the session approaches its context limit, update this file and leave a resumable checkpoint.

Never claim that a check passed unless you ran it. Never label a simulated provider response as a real external result.

## 3. Release scope and deliberate boundaries

Build one responsive web platform with an installable PWA experience for farmers and transporters, plus suitable desktop dashboards for processors, cooperatives, and administrators.

This release supports:
- Cassava as the initial crop.
- Farmers acting directly or through authorised cooperative representatives.
- Processors purchasing fresh cassava for their facilities.
- Processor capacity publication, harvest requests, matching, offers, reservations, and confirmations.
- Transport quotes, assignment, collection, delivery, and exception handling.
- Receiving, weighing, quality acceptance, processing records, invoices, payment tracking, and disputes.
- Notifications, private documents, operational analytics, administration, and a complete demonstration dataset.

Use one farmer, one processor facility, one processing slot, and one vehicle per booking. A harvest request can be fulfilled through several separate bookings with quantities safely allocated across them.

Cross-farmer pooled loads, multi-stop vehicle optimisation, native mobile binaries, lending, crop insurance, bidding auctions, commodity investment, and farmer-owned toll-processing are later extensions. They must not appear as unfinished actions in the release.

The processor is the buyer. Do not accidentally charge the farmer a processing fee for selling their crop. Toll-processing, where the farmer retains ownership and pays for processing, is a different commercial model and is outside this release.

## 4. Technical architecture

Preferred stack:
- TypeScript throughout.
- Next.js App Router and React for the web application.
- Tailwind CSS and accessible shadcn/ui primitives.
- React Hook Form and Zod for frontend forms.
- TanStack Query for authenticated client-side server state where appropriate.
- NestJS for the authoritative REST API.
- PostgreSQL with Prisma and explicit SQL migrations where database constraints require them.
- Redis and BullMQ for background work.
- S3-compatible object storage, with MinIO locally.
- OpenAPI/Swagger and a generated or strictly typed API client.
- Playwright for browser workflows.
- An appropriate unit/integration test runner for the chosen NestJS setup.
- Docker Compose for the full local environment.
- pnpm workspaces; add Turborepo only if it materially helps.

Choose currently supported, mutually compatible versions. Pin them and commit the lockfile. Inspect the actual installed Prisma, Next.js, React, and Node APIs rather than copying examples from a different major version.

Suggested structure:
    apps/web
    apps/api
    apps/worker
    packages/contracts
    packages/ui
    packages/config
    infra
    docs

Use a modular monolith. Separate NestJS modules by business responsibility, not into distributed microservices. The API owns business rules and persistence; Next.js must not introduce a second independent database access path.

Run web, API, and worker as separate processes that share the relevant domain modules. PostgreSQL is authoritative for capacity, quantities, confirmations, payments, and audit events. Redis is not the authority for reservations.

Use one public origin in the documented production setup, routing API requests through the reverse proxy. Define a clean development equivalent. Keep authenticated responses private and prevent cross-user caching.

Recommended backend modules:
auth, users, organisations, memberships, farmers, delegations, facilities, slots, harvests, matching, offers, reservations, bookings, transport, receiving, processing, invoicing, payments, disputes, notifications, uploads, analytics, admin, audit, and health.

## 5. Product design and usability

Create a polished, calm product suited to real business transactions and mobile field use.

Visual direction:
- Forest green primary: #143E31.
- Secondary green: #2F6B4E.
- Warm neutral background: #F7F8F4.
- Amber accent: #E8B56B, used with accessible text contrast.
- White surfaces, clear borders, restrained shadows, consistent spacing.
- Inter or Manrope with a reliable system-font fallback.
- Consistent icons, readable labels, and compact but comfortable layouts.

Validate colour contrast rather than assuming these tokens pass everywhere.

Use:
- Mobile bottom navigation for frequent farmer/transporter actions.
- Desktop side navigation for processor, cooperative, and admin work.
- Large touch targets, visible keyboard focus, accessible dialogs and tables.
- Clear progress indicators and status labels that do not depend on colour.
- Useful loading, empty, validation, conflict, offline, and error states.
- Nigerian naira formatting, kilograms as the canonical unit, and optional tonnes for display.
- Africa/Lagos for user-facing schedules and UTC for timestamp storage.
- Plain English and an internationalisation structure for English and Yoruba.

Implement the core English experience fully. Add Yoruba strings only with an explicit review status; document translations requiring a fluent speaker's review. Do not claim full localisation if it is incomplete.

Use progressive disclosure. A farmer's home screen should emphasise their next action and booking readiness, not a wall of analytics.

Never fabricate trust badges. Distinguish self-reported information, administrator-reviewed documents, and checks performed by an actual external provider.

## 6. Accounts, roles, and authority

Support multiple organisation memberships where needed. Do not trust a role or organisation ID supplied by the browser.

Farmer:
- Manage their profile and farm pickup locations.
- Create and edit eligible harvest requests.
- Compare matches and review offers.
- Approve exact commercial and transport terms.
- See readiness and start their harvest workflow.
- Confirm pickup, review receiving records, confirm payment receipt, and open disputes.
- Manage cooperative authorisations.

Processor organisation:
- Owner and manager roles.
- Manage facilities, purchase requirements, capacity, offers, and bookings.
- Assign staff.
- Receiving staff can record weights and inspection evidence.
- Finance staff can record outgoing payments and review invoices.
- Restrict commercial approval and payment permissions appropriately.

Transport organisation or independent transporter:
- Manage vehicles and drivers.
- Publish service areas and availability.
- Submit quotes and accept assignments.
- Record collection and delivery evidence.
- Access only the jobs and information required for their assignments.

Cooperative:
- Manage member relationships and recorded consent.
- Register represented farmers who do not yet have accounts.
- Create requests and monitor bookings only for authorised members.
- Separate permission to assist with data entry from permission to approve a sale.
- Attribute every action to both the representative and the represented farmer.
- Provide a verified account-claim process so a farmer can later control their profile.
- Revoking a delegation prevents future delegated actions without deleting valid historical agreements.

Platform administrator:
- Review organisations and documents.
- Manage verification status, supported locations, fees, and operational settings.
- Investigate disputes and abuse, suspend accounts, and inspect audit events.
- Never silently rewrite signed terms, payment facts, or completed history.
- Administrator interventions require a reason and an audit record.
- Public registration cannot grant administrator privileges.

## 7. Authentication and security foundations

Implement registration, login, logout, session management, verification, password reset, account settings, and safe account recovery.

Allow email/password accounts and a verified phone-based account path when an SMS provider is configured. A represented farmer need not have an email address.

Use maintained password-hashing and session libraries. Use secure, HttpOnly cookies for browser sessions, appropriate SameSite settings, CSRF protection for mutations, and server-side session revocation. Do not put session credentials into localStorage.

Provide:
- Generic recovery responses that do not reveal whether an account exists.
- Expiring, single-use reset/verification tokens stored safely.
- OTP attempt limits, expiry, resend throttling, and protection against brute force.
- Rate limiting by relevant account/IP/action dimensions.
- Administrative MFA support, with documented setup and recovery.
- Server-side object ownership and organisation membership checks on every protected operation.
- Safe error responses, request IDs, structured logs, and secret redaction.
- Validation of environment variables at startup.
- Restricted CORS and secure HTTP headers.
- Protection against stored XSS, unsafe file rendering, and spreadsheet formula injection in exports.

Development mail and OTP tools must be explicitly disabled in production. Production startup must reject demo-login bypasses, default secrets, and unsafe local-provider settings.

## 8. Domain model and database requirements

Design a normalised schema and migrations. Include equivalent entities for:
- User, Session, VerificationToken, Organisation, Membership.
- FarmerProfile, FarmLocation, CooperativeMembership, DelegationConsent.
- Facility, ProcessingLine, ProcessingSlot, CapacityAdjustment.
- HarvestRequest, HarvestLot.
- Offer, OfferVersion, Reservation, Booking, BookingTermsVersion, Confirmation.
- Vehicle, DriverAssignment, TransportQuote, TripReservation, Shipment.
- PickupRecord, ReceivingRecord, WeightEvidence, QualityAssessment, ProcessingRecord.
- Invoice, InvoiceLine, Adjustment, PaymentAttempt, PaymentEvidence, ReceiptConfirmation, RefundRecord.
- Dispute, DisputeMessage, Resolution.
- Attachment, Notification, DeliveryAttempt, OutboxEvent, AuditEvent.
- IdempotencyRecord and IntegrationWebhookEvent.

Use explicit foreign keys, unique constraints, indexes, and appropriate deletion policies. Protect contractual and financial history from cascade deletion.

All significant mutable records need timestamps and an optimistic concurrency version. Record the actor for state-changing actions. Store immutable snapshots of agreed terms and accepted revisions.

Use decimal-safe quantities with a documented precision, such as up to three decimal places in kilograms. Store NGN monetary amounts as integer kobo and use decimal-safe arithmetic for multiplication and percentage fees. Do not use floating-point arithmetic for money.

Expose integer minor units or decimal strings through API contracts consistently. Define rounding once and test it.

Use range checks for dates, quantities, weights, coordinates, and prices. Reject negative values, inconsistent intervals, and invalid unit conversions.

## 9. Commercial terms and calculations

A booking snapshot must include:
- Farmer and purchasing processor.
- Facility, line, slot, quantity, and harvest/pickup/delivery windows.
- Unit purchase price per kilogram.
- Quality acceptance criteria and any agreed quantity tolerance.
- Transport quote, assigned provider, vehicle, and freight payer.
- Platform fee and its payer, if enabled.
- Payment timing, invoice due rules, cancellation terms, and rejection/return responsibility.
- Version and time of each party's acceptance.

Default transport payer: processor. Allow farmer-paid transport only when explicitly shown and accepted.

Keep obligations separate:
1. Processor owes farmer for accepted cassava.
2. The specified freight payer owes the transporter.
3. Processor owes HarvestSlot any agreed platform service fee.

Do not net one party's money against another obligation without an implemented, explicitly agreed setoff model. This release should use separate invoices instead.

Final produce amount = accepted quantity multiplied by agreed unit price, rounded to kobo.

Estimated farmer net = produce amount minus farmer-paid transport and any separately approved farmer-borne charges. Display estimates separately from final amounts and payment receipts.

Support partial payments, outstanding balances, due dates, disputed adjustments, and reconciliation. The sum of received payments must not exceed the invoice without an explicit overpayment workflow.

Any change to price, quantity, slot, timing, freight, or material quality terms creates a new version and invalidates the relevant prior confirmations. Do not edit a confirmed agreement in place.

## 10. Booking lifecycle and readiness

Implement and document explicit state machines. Do not use one ambiguous status to represent booking, delivery, inspection, and payment.

Booking lifecycle:
DRAFT -> AWAITING_CONFIRMATIONS -> CONFIRMED -> ACTIVE -> COMPLETED.
CANCELLED and EXPIRED apply only through permitted transitions.

Keep separate states for:
- Harvest/fulfilment progress.
- Transport progress.
- Receiving and quality review.
- Processing.
- Invoice/payment status.
- Disputes and resolution.

Define a transition table specifying actor, preconditions, database writes, events, and allowed next actions for every transition.

READY TO HARVEST must be computed by the backend from current facts:
- Farmer or appropriately authorised representative accepted the current terms.
- Processor accepted the current terms.
- A valid quantity allocation and processing/purchase-capacity reservation exist.
- Transport quote and payer are accepted.
- Driver and vehicle assignment are confirmed and conflict-free.
- Pickup/delivery windows remain feasible and are not expired.
- Required participants remain eligible.
- No blocking amendment, suspension, cancellation, or unresolved issue prevents proceeding.

Return a structured readiness object with each check and its blocking explanation. Persist readiness-change events for audit, but never let a client toggle readiness directly.

A cancellation or expired condition must immediately invalidate readiness. Record actual harvest commencement separately from its planned date.

After harvesting or pickup, exceptions require an incident/recovery workflow. Do not cancel and silently return physical produce to unallocated inventory.

Operational completion and financial settlement are separate. A delivery can be operationally complete while an invoice remains unpaid.

## 11. Capacity, inventory, and concurrency

This is a critical engineering requirement.

A processing slot needs:
- Facility/line.
- Start and end timestamps.
- Physical processing capacity in kilograms.
- Purchase intake limit in kilograms.
- Status and publication details.

Do not confuse a factory's machine capacity with its willingness and ability to purchase a quantity.

For the first release, use non-overlapping windows per processing line. Prevent overlapping slots at the database or transaction layer. A facility can have multiple explicitly modelled lines.

Available capacity accounts for valid holds, confirmed reservations, and quantities already consumed within that slot. Completing a job must not make already-used capacity available again in the same window.

Also reserve supply:
- Total held and committed quantity across a harvest request cannot exceed its current eligible quantity.
- A partial allocation leaves a correctly calculated remaining balance.
- Cancelled quantities are re-released only when their physical/business state permits it.

Use PostgreSQL transactions, row-level locks or equivalent proven atomic conditional writes, database constraints, and bounded conflict retries. Lock shared resources in a deterministic order. Use the actual installed Prisma transaction API correctly; use parameterised SQL where necessary.

Temporary holds must have a configurable expiry. Confirmation atomically checks and promotes valid holds. Expiration and cancellation release only the resources they actually own, exactly once.

The expiry worker is an optimisation, not the sole source of correctness. Read and write paths must respect expiresAt even when the worker is delayed or Redis is unavailable.

Use idempotency keys for consequential create/confirm/payment operations. Scope keys to actor and operation, bind them to a request hash, and reject reuse with a different payload.

Do not call payment, map, SMS, or AI providers while holding database locks.

## 12. Matching and recommendations

Implement a deterministic, explainable matching service.

Hard eligibility checks should include:
- Approved/eligible processor and facility.
- Cassava purchase requirements and compatible quality criteria.
- Available purchase and processing capacity.
- Compatible farmer harvest window and processor slot.
- Relevant location/service coverage.
- Any minimum price or order quantity rules.

Rank eligible candidates using documented, configurable factors such as:
- Estimated farmer net value where transport cost is known.
- Schedule compatibility.
- Distance or an actual provider-derived travel estimate.
- Remaining capacity fit.
- Observed operational reliability when sufficient data exists.

Do not invent reliability scores for new organisations. Show "not enough history" where appropriate.

Each result should explain its suitability, estimated cost components, remaining confirmations, and freshness of availability data.

A recommendation does not reserve anything. A quote is an estimate until accepted. A displayed match is not a purchase guarantee.

If there is no feasible match, explain why and propose valid actions such as changing the requested quantity or selecting another farmer-approved date.

Distinguish straight-line distance from road distance. Do not present a geometric distance as a real driving route or invented arrival time. Use conservative, explicitly labelled estimates when a routing integration is unavailable.

## 13. Farmer and cooperative workflows

Implement:
- Onboarding, profile, contact preferences, location consent, and farm locations.
- A short harvest-request wizard with quantity, acceptable dates, pickup location, optional crop details/photos, and commercial preferences.
- Draft, publish, edit, close, and eligible withdrawal actions.
- Matching and comparison screens.
- Offer review with a plain-language commercial summary.
- Accepted quantity versus unallocated quantity.
- Booking details with readiness checklist, timeline, contacts, documents, and next action.
- Harvest commencement and ready-for-pickup reporting.
- Pickup review, receiving review, payment receipts, and disputes.

The cooperative dashboard additionally needs:
- Member list and invitation/account-claim flows.
- Consent status and permission scope.
- Member-specific requests and bookings.
- Clear "acting for" identity throughout delegated actions.
- Aggregated operational views without revealing one member's private financial information to other members.

A farmer must not accidentally accept a sale simply by viewing a recommendation.

## 14. Processor workflows

Implement:
- Organisation onboarding and document submission.
- Facility and processing-line management.
- Capacity calendar with daily/weekly list alternatives on mobile.
- Slot creation, exceptions, closures, and capacity adjustments.
- An eligible harvest-request inbox.
- Offer creation, expiry, counter-offer/revision, and withdrawal where permitted.
- Confirmed intake schedule and expected volumes.
- Transport coordination.
- Receiving/weighing workbench.
- Quality decision and evidence.
- Processing start/completion.
- Produce and freight obligations, platform fee invoices, and payment records.
- Staff management with permission limits.
- Reports on slot utilisation, pending intake, delayed deliveries, and unpaid invoices.

Do not allow a capacity reduction below active holds/commitments. Route it through explicit cancellation/amendment handling when necessary.

## 15. Transport and delivery workflows

Implement vehicles, capacity, driver assignment, availability windows, service areas, quotes, assignment acceptance, and job histories.

A quote must identify:
- Pickup and destination.
- Vehicle capacity.
- Pickup and expected delivery windows.
- Freight price and payer.
- Included services and cancellation terms.

Enforce vehicle capacity and prevent overlapping commitments for both vehicle and driver. Include a documented configurable travel/turnaround buffer when checking availability.

For this release, a vehicle serves one active booking at a time. Do not imply pooled routing.

Driver workflow:
- Review and accept a job.
- View the authorised pickup details.
- Mark arrival.
- Record collection evidence and quantity.
- Obtain farmer/authorised-agent pickup confirmation.
- Mark departure/in transit.
- Record arrival and delivery evidence.
- Let the receiving party confirm receipt.

A driver cannot unilaterally prove that the processor accepted the produce. A farmer cannot unilaterally assert that the transporter collected it.

Use expiring, job-bound handover codes or authenticated counterparty acknowledgement, with retry limits and a reasoned audited exception process. Avoid making GPS mandatory where it is unavailable; capture accuracy and mark self-reported locations honestly.

Provide manual milestone tracking as the complete default. Do not display fictional live vehicle tracking.

If a driver cancels, make the booking not ready, notify relevant parties, and support a replacement quote/assignment. Changed cost or timing requires the relevant approvals.

## 16. Receiving, quantities, quality, and processing

Keep these values distinct:
- Estimated harvest quantity.
- Contracted quantity.
- Reported pickup quantity.
- Delivered gross weight and tare, if used.
- Delivered net weight.
- Accepted quantity.
- Rejected quantity.
- Processed input quantity.
- Any measured spoilage or handling loss.

Validate gross >= tare and net = gross - tare. Accepted plus rejected must equal the recorded delivered net quantity for a completed receiving decision.

Record scale/weighbridge evidence and who supplied it. Do not mark a self-reported weight as independently verified.

The processor proposes a receiving decision; the farmer or authorised representative reviews material discrepancies. Define acceptance deadlines and escalations without silently accepting disputed deductions.

Handle:
- Full acceptance.
- Partial acceptance with reasons and revised invoice.
- Full rejection.
- Disputed weight or quality.
- Return or another explicitly agreed disposition of rejected goods.

Over-delivery does not automatically create a larger purchase obligation or extra processing capacity. Require an approved amendment before acceptance above the agreed tolerance.

Keep photos as evidence. Do not claim a photo can certify food safety, starch content, or freshness.

Record actual processing start and completion times. Distinguish conversion yield from avoidable loss; cassava root weight is not directly comparable to finished garri/flour weight as a waste calculation.

Elapsed time since harvest can be an operational attention indicator. It is not a universal food-safety expiry or an AI-certified spoilage prediction.

## 17. Invoices, payments, and disputes

Implement a fully usable direct-payment recording workflow:
- Invoice creation from accepted terms and receiving records.
- Payer records a bank/cash payment with reference, amount, date, and optional evidence.
- Payee confirms receipt or disputes the claim.
- Partial payments and balance tracking.
- Downloadable invoice and acknowledgement documents.
- Audited adjustments and refunds/repayments where applicable.

An uploaded transfer screenshot does not prove that money arrived. Clearly distinguish "reported by payer", "confirmed by recipient", and "verified by payment provider".

For online checkout, implement Paystack for HarvestSlot's own service-fee invoices:
- Backend initialisation.
- Server-generated unique reference and amount.
- Hosted checkout/redirect flow.
- Signed webhook verification using the current official documentation.
- Server-side transaction verification.
- Matching of reference, status, currency, amount, environment, and internal invoice.
- Idempotent reconciliation of callback, webhook, and retry paths.
- Correct failed, pending, reversed, and refunded handling where supported.
- Reconciliation jobs for missed events.

Confirm the webhook signature over the exact expected payload bytes before processing. Persist a valid event durably, then acknowledge promptly and process retryably.

Do not route produce proceeds through HarvestSlot's account in this release. Do not describe Paystack checkout or split payments as escrow. Do not introduce a withdrawable wallet, custody balance, or automated farmer payouts.

Provide an explicit local payment simulator that exercises the same domain reconciliation logic. It must carry a visible simulation label and cannot be enabled in production.

Disputes:
- Booking/invoice-linked categories, amount or quantity in question, description, and private evidence.
- Participant responses and administrator review.
- Status history, deadlines, and resolution rationale.
- No deletion of evidence to erase history.
- Prevent conflicting automatic settlement while relevant amounts are disputed.
- A resolution cannot fabricate a bank transfer or refund; financial execution and its verification remain separate.

## 18. Notifications and communication

Implement an in-app notification inbox plus email delivery. Add a concrete SMS adapter using current provider documentation if credentials/configuration are supplied.

Use a transactional outbox so committed business events are not lost when a notification provider fails. Delivery workers must support retries, backoff, dead-letter inspection, and deduplication.

Notify about:
- Offers, expiry warnings, accepted terms, and outstanding confirmations.
- Readiness gained or lost.
- Pickup reminders and cancellations.
- Delivery and receiving decisions.
- Invoice due dates, reported payments, receipt confirmations, and disputes.

Development uses Mailpit and a clearly labelled local notification outbox. Record queued, sent, failed, and unavailable states accurately. Do not label an SMS sent when no provider is configured.

Use short messages and user notification preferences. Require appropriate contact consent. Do not send demonstration messages to real people.

Provide a booking-specific message thread with participant access and auditability. Full public social chat and WhatsApp automation are not required.

## 19. Maps, uploads, offline behaviour, and privacy

Maps:
- MapLibre or another maintained map library.
- Configurable map/routing provider and required attribution.
- List-based alternatives when maps fail.
- Public discovery shows approximate areas; exact farm pickup coordinates are restricted to authorised booking participants.
- No unlicensed bulk tile downloading or invented geocoding accuracy.

Files:
- Private S3-compatible storage and MinIO locally.
- Size limits, content-type inspection, permitted extensions, and generated object keys.
- Signed, expiring access with object-level authorisation.
- Malware scanning/quarantine support before sensitive files are shared.
- Compression for field images, while retaining appropriate evidence metadata.
- No public bucket access for identity documents, payment evidence, or disputes.

PWA:
- Manifest, icons, installability, app shell, and clear network status.
- Allow offline creation/editing of local draft requests.
- Queue only explicitly safe draft actions with idempotency keys.
- On reconnection, revalidate server versions and show conflicts.
- Booking confirmation, payment, quantity commitments, and readiness changes require the server.
- Never show stale capacity as live or an offline action as confirmed.
- Exclude sensitive authenticated API responses from shared service-worker caches.
- Scope local drafts to the account, minimise retained personal data, use expiry, and clear on logout.

Publish a practical privacy notice and terms template describing the actual product behaviour, with owner details and legal-review items clearly marked for completion. Implement consent records, access/export requests, and a documented retention/deletion workflow that preserves legitimately required transaction history without claiming legal certification.

## 20. Optional AI assistance

AI must not be a dependency for the commercial workflow.

After the core release works, add a feature-flagged voice-to-draft assistant if a suitable provider is available:
- Record/upload a short English or Yoruba voice note with consent.
- Extract tentative quantity, location text, and dates.
- Validate against a strict schema.
- Ask the user to review every extracted field.
- Keep uncertain values unresolved.
- Require explicit user action to save/publish.

Treat transcribed and uploaded content as untrusted input. It cannot change system instructions, execute tools, make bookings, accept terms, or trigger payments.

If credentials or reliable language support are unavailable, preserve the functional manual form and report AI as unconfigured. Do not add a decorative AI button.

Do not implement automated credit scoring, guaranteed crop valuation, food-safety diagnosis, or invented "AI spoilage accuracy".

## 21. Analytics and impact measurement

Every metric must have a definition, source fields, time range, exclusions, and a sensible empty state.

Operational metrics:
- Requests published and quantity still unallocated.
- Confirmed/active/completed bookings.
- Held, committed, consumed, and unused slot capacity.
- Confirmation lead time.
- Pickup/delivery punctuality.
- Actual harvest-to-receipt and harvest-to-processing durations.
- Cancellation and no-show counts.
- Accepted/rejected quantities and documented reasons.
- Payment due, overdue, reported, and confirmed amounts.

Financial views:
- Produce transaction value.
- Freight obligations.
- HarvestSlot fees.
- Farmer receipts and separately estimated net proceeds.

Do not label total produce transaction value as HarvestSlot revenue. Do not label invoice value as cash received.

Impact views:
- Measured spoilage records with provenance.
- Baseline and pilot observations, if collected.
- Transparent comparison methodology.
- No automatic "tonnes saved", "income increased", "jobs created", or emissions claims based simply on completed bookings.

Separate demonstration data from live data in all analytics and exports.

## 22. Required pages and API surfaces

Public:
- Landing page, how it works, role-specific onboarding information, FAQ/contact, login, registration, recovery, privacy, and terms.
- Clear demo entry only in permitted demo environments.
- No invented social proof.

Authenticated shared:
- Dashboard, notifications, booking detail/timeline, messages, documents, profile, sessions, and settings.

Farmer:
- Harvest list, new/edit request wizard, match results, offer comparison, bookings, payment receipts, disputes, and cooperative permissions.

Processor:
- Organisation profile, facilities/lines, capacity calendar, harvest inbox, offers, intake schedule, receiving, processing, invoices, staff, and analytics.

Transporter:
- Vehicles, drivers, availability, quotes, assigned jobs, handover/delivery flow, invoices, and history.

Cooperative:
- Members, consent/delegations, represented harvests, bookings, and member-level reporting.

Admin:
- Overview, verification review, users/organisations, booking incidents, disputes, configurable policies, integration health, outbox/failed jobs, audit log, and exports.

Version the API under /api/v1. Supply documented endpoints for all these workflows, including explicit actions such as offer acceptance, reservation confirmation, harvest commencement, pickup acknowledgement, receiving review, invoice payment reporting, and payee confirmation.

Avoid generic PATCH endpoints that let clients set arbitrary statuses.

Provide:
- OpenAPI schemas and examples.
- Cursor or bounded page-based pagination.
- Whitelisted sorting/filtering.
- Stable error codes.
- Appropriate 401/403/404 behaviour, 409 conflicts, validation errors, and rate-limit responses.
- Idempotency handling and optimistic-version checks.
- An authenticated integration-status endpoint that reveals capability, not secrets.
- Health/readiness endpoints suitable for deployment.

Use polling or SSE for booking updates with authorisation and reconnection support. Avoid unnecessary WebSocket complexity.

## 23. Demo data and showcase experience

Create deterministic, clearly fictional seed data:
- 15 farmer profiles.
- 4 processor organisations and several facilities/lines.
- 2 cooperatives.
- 6 vehicles and appropriate drivers.
- 20 harvest requests.
- Enough future slots to demonstrate matching and conflicts.
- At least 12 bookings spanning meaningful lifecycle states.
- Notifications, invoices, partial payments, receiving evidence, and disputes.

Use Oyo locality labels such as Ibadan, Akinyele, Iseyin, Ogbomoso, and Saki where appropriate, while marking organisations and farm pins as demonstration data. Do not imply real businesses are partners.

Use reserved example-domain email addresses and suppress all external delivery for demo accounts. Avoid assigning real people's phone numbers to fictional users.

Use relative dates or a configurable demo clock so the dataset remains useful. Prevent seeding into production accidentally. Any demo reset must be an explicit local/development command with safeguards.

Provide demo credentials for:
- Farmer.
- Processor manager.
- Receiving officer.
- Transporter/driver.
- Cooperative representative.
- Administrator.

Offer quick role switching only in a visibly marked, access-controlled demonstration environment. Role switching must never become an authentication bypass in production.

Document this complete demonstration:
1. Farmer creates a 2,000 kg request.
2. Matching explains available processors.
3. Processor issues an offer and reserves quantity/capacity.
4. Farmer accepts the terms.
5. Transport quote and assignment are confirmed.
6. Readiness becomes true.
7. A competing request cannot overbook the remaining capacity.
8. Harvest, collection, and delivery are recorded.
9. Processor records 1,900 kg delivered: 1,800 kg accepted and 100 kg rejected with evidence.
10. Farmer reviews the discrepancy and accepts or opens a dispute.
11. Produce invoice uses the accepted 1,800 kg.
12. Payment is reported, then independently confirmed by the payee.
13. Operational metrics update without fabricated impact claims.

Also include cancellation/reassignment and expired-hold demonstrations.

## 24. Testing and quality gates

Write meaningful tests for the business invariants and real integrations between components. Do not rely solely on mocked repository tests.

Unit tests:
- Monetary arithmetic, fee rounding, and kilograms/tonnes conversion.
- Readiness checks.
- Eligible matching and ranking explanations.
- Valid and invalid status transitions.
- Permission and delegation rules.
- Invoice calculations and partial balances.

Integration tests with real PostgreSQL:
- Two simultaneous requests competing for the last capacity cannot both succeed.
- Concurrent allocations cannot exceed a harvest request's supply.
- A driver/vehicle cannot be double-booked.
- Confirmation racing with hold expiry produces one valid outcome.
- Duplicate confirmation/cancellation requests do not allocate or release twice.
- Amendments invalidate stale approvals.
- Used slot capacity remains consumed.
- Tenant boundaries and revoked delegations are enforced.
- A rejected amendment leaves the previous valid state intact.
- Duplicate/out-of-order payment events do not double-credit an invoice.
- Payment screenshots cannot mark invoices as provider-verified.
- Outbox records survive provider failure and retry safely.

Browser E2E:
- Direct farmer happy path through payment receipt.
- Cooperative acting with and without approval authority.
- Processor capacity publication, offer, and receiving.
- Driver collection and delivery.
- Partial acceptance/dispute.
- Cancellation and replacement transport.
- Unauthorised direct URL/API access.
- Offline draft reconnection/conflict.
- Mobile navigation and critical form validation.

Validate actual responsive layouts at representative narrow mobile, tablet, and desktop sizes. Review for overflow, unreadable labels, inaccessible dialogs, and missing focus states.

Run type checking, linting, unit tests, integration tests, browser checks, migrations against a clean database, and production builds. Fix failures. Add CI using the same meaningful checks.

Include a documented, reproducible smoke/load test for the core API and booking race behaviour. Report its workload and observed results; do not claim untested scale.

## 25. Local setup, environment, and deployment

Deliver a complete Docker Compose environment for:
- PostgreSQL.
- Redis.
- MinIO.
- Mailpit.
- Web.
- API.
- Worker.

Provide a convenient local-development option for running application processes on the host while infrastructure runs in Docker.

Document setup for Bash and Windows/PowerShell or WSL. Do not depend on undocumented globally installed tools.

Provide working root scripts with equivalent names for:
    pnpm install
    pnpm infra:up
    pnpm db:migrate
    pnpm db:seed
    pnpm dev
    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm test:integration
    pnpm test:e2e
    pnpm build

Add production Dockerfiles, reverse-proxy configuration, health checks, non-root containers, graceful shutdown, and persistent volumes where required.

Use environment examples covering:
- Database and Redis.
- Session/security secrets.
- Public base URL and allowed origins.
- Object storage.
- Mail and optional SMS.
- Paystack test/live mode and server secrets.
- Map/routing provider.
- Optional AI provider.
- Demo mode and environment safeguards.
- Reservation expiry, timing buffers, and configurable fees.

Validate configurations. Keep secrets out of browser bundles, repositories, screenshots, and logs. Commit an example environment file, never a real secret file.

Document one concrete deployment path suitable for an Ubuntu VPS with TLS and separate web/API/worker services. Include database migration execution, worker rollout, backups, a tested restore procedure in a disposable environment, monitoring, and rollback limitations.

Prepare deployment assets and instructions. Do not purchase services, create paid resources, contact real users, or publish to an unspecified production target.

## 26. Implementation phases

Phase 1 — Foundation:
Repository audit, architectural decisions, workspaces, design tokens, environment validation, schema, migrations, local infrastructure, authentication, organisation permissions, and base UI.

Phase 2 — Core booking slice:
Farmer requests, processor facilities/slots, matching, offers, database-backed holds, confirmations, transport assignment, and readiness. Make this work end to end before expanding secondary dashboards.

Phase 3 — Operational fulfilment:
Harvest/collection/delivery, receiving, quality decisions, processing, cancellation/recovery, invoices, payment evidence, receipt confirmation, and disputes.

Phase 4 — Supporting platform:
Cooperatives, notification outbox, private uploads, messaging, admin workflows, analytics, exports, PWA/offline drafts, and optional configured integrations.

Phase 5 — Quality and delivery:
Seeded showcase, integration/E2E coverage, concurrency verification, responsive/accessibility review, CI, production builds, documentation, and deployment packaging.

At each phase, implement UI, API, database, permissions, loading/error states, and relevant tests together. Do not finish all screens first and leave the business logic for later.

## 27. Final deliverables and definition of done

The repository must include:
- Running web application, API, and worker.
- Schema, committed migrations, seed scripts, and example environment files.
- All essential role workflows.
- Actual protected persistence and domain validation.
- OpenAPI documentation.
- Tests, CI, Docker configuration, and deployment assets.
- A useful README with setup commands, local URLs, and demo accounts.
- docs/ARCHITECTURE.md.
- docs/DOMAIN_AND_STATE_MACHINES.md.
- docs/DECISIONS.md.
- docs/API.md.
- docs/SECURITY_AND_PRIVACY.md.
- docs/DEPLOYMENT.md.
- docs/DEMO_SCRIPT.md.
- docs/TEST_RESULTS.md.
- docs/IMPLEMENTATION_STATUS.md.
- docs/PROGRESS.md.

Completion means a new developer can follow the README, start the stack, sign in as each role, and complete the full example workflow with persistent data and correct commercial calculations.

No visible essential feature should be a stub. Optional integrations that require credentials must have a real implemented adapter or be honestly listed as not implemented; do not treat an interface alone as a completed integration.

Conclude your implementation with:
1. What works.
2. Commands and local addresses.
3. Demo accounts.
4. Checks actually run and their results.
5. External services configured versus unconfigured.
6. Remaining limitations, if any.
7. Exact deployment steps.

## 28. Documentation references

Consult current official documentation and the selected installed versions:
- Next.js: https://nextjs.org/docs
- NestJS: https://docs.nestjs.com/
- Prisma: https://www.prisma.io/docs
- PostgreSQL: https://www.postgresql.org/docs/current/
- BullMQ: https://docs.bullmq.io/
- Paystack webhooks: https://paystack.com/docs/payments/webhooks/
- Paystack verification: https://paystack.com/docs/payments/verify-payments/
- Playwright: https://playwright.dev/docs/intro
- MapLibre: https://maplibre.org/
- W3C accessibility guidance: https://www.w3.org/WAI/

These links are implementation references, not permission to replace this product's authority rules or commercial model.

Start now: inspect the repository, write the brief implementation plan and checklist, then begin building Phase 1 and the complete booking slice. Continue through the remaining phases, validating the system as you go.
