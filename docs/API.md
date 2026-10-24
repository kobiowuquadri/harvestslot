# HarvestSlot API

The NestJS API under `/api/v1` is the only authority for business rules, permissions and persistence. The complete machine-readable reference is OpenAPI 3:

* live: `http://localhost:4000/api/docs` (Swagger UI) and `/api/docs/openapi.json`
* committed snapshot: [`docs/openapi.json`](openapi.json) (188 paths; regenerate with `pnpm --filter @harvestslot/api openapi:export`)

Request and response shapes are Zod schemas in `packages/contracts`, shared by the web app and the API, so the OpenAPI components and the TypeScript types come from one source.

## Conventions

| Topic | Rule |
|---|---|
| Base path | `/api/v1`. The web app calls it on its own origin (Next.js rewrite in development, Caddy in production). |
| Authentication | Opaque session token in the HttpOnly cookie `hs_session` (SHA-256 hashed server-side; idle and absolute expiry; per-session revocation). `POST /auth/login` → `{ mfaRequired }`; when true, `POST /auth/mfa/verify` completes sign-in. |
| CSRF | Every non-GET request sends `X-CSRF-Token` equal to the readable `hs_csrf` cookie (an HMAC bound to the session) and an allowed `Origin`. Get a token with `GET /auth/csrf`. The Paystack webhook is exempt and verified by signature. |
| Idempotency | Consequential writes (offers, acceptance, confirmations, cancellations, quotes, assignments, payments, checkout, harvest creation, receiving decisions…) require `Idempotency-Key` (UUID). The key is scoped to actor + operation and bound to a hash of the request: a retry returns the original response; reusing a key with a different body is `409 IDEMPOTENCY_KEY_REUSED`. |
| Optimistic versions | Editable records carry `version`; writes send `expectedVersion` (offers: `expectedVersionNo`). A stale write is `409 VERSION_CONFLICT`. |
| Errors | `{ "error": { "code", "message", "details", "requestId" } }`. Validation is `422 VALIDATION_FAILED` with `details: [{ path, message }]`. Stable codes are listed in `packages/contracts/src/errors.ts` and in the OpenAPI description (e.g. `CAPACITY_EXCEEDED`, `SUPPLY_EXCEEDED`, `HOLD_EXPIRED`, `TERMS_CHANGED`, `DELEGATION_SCOPE_MISSING`, `VEHICLE_CONFLICT`, `OVER_TOLERANCE`, `INVOICE_DISPUTED`). Records the caller may not see are `404`, never `403`, so existence is not leaked. |
| Units | Quantities are decimal strings in **kilograms** with up to 3 decimals (`"2000.000"`); money is integer **kobo** (`45000000` = ₦450,000.00); timestamps are UTC ISO-8601; calendar dates (`plannedHarvestDate`) are `YYYY-MM-DD` in Africa/Lagos. |
| Rate limits | Per IP and per account/action on sign-in, registration, OTP, password reset, uploads and checkout; `429 RATE_LIMITED` with `Retry-After`. |
| Caching | Authenticated responses are `Cache-Control: no-store, private`. |
| Live updates | `GET /bookings/{id}/events` is a server-sent-event stream (`booking.updated`); access is re-checked on every tick. |

## Endpoint catalogue

Paths are relative to `/api/v1`. “Org” routes take the organisation id in the path; the server checks membership and role on every call.

### Auth and account
`GET /auth/csrf` · `POST /auth/register` (FARMER, PROCESSOR, TRANSPORTER, COOPERATIVE or STAFF) · `POST /auth/login` · `POST /auth/mfa/verify` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/demo-login` (demo environments only) · `POST /auth/verify-email` · `POST /auth/verify-email/resend` · `POST /auth/forgot-password` · `POST /auth/reset-password` · `POST /auth/phone-recovery/start|complete` · `POST /auth/phone/send-code` · `POST /auth/phone/verify` · `GET /auth/sessions` · `DELETE /auth/sessions/{id}` · `POST /auth/sessions/revoke-others` · `POST /auth/password/change` · `PATCH /auth/account` · `POST /auth/mfa/setup|enable|disable` · `POST /auth/invitations/accept` · `POST /auth/claim/start|complete`

### Organisations and staff
`POST /organisations` · `GET|PATCH /organisations/{orgId}` · `GET /organisations/{orgId}/staff` · `POST /organisations/{orgId}/invitations` · `POST /organisations/{orgId}/invitations/{id}/revoke` · `POST /organisations/{orgId}/members/{membershipId}/roles` · `POST /organisations/{orgId}/members/{membershipId}/revoke`

### Farmers, cooperatives and delegation
`GET|POST /farmers/me` · `GET|PATCH /farmers/{farmerId}` · `POST /farmers/{farmerId}/locations` · `PATCH /farmers/{farmerId}/locations/{id}` · `POST /farmers/{farmerId}/locations/{id}/archive` · `GET|POST /farmers/{farmerId}/delegations` · `POST /delegations/{id}/revoke` · `GET|POST /cooperatives/{coopId}/members` · `POST /cooperatives/{coopId}/members/link` · `POST /cooperatives/{coopId}/members/{farmerId}/delegations` · `POST /cooperatives/{coopId}/members/{farmerId}/claim-invite` · `POST /cooperatives/{coopId}/members/{farmerId}/end`

### Facilities, lines and capacity
`GET|POST /organisations/{orgId}/facilities` · `GET|PATCH /facilities/{id}` · `POST /facilities/{id}/lines` · `PATCH /lines/{id}` · `GET /organisations/{orgId}/slots` · `POST /slots` · `POST /slots/series` · `GET /slots/{id}` · `POST /slots/{id}/publish|close|cancel` · `POST /slots/{id}/capacity` · `GET /slots/{id}/adjustments`

### Harvest requests, matching and offers
`GET /harvests` · `POST /farmers/{farmerId}/harvests` · `GET|PATCH /harvests/{id}` · `POST /harvests/{id}/publish|close|withdraw` · `GET /harvests/{id}/matches` · `POST /harvests/{id}/offer-requests` · `GET /organisations/{orgId}/inbox` · `POST /offers` · `GET /offers/{id}` · `GET /harvests/{id}/offers` · `GET /organisations/{orgId}/offers` · `POST /offers/{id}/revise|counter|accept|prepare-acceptance|accept-counter|decline|withdraw`

### Bookings
`GET /bookings` (`view=farmer|processor|transporter|cooperative|admin`) · `GET /bookings/{id}` · `GET /bookings/{id}/readiness` · `GET /bookings/{id}/timeline` · `GET /bookings/{id}/events` (SSE) · `POST /bookings/{id}/confirm` (terms version id + content hash) · `POST /bookings/{id}/amendments` · `POST /bookings/{id}/amendments/decide` · `POST /bookings/{id}/approve|discard|cancel` · `POST /bookings/{id}/start-harvest` · `POST /bookings/{id}/ready-for-pickup` · `POST /bookings/{id}/incidents` · `POST /bookings/{id}/incidents/{incidentId}/resolve` · `GET|POST /bookings/{id}/messages` · `GET /bookings/{id}/attachments`

### Transport
`GET|POST /organisations/{orgId}/vehicles` · `PATCH /vehicles/{id}` · `GET|POST /organisations/{orgId}/drivers` · `PATCH /drivers/{id}` · `GET|PUT /organisations/{orgId}/service-areas` · `GET|POST /organisations/{orgId}/availability` · `DELETE /availability/{id}` · `GET /organisations/{orgId}/opportunities` · `GET|POST /organisations/{orgId}/quotes` · `GET /bookings/{id}/quotes` · `POST /quotes/{id}/accept|decline|withdraw|decline-assignment` · `POST /assignments/accept` · `POST /trips/{id}/cancel` · `GET /organisations/{orgId}/jobs` · `GET /shipments/{id}` · `POST /shipments/{id}/depart|arrive-pickup|collection|leave-pickup|arrive-facility` · `POST /shipments/{id}/handover-code|pickup-code|delivery-code` · `POST /shipments/{id}/confirm-pickup|pickup-exception|approve-exception|confirm-delivery`

### Receiving and processing
`GET /bookings/{id}/receiving` · `POST /bookings/{id}/receiving/weighing|evidence|decision|review` · `GET /bookings/{id}/processing` · `POST /bookings/{id}/processing/start|complete` · `POST /bookings/{id}/losses` · `GET /organisations/{orgId}/intake`

### Invoices, payments and disputes
`GET /invoices` · `GET /invoices/{id}` · `GET /invoices/{id}/document` (printable HTML) · `POST /invoices/{id}/payments` · `POST /payments/{id}/receipt` · `GET /payments/{id}/acknowledgement` · `POST /invoices/{id}/refunds` · `POST /refunds/{id}/confirm` · `POST /invoices/{id}/checkout` · `POST /payments/verify` · `POST /webhooks/paystack` (signature-verified) · `GET|POST /dev/payment-simulator/{reference}` (simulator only) · `GET /payments/return` · `GET|POST /disputes` · `GET /disputes/{id}` · `POST /disputes/{id}/messages` · `POST /disputes/{id}/messages/{messageId}/accept-settlement` · `POST /disputes/{id}/resolve` (admin) · `POST /disputes/{id}/withdraw`

### Uploads, notifications, privacy, analytics
`POST /uploads` (multipart; images re-encoded and stripped of metadata; PDFs) · `GET /attachments/{id}` · `GET /attachments/{id}/link` (short-lived signed URL) · `GET /attachments/{id}/content` · `GET /notifications` · `GET /notifications/unread-count` · `POST /notifications/{id}/read` · `POST /notifications/read-all` · `GET /privacy/consents` · `GET|POST /privacy/requests` · `GET /analytics/organisations/{orgId}` · `GET /analytics/farmers/{farmerId}`

### Admin (platform administrators; MFA required in production)
`GET /admin/overview` · `GET /admin/organisations` · `POST /admin/organisations/{id}/review` · `POST /admin/attachments/{id}/review` · `GET /admin/users` · `POST /admin/users/{id}/status` · `GET /admin/incidents` · `GET|PUT /admin/policies` · `GET|PUT /admin/locations` · `GET /admin/outbox` · `POST /admin/outbox/{id}/requeue` · `GET /admin/webhooks` · `GET /admin/audit` · `GET /admin/exports` (CSV) · `GET /admin/data-requests` · `POST /admin/data-requests/{id}` · `GET /admin/analytics`

### System
`GET /health/live` · `GET /health/ready` (database) · `GET /config/public` · `GET /integrations/status` · `GET /dev/mailbox` (local/test only)

## Example: accepting an offer

```http
POST /api/v1/offers/0193…/accept
Cookie: hs_session=…; hs_csrf=…
X-CSRF-Token: <value of hs_csrf>
Idempotency-Key: 6f1d2c8e-…
Content-Type: application/json

{ "expectedVersionNo": 2 }
```

`200 { "bookingId": "…", "bookingReference": "HSB-001021", "status": "AWAITING_CONFIRMATIONS" }`. If the offer changed since it was read (e.g. a counter-offer arrived): `409 VERSION_CONFLICT`; if it expired: `409 OFFER_EXPIRED`; if a representative lacks `APPROVE_SALE`: `403 DELEGATION_SCOPE_MISSING`.
