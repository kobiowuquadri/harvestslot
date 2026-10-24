# Demo script

All organisations, people, farms, phone numbers and amounts in the demo data are **fictional** and flagged `isDemo`. Demo accounts use `*.demo.harvestslot.example` addresses; no email or SMS is ever delivered for them. Nothing here represents a real business or a real transaction.

## Prepare

```bash
pnpm install
pnpm infra:local            # or: pnpm infra:up  (Docker)
pnpm db:migrate
pnpm db:reset --confirm     # local/test databases only; refuses anything else
pnpm db:seed
pnpm dev                    # web http://localhost:3000 · API http://localhost:4000/api/v1 · docs /api/docs
```

The seed refuses to run unless `APP_ENV` is `local`, `demo` or `test`, and refuses if demo data already exists. Dates are relative to the moment you seed, so re-seed before a demo.

## Accounts

Password for every demo account: **`HarvestSlot-Demo-2026`**. In a demonstration environment the sign-in page and the account menu also offer one-click persona switching (marked “Demo”); the server refuses this unless `DEMO_MODE=true` and the environment is local/test/demo — never in production.

| Persona | Email | Lands on |
|---|---|---|
| Farmer (Adunni) | farmer.adunni@demo.harvestslot.example | Home |
| Processor manager | manager@ibadan-starch.demo.harvestslot.example | Dashboard |
| Receiving officer | receiving@ibadan-starch.demo.harvestslot.example | Receiving |
| Finance officer | finance@ibadan-starch.demo.harvestslot.example | Invoices |
| Transport dispatcher | dispatch@oke-ogun-haulage.demo.harvestslot.example | Find jobs |
| Driver (Tunde) | driver.tunde@demo.harvestslot.example | Jobs |
| Cooperative representative | rep@akinyele-coop.demo.harvestslot.example | Members |
| Administrator | admin@demo.harvestslot.example | Admin overview |
| Second processor owner (sign in by email) | owner@akinyele-flour.demo.harvestslot.example | Dashboard |

Seeded data (last seed run): 24 demo users, 15 farmer profiles (including represented members without accounts), 4 processors with facilities and lines, 2 transporters, 2 cooperatives, 6 vehicles, 24 harvest requests, 100 processing slots, 15 bookings across all seven states, 14 invoices (including partial payment), 2 disputes, notifications and audit history.

## The 13-step demonstration (live, ≈ 15 minutes)

Use two browser windows (or one normal and one private window) so two people can be signed in at once. A phone-sized window for the farmer and driver shows the mobile layout.

1. **Farmer creates a 2,000 kg request.** Adunni → *New harvest request* → choose her farm → 2000 kg → harvest dates in the next week → *Publish to processors*. The wizard works offline too: switch the browser offline and *Keep on this phone*; it is sent later with *Send now* (and cannot be sent twice).
2. **Matching explains available processors.** On the request page, *Matching processors* shows each facility with score, distance labelled *straight-line*, indicative price, capacity fit, payment track record and “Why this match is ranked here”. The banner states these are recommendations and nothing is reserved.
3. **Processor offers and reserves capacity.** Processor manager → *Harvest inbox* → *Make an offer* → facility and slot (windows fill in from the slot) → price → *Send offer*. The offer holds slot capacity until it expires (*Capacity* shows it as “on hold”).
4. **Farmer accepts the exact terms.** Adunni → request → *Offers* → *Accept this offer*. She lands on the booking: terms version 1 with its fingerprint, her estimate (not an invoice), the HarvestSlot fee paid by the processor, and *Not ready — do not harvest yet*.
5. **Transport quote and assignment.** Dispatcher → *Find jobs* → *Send a quote* (vehicle, price). Processor manager → booking → *Accept quote*. Dispatcher → *Quotes* → choose driver Tunde → *Confirm vehicle and driver*.
6. **Readiness becomes true.** Adunni's booking now shows every check ticked and *You can harvest now*. Readiness is computed by the server; no screen can toggle it.
7. **A competing request cannot overbook.** Sign in as the second processor's owner (owner@akinyele-flour.demo.harvestslot.example) → *Capacity*: the seeded “tight” slot (2,500 kg with a 2,000 kg hold). From the *Harvest inbox*, offer 1,000 kg on that slot for another request → refused: *Only 500 kg of capacity is left in this slot*. (The concurrent version of this race is `tests/load/booking-race.mjs`.)
8. **Harvest, collection and delivery.** Adunni: *I have started harvesting* → *Ready for pickup*. Driver Tunde (phone layout): *Jobs* → the job → *I am on my way* → *I have arrived at the farm* → loaded quantity → *Save loading*. Adunni confirms *I handed over this cassava* (or shows Tunde a one-time code). Tunde → *I have left the farm* → *I have arrived at the facility*. Receiving officer → booking → *Confirm delivery received*.
9. **1,900 kg delivered, 1,800 accepted, 100 rejected with evidence.** Receiving officer → *Receiving* → the booking → gross 1900, tare 0 → *Save weighing* → upload a ticket photo → accepted 1800, rejected 100, reason, what happens to the rejected roots → *Submit decision for the farmer’s review*. (Scenario **C2** is already at this point if you want to skip ahead.)
10. **Farmer reviews.** Adunni → booking → *Receiving and quality* → accept, or *I disagree* to open a dispute. The review deadline escalates to an administrator; silence is never treated as acceptance.
11. **Produce invoice uses 1,800 kg.** *Payments* → the produce invoice: 1,800 kg × price. The freight and HarvestSlot fee invoices are separate and never charged to the farmer.
12. **Payment reported, then confirmed by the payee.** Finance officer → invoice → *I have paid this* (bank transfer, reference). It shows *Reported by payer*. Adunni → *Did you receive it?* → *Yes* → *Confirmed by recipient*; the invoice becomes Paid. Fee invoices can be paid online: in development the **payment simulator** page is clearly marked “SIMULATED PAYMENT — no money moves” and its result is labelled *Simulated*, never *Verified*.
13. **Operational metrics update without fabricated impact.** Processor → *Reports*, Administrator → *Analytics*: each figure has its definition, sources and exclusions, shows “not enough data” instead of a number when appropriate, and demo and live records are never mixed (choose *Demo records only* to see the seeded activity).

## Pre-seeded scenarios

| Code | Where to look | What it shows |
|---|---|---|
| H1 | Adunni → Payments | Completed; produce invoice partly paid; one payment awaiting her confirmation |
| H2 | Processor → Invoices | Fully paid; HarvestSlot fee paid through the **simulator** (labelled simulated) |
| H3 | Admin → Disputes | Completed after a dispute resolved by an administrator with an invoice adjustment |
| H4 | Processor → Bookings (Cancelled) | Cancelled by the processor before harvest, with reason |
| H5 | Processor → Bookings (Expired) | **Expired hold**: accepted, but transport was never confirmed before the confirmation deadline; nothing stays reserved |
| C1 | Receiving officer → Receiving | Delivered and weighed; quality decision pending |
| C2 | Receiving | 1,900 kg net, 1,800 accepted / 100 rejected; awaiting the farmer's review |
| C3 | Admin → Disputes | Disputed receiving decision awaiting response/review |
| C4 | Driver Tunde → Jobs | Harvest started, driver on the way |
| C5 | Adunni → Home | Confirmed and **ready to harvest** in three days |
| C6 | Processor → Bookings | **Cancellation and reassignment**: the transporter cancelled; booking not ready until a replacement quote is accepted and a driver confirmed (dispatchers see it as a *Replacement needed* job) |
| C7 | Dispatcher → Find jobs | Accepted booking with no transport yet |
| C8 | Dispatcher → Quotes | Processor accepted a quote; dispatcher must confirm a driver before the vehicle hold expires |
| C9 | Cooperative rep → Bookings | Acceptance prepared for a member who only allowed data entry; awaiting approval |
| C10 | Cooperative rep → Bookings | Confirmed by the representative acting for a member with full permissions; every record shows both names |
| — | Adunni → second request → Offers | Two competing offers to compare side by side |

## Other things worth showing

* **Acting for a member**: Cooperative rep → *Members* → a member → *Harvest requests*. A banner names the farmer, the cooperative and the permissions on every screen.
* **Permissions are the farmer's**: Adunni → *Cooperative permissions* shows what her cooperative may do; removing a permission takes effect immediately.
* **Admin**: *Verification* (documents reviewed by HarvestSlot, not a registry check), *Integrations* (what is working, simulated or awaiting credentials), *Messages & webhooks*, *Audit log*, *Exports* (CSV with formula-injection protection).
* **Development mailbox** (local only): every email/SMS, including verification links and codes, captured instead of sent.
