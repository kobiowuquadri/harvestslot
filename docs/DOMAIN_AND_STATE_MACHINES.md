# Domain model, authority rules and state machines

This document is the behavioural contract for the API. Code in `packages/core/src/state` and `packages/core/src/readiness` implements these tables; unit tests in `packages/core/test` and integration tests in `apps/api/test/integration` verify them.

## 1. Units, money and rounding

| Concept | Storage | API contract | Rule |
|---|---|---|---|
| Quantity | `NUMERIC(14,3)` kilograms | decimal string, ≤ 3 decimal places (`"1800.000"`) | Arithmetic is done in integer **grams** (`kgToGrams`). Negative values rejected. Tonnes are display-only (`1 t = 1000 kg`). |
| Money | `BIGINT` kobo (NGN minor unit) | integer kobo (JSON number, asserted ≤ `Number.MAX_SAFE_INTEGER`) | No floating point. `BigInt` arithmetic in `packages/core/src/money.ts`. |
| Unit price | `BIGINT` kobo per kilogram | integer kobo per kg | e.g. ₦250/kg = `25000`. |
| Percentages | basis points (`INT`) | integer bps | 1.5 % = `150`. |
| Timestamps | `TIMESTAMPTZ` (UTC) | ISO-8601 UTC | Displayed in `Africa/Lagos`. |
| Harvest dates | `DATE` | `YYYY-MM-DD` (Lagos calendar date) | |

**Rounding (defined once, `roundHalfUpDiv`)**: amounts are rounded half-up to the nearest kobo.

* Produce amount = `roundHalfUp(acceptedGrams × priceKoboPerKg / 1000)`.
* Platform fee = `roundHalfUp(produceAmountKobo × feeBps / 10000)` (+ optional flat fee per booking).
* Freight = the accepted quote amount (already integer kobo).
* Estimated farmer net = produce amount − farmer-paid freight − separately approved farmer-borne charges. Always labelled as an estimate and shown separately from invoice totals and confirmed receipts.

## 2. Separate obligations

1. **Produce invoice** — processor (payer) owes farmer (payee) for accepted cassava.
2. **Freight invoice** — the agreed freight payer (processor by default, farmer only when explicitly shown and accepted) owes the transporter.
3. **Platform fee invoice** — processor owes HarvestSlot the agreed service fee (if enabled).

There is no netting/set-off between invoices, no wallet, no custody of produce proceeds, and no escrow. The farmer is never charged a processing fee.

## 3. Roles and authority

### Platform
* `ADMIN` (`users.platform_role`) — set only by the `pnpm admin:create` CLI or the development seed, never by registration. Admin interventions require a reason and write an audit event. Admin routes require MFA when `ADMIN_REQUIRE_MFA=true` (default in production).

### Organisation memberships (`memberships.roles[]`)

| Org type | Role | Can |
|---|---|---|
| Processor | `OWNER` | everything for the organisation, including staff management |
| | `MANAGER` | facilities, lines, slots, offers, commercial confirmations, transport coordination, receiving, processing; cannot manage owners/managers or record payments |
| | `RECEIVING_OFFICER` | record arrival, weights, evidence, quality decisions, processing records |
| | `FINANCE_OFFICER` | view invoices, report outgoing payments, confirm incoming receipts, pay fee invoices |
| Transporter | `OWNER` | everything incl. staff, invoices |
| | `DISPATCHER` | vehicles, drivers, availability, service areas, quotes, assignments |
| | `DRIVER` | execute only jobs assigned to them |
| Cooperative | `OWNER` | members, consent, staff |
| | `REPRESENTATIVE` | act for members within each member's delegation scopes |

### Farmer delegation scopes (`delegation_consents.scopes[]`)

| Scope | Allows a cooperative representative to |
|---|---|
| `ASSIST_DATA_ENTRY` | create/edit/publish harvest requests, farm locations, prepare (not approve) an offer acceptance, report harvest progress, message |
| `APPROVE_SALE` | accept offers, terms, amendments, farmer-paid freight; review receiving decisions; open disputes; cancel bookings |
| `CONFIRM_HANDOVER` | confirm pickup handover as the farmer's authorised agent |
| `VIEW_FINANCIALS` | view the member's invoices and payment status |
| `CONFIRM_PAYMENT_RECEIPT` | confirm/dispute receipt of a payment to the member |

A delegation is valid only while it is not revoked, not expired, the cooperative membership is active, and the representative holds an active `OWNER`/`REPRESENTATIVE` membership in that cooperative. Every delegated action records **both** the representative (`actor_user_id`) and the represented farmer (`acting_for_farmer_id`) plus the `delegation_id`. Revocation stops future delegated actions; historical confirmations remain valid.

## 4. Capacity and supply

* **Slot** (`processing_slots`): `[starts_at, ends_at)` on one processing line, with `processing_capacity_kg` (machine capacity) and `purchase_limit_kg` (willingness to buy). Effective limit = `min(processing, purchase)`. Slots on the same line may not overlap (GiST exclusion constraint, cancelled slots excluded).
* **Reservation** (`reservations`) holds slot capacity: `HELD` (with `expires_at`) → `CONFIRMED` → `CONSUMED`; or `RELEASED` / `EXPIRED`.
  `used(slot) = Σ CONFIRMED + Σ CONSUMED + Σ HELD where expires_at > now()`. Consumed capacity is never returned to the window.
* **Harvest lot** (`harvest_lots`) allocates supply from a harvest request to one booking.
  `allocated(request) = Σ lots where status ≠ RELEASED`; must be ≤ `eligible_quantity_kg`. A lot is released only before harvest starts. After harvest starts, problems go through an incident, never silent release.
* **Capacity reduction** cannot go below `used(slot)`; it must be preceded by cancellation/amendment handling.
* Lock order (all operations): harvest request → slot → booking → vehicle → driver.

## 5. Offer state machine

| From | Action | Actor | Preconditions | To | Writes / events |
|---|---|---|---|---|---|
| — | create | Processor OWNER/MANAGER | request `PUBLISHED`; org `APPROVED`; facility `ACTIVE`; slot `PUBLISHED`, in the future; qty ≤ request remaining; qty ≥ facility minimum; capacity available | `OPEN` | offer, version 1 (processor-proposed), reservation `HELD` (expires with offer), outbox `offer.created` |
| `OPEN`/`COUNTERED` | revise | Processor OWNER/MANAGER | `expectedVersionNo` matches; capacity for any increase | `OPEN` | new version, reservation resized under slot lock |
| `OPEN` | counter | Farmer / `APPROVE_SALE` delegate | `expectedVersionNo` matches | `COUNTERED` | farmer-proposed version |
| `OPEN` | accept | Farmer / `APPROVE_SALE` delegate | latest version processor-proposed; not expired; supply available | `ACCEPTED` | booking `AWAITING_CONFIRMATIONS` (see §6) |
| `OPEN` | prepare acceptance | `ASSIST_DATA_ENTRY`-only delegate | as accept | `ACCEPTED` | booking `DRAFT` awaiting farmer-side approval |
| `COUNTERED` | accept counter | Processor OWNER/MANAGER | capacity for counter qty; supply available | `ACCEPTED` | booking `AWAITING_CONFIRMATIONS` |
| `OPEN`/`COUNTERED` | decline | Farmer / `APPROVE_SALE` | — | `DECLINED` | reservation `RELEASED` |
| `OPEN`/`COUNTERED` | withdraw | Processor OWNER/MANAGER | — | `WITHDRAWN` | reservation `RELEASED` |
| `OPEN`/`COUNTERED` | expire | system (lazy read + sweeper) | `now ≥ expires_at` | `EXPIRED` | reservation `EXPIRED` |
| `OPEN`/`COUNTERED` | lapse | system | request remaining < offer qty after another acceptance | `LAPSED` | reservation `RELEASED` |

A recommendation or match never reserves anything; only an offer holds capacity.

## 6. Booking state machine

| From | Action | Actor | Preconditions | To |
|---|---|---|---|---|
| — | accept offer | Farmer / `APPROVE_SALE` | §5 | `AWAITING_CONFIRMATIONS` |
| — | prepare acceptance | `ASSIST_DATA_ENTRY` delegate | §5 | `DRAFT` |
| `DRAFT` | approve | Farmer / `APPROVE_SALE` | hold valid | `AWAITING_CONFIRMATIONS` |
| `DRAFT` | discard | Farmer / any delegate | — | `CANCELLED` (lot + hold released) |
| `AWAITING_CONFIRMATIONS` | final confirmation | system, inside the confirming request | current terms include transport; all required parties confirmed the current version; reservation `HELD` and unexpired; trip conflict-free | `CONFIRMED` (reservation → `CONFIRMED`, trip → `CONFIRMED`, shipment `ASSIGNED`) |
| `DRAFT`/`AWAITING_CONFIRMATIONS` | expire | system | reservation hold expired | `EXPIRED` (lot, hold and trip hold released exactly once) |
| `DRAFT`/`AWAITING_CONFIRMATIONS`/`CONFIRMED` | cancel | Farmer / `APPROVE_SALE`, Processor OWNER/MANAGER, Admin (reason) | harvest not started | `CANCELLED` (lot, reservation, trip released) |
| `CONFIRMED` | start harvest | Farmer / `ASSIST_DATA_ENTRY` or `APPROVE_SALE` | readiness = true | `ACTIVE` |
| `ACTIVE` | complete | system | shipment `DELIVERED` and receiving decision `FINAL` | `COMPLETED` (reservation → `CONSUMED`) |

`ACTIVE` bookings cannot be cancelled. Problems after harvest commencement use **incidents** (`booking_incidents`) with recorded recovery actions (replacement transport, amended slot, produce disposition) and never return quantity to the unallocated pool.

### Terms versions, amendments and confirmations

* `booking_terms_versions` rows are immutable snapshots (DB trigger). `bookings.current_terms_version_no` points to the agreed version.
* A change (transport added/replaced, price, quantity, slot, windows, freight, quality, tolerance) is a **proposed version** in `booking_amendments` (`PENDING`). The current version stays in force until every required party confirms. Any required party can reject → `REJECTED`; prior state untouched.
* Required parties: farmer and processor always; transporter when a transport section exists.
* When a new version is proposed, a party's confirmation is **carried forward** (recorded as `CARRIED_FORWARD`) only if none of that party's material fields changed:
  * Farmer: quantity, price, harvest date, pickup window, quality terms, tolerance, payment/cancellation/rejection terms, freight payer, and freight amount when the farmer pays.
  * Processor: quantity, price, slot, delivery window, quality terms, tolerance, payment/cancellation/rejection terms, freight payer, freight amount when the processor pays, platform fee.
  * Transporter: pickup/destination, pickup and delivery windows, quantity, freight amount and payer, vehicle, driver.
* Confirmations reference an exact `terms_version_id` and `content_hash`; the client must send both, so a party cannot confirm terms it has not seen.

### Readiness (`READY TO HARVEST`)

Computed by `computeReadiness()` from current database facts; never stored as a client-settable flag. Each check returns `{ code, passed, explanation, responsible }`:

1. `FARMER_ACCEPTED` — farmer or valid `APPROVE_SALE` delegate confirmed the current version.
2. `PROCESSOR_ACCEPTED` — processor confirmed the current version.
3. `CAPACITY_RESERVED` — supply lot `ALLOCATED`+ and slot reservation `CONFIRMED`.
4. `TRANSPORT_ACCEPTED` — current version has an accepted quote and freight payer.
5. `VEHICLE_DRIVER_CONFIRMED` — trip `CONFIRMED`, driver assigned, no overlapping confirmed trip for vehicle or driver (with buffer).
6. `WINDOWS_FEASIBLE` — pickup window not ended; slot not cancelled/closed; delivery window inside slot.
7. `PARTICIPANTS_ELIGIBLE` — processor and transporter organisations approved and not suspended; facility active; farmer account (if any) not suspended; delegations used remain valid for future actions.
8. `NO_BLOCKING_ISSUES` — booking `CONFIRMED`; no pending amendment; no open blocking incident; not cancelled/expired.

Readiness transitions are persisted in `readiness_events` whenever a mutation or sweep recomputes a different result.

## 7. Transport

**Quote** (`transport_quotes`): `SUBMITTED` → `ACCEPTED` | `DECLINED` | `WITHDRAWN` | `EXPIRED` | `SUPERSEDED`.
* Submit (transporter OWNER/DISPATCHER): vehicle active, capacity ≥ contracted qty × (1 + tolerance); the trip `[pickup_start − buffer, delivery_end + buffer]` lies inside a published availability window and does not overlap another `HELD` (unexpired) / `CONFIRMED` / `IN_PROGRESS` trip of the vehicle or driver.
* Accept (freight payer): locks vehicle (and driver), re-checks, creates trip `HELD`, proposes a terms version with the transport section; payer confirms explicitly.
* Accept assignment (transporter OWNER/DISPATCHER): confirms driver + vehicle; re-checks conflicts; transporter confirmation recorded; may finalise the amendment and the booking.

**Trip reservation**: `HELD` → `CONFIRMED` → `IN_PROGRESS` → `COMPLETED`; or `RELEASED` / `EXPIRED` / `CANCELLED`. A vehicle serves one active booking at a time.

**Shipment** milestones: `ASSIGNED` → `EN_ROUTE_TO_PICKUP` → `ARRIVED_AT_PICKUP` → `COLLECTED` (driver records quantity/evidence) → `PICKUP_CONFIRMED` (farmer/authorised agent acknowledges in-app, or driver enters the farmer's expiring handover code, or an audited exception is approved) → `IN_TRANSIT` → `ARRIVED_AT_FACILITY` → `DELIVERED` (receiving staff acknowledge in-app or via code). `CANCELLED` by the transporter before collection (reason required): booking stays commercially `CONFIRMED` but readiness is lost; a replacement quote goes through a new amendment.

Handover codes: 6 digits, stored hashed, bound to shipment + purpose, expire after `HANDOVER_CODE_TTL_MINUTES`, max 5 attempts. GPS is optional; when captured, accuracy and source (`DEVICE_GPS` / `SELF_REPORTED`) are stored.

## 8. Receiving and quality

Distinct values: estimated harvest qty (request), contracted qty (terms), reported pickup qty (pickup record), gross/tare/net (receiving), accepted/rejected (quality assessment), processed input/output (processing), measured handling loss.

* `gross ≥ tare ≥ 0`, `net = gross − tare` (DB check constraint).
* Decision requires `accepted + rejected = net`.
* `accepted ≤ contracted × (1 + tolerance)` unless an approved over-delivery amendment exists.
* Weight evidence records who supplied it and its verification level (`SELF_REPORTED`, `DOCUMENT_UPLOADED`, `ADMIN_REVIEWED`). Nothing is marked independently verified by default.

Receiving status: `DRAFT` → `PROPOSED` → (`FINAL` if no material discrepancy) or `AWAITING_FARMER_REVIEW` → `FINAL` (farmer accepts) | `DISPUTED` (farmer disputes) | `REVIEW_OVERDUE` (deadline passed; escalated to admin; never auto-accepted). `DISPUTED`/`REVIEW_OVERDUE` → `FINAL` via dispute resolution.

Material discrepancy: any rejected quantity, or net below contracted × (1 − tolerance).

On `PROPOSED → FINAL` or `→ DISPUTED`, invoices are issued for the processor-accepted quantity (the undisputed amount); a later resolution can add an audited adjustment.

## 9. Invoices and payments

Invoice status: `ISSUED` → `PARTIALLY_PAID` → `PAID`; `OVERDUE` is derived (`due_at < now` and outstanding > 0); `DISPUTED` flag while a linked dispute is open.

`total = Σ lines + Σ adjustments`; `confirmed_paid = Σ attempts CONFIRMED_BY_RECIPIENT or PROVIDER_VERIFIED − Σ confirmed refunds`; `outstanding = total − confirmed_paid`.

Payment attempt verification levels — always displayed verbatim:
* `REPORTED_BY_PAYER` — payer says they paid (evidence upload does not change this).
* `CONFIRMED_BY_RECIPIENT` — payee confirmed the money arrived.
* `VERIFIED_BY_PROVIDER` — Paystack verify API matched reference, amount, currency, status and environment.
* `SIMULATED` — local simulator; never counted as provider-verified in live analytics.

A new report is refused if `Σ open reports + confirmed + new > total` (no overpayment workflow in this release). Paystack is used only for platform-fee invoices.

## 10. Disputes

`OPEN` → `AWAITING_RESPONSE` → `UNDER_REVIEW` → `RESOLVED` | `WITHDRAWN`. Messages and evidence are append-only. Resolution (admin with rationale, or mutual settlement accepted by both parties) may create invoice adjustments; it never records a transfer or refund — those are separate payment facts requiring their own confirmation. While an invoice has an open dispute, adjustments outside the resolution are refused.
