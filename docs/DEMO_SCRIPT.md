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
| Farmer (Adunni, Akinyele) | farmer.adunni@demo.harvestslot.example | Home |
| Buyer — cassava processor manager (Oluyole Cassava Processing) | manager@ibadan-starch.demo.harvestslot.example | Home (Buying slots · Requests · Bookings) |
| Buyer — tomato processor (Sade, Egbeda Tomato Processing) | manager@egbeda-tomato.demo.harvestslot.example | Home (Buying slots · Requests · Bookings) |
| Administrator | admin@demo.harvestslot.example | Admin overview |

Also available by email, but not on the persona list: the buyer's receiving officer and finance officer (`receiving@…` and `finance@ibadan-starch.demo.harvestslot.example`), the other farmers (`farmer.<first name>@demo.harvestslot.example`), the Akinyele Fresh Flour Mill owner (`owner@akinyele-flour.demo.harvestslot.example`) and the cooperative representative (`rep@akinyele-coop.demo.harvestslot.example`). Transporter and driver accounts created before the simplification still sign in and keep their records, but they are not part of the demo journey.

## The demonstration: one complete sale (live, about 10 minutes)

The farmer's question is: *“Who will buy my cassava, how much will they take, and when and where should it be ready?”* Use two browser windows (or one normal and one private window). A phone-sized window for the farmer shows the mobile layout.

1. **Two ways to start.** Open */register*: “What would you like to do?” — *Sell cassava* or *Buy cassava*. Only account details are asked; farm or facility details come when first needed. (For the demo itself, use the accounts above.)
2. **Add my harvest.** Adunni → *Add my harvest* → where (her farm, or a local government area and village picked from suggestions) → roughly how much (type *2* with *Tonnes* and it shows **2,000 kg** at once) → when it will be ready → check the summary → *Find buyers*. It works offline too: *Keep on this phone*, then *Send now* when back online.
3. **Find a buyer.** *Buyers that fit* lists buyers whose location, dates and free space fit, each explained in one sentence such as “Can receive your full 2,000 kg on Thu 26 Nov”. *Send request* on a card. The page then says *Waiting for the buyer’s offer*. If nobody fits, the harvest stays saved and the page suggests changing the dates.
4. **The buyer reviews the request.** Processor manager → *Requests* → the card says *Review harvest request* → *Review and send offer*. Facility, date and quantity are prefilled. Enter the price (₦100/kg shows an estimated total of ₦200,000) and answer **“How will the cassava get there?”**: *We’ll collect from the farm* or *The farmer will deliver to our facility* (with any delivery cost the farmer pays). Not decided yet? *Save as draft* — drafts are private and reserve nothing. *Send offer* holds the capacity until the farmer answers.
5. **The farmer reviews the offer.** Adunni → *Review the offer*: buyer, quantity, price per kg, **estimated total**, date and time, handover place, who brings the cassava and any cost to her. *Accept offer* or *Decline* (her harvest stays available to other buyers).
6. **The confirmed plan.** On acceptance she lands on the plan: *“Oluyole Cassava Processing Ltd (Demo) will collect 2,000 kg at … on … for ₦100 per kg.”*, with the status *Ready to harvest* and what to do next. No driver, vehicle or freight quote is involved: the plan is ready as soon as both sides have agreed complete terms, the capacity is reserved and the handover details are complete. *My plans* shows it the next time she signs in.
7. **Record the weight.** Processor manager (or receiving officer) → the booking → *Record the weight* → for example 1,900 kg received and accepted. Both sides now see the **final amount (₦190,000)**, with “100 kg less than agreed” flagged. When less is accepted than was received, a reason is required and the farmer is asked to *agree or report a problem*.
8. **Payment.** Processor manager (or finance officer) → *Record payment* → amount and reference. It shows as **Payment reported** — not paid — until Adunni answers *Yes, I received ₦190,000* (or *It hasn’t arrived*). Then the plan says **Paid — sale complete**.
9. **When things do not go to plan.** A change of price, quantity, date or handover needs the other side to agree again before it applies. An offer that is not answered in time expires, its capacity is released, and the farmer is pointed to other buyers. A buyer cannot offer more than its buying slot has left: try the seeded 2,500 kg “tight” slot at Akinyele Fresh Flour Mill, which already holds 2,000 kg.
10. **Reports without invented impact.** Processor → *Reports*, Administrator → *Analytics*: each figure has its definition and exclusions, shows “not enough data” where appropriate, and never mixes demo with live records.

## Pre-seeded scenarios

| Code | Where to look | What it shows |
|---|---|---|
| H1 | Adunni → Payments | Collected 9 days ago; 1,950 kg accepted; one transfer confirmed, a second waiting for her confirmation |
| H2 | Bisi → My plans | Delivered by the farmer; 20 kg not accepted, which she agreed; fully paid |
| H3 | Admin → Disputes | Completed after a problem report resolved by an administrator |
| H4 | Grace → My plans | Cancelled by the buyer before harvest, with a reason |
| H5 | Kayode → Harvests | An offer he did not answer in time expired; its capacity was released |
| C1 | Ngozi, or the buyer → Bookings | The buyer collects today; next step: record the weight |
| C2 | Tolu → My plans | 1,900 kg received, 1,800 accepted (100 kg not accepted): waiting for Tolu to check |
| C3 | Halima, or Admin → Disputes | Problem with the weight reported; waiting for the buyer and an administrator |
| C4 | Emeka → My plans | Harvest started this morning; the buyer collects within the agreed window |
| C5 | Adunni → Home | Confirmed plan, **ready to harvest**: the buyer collects in three days |
| C6 | Bisi → My plans | She delivers to the flour mill in four days; her delivery cost was shown before she accepted |
| C7 | Grace → Harvests | Request sent to Iseyin Cassava Hub; waiting for the buyer's offer |
| C8 | Buyer → Requests | Draft offer for Halima: collection or delivery not decided yet, nothing reserved |
| C9 | Cooperative rep → Bookings | Acceptance prepared for a member who only allowed data entry; awaiting approval |
| C10 | Cooperative rep → Bookings | Confirmed by the representative acting for a member with full permissions |
| C11 | Buyer → Requests | Kayode asked for an offer for 1,700 kg: *Review harvest request* |
| C12 | Kehinde → Harvests | The Iseyin hub said it cannot buy this time; the request is open for other buyers |
| T1 | Emeka → Payments, or Sade → Bookings | Tomatoes collected 5 days ago; 40 kg of split fruit not accepted, which he agreed; paid |
| T2 | Tolu, or Sade → Bookings | Tomatoes confirmed: Tolu delivers 600 kg to the paste plant in two days |
| T3 | Sade → Requests | Ngozi asked for an offer for 700 kg of tomatoes: *Review harvest request* |
| T4 | Adunni → her 900 kg tomato harvest | An offer from the tomato paste plant waiting for her answer; her tomato matches show only tomato buyers |
| — | Adunni → her 3,000 kg harvest | Two offers to compare: Oluyole collects at ₦250/kg; Iseyin pays ₦235/kg but she delivers (about ₦20,000 delivery cost) |

## Showing the second crop (2 minutes)

1. As Adunni, open **Harvests**: each card says *Cassava* or *Tomatoes*. Open the 900 kg tomato harvest: the only buyer suggested is the Egbeda tomato paste plant, never a garri or flour plant.
2. Choose **Add my harvest**: the first question is *What are you selling?* (Cassava or Tomatoes).
3. Switch to **Buyer — tomatoes (Sade)**: **Requests** shows only tomato harvests; **Buying slots → Publish a buying slot** starts with *What are you buying?*
4. Pitch line: *storage makes cassava last longer; HarvestSlot makes sure the harvest never has to wait — and the same engine already runs a second crop.*

## Other things worth showing

* **Acting for a member** (existing cooperatives): Cooperative rep → *Members* → a member. A banner names the farmer, the cooperative and the permissions on every screen; a sale is approved for a member only if they allowed it.
* **Admin**: *Verification* (documents reviewed by HarvestSlot, not a registry check), *Integrations* (what is working, simulated or awaiting credentials), *Messages & webhooks*, *Audit log*, *Exports* (CSV with formula-injection protection).
* **Payment simulator** (development only): HarvestSlot fee invoices can be paid on a page marked “SIMULATED PAYMENT — no money moves”, and the result is labelled *Simulated*, never *Verified*. Produce payments never go through HarvestSlot.
* **Development mailbox** (local only): every email and SMS, including verification links and codes, is captured instead of sent.
