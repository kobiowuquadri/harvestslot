---
marp: true
title: HarvestSlot — Harvest with a confirmed plan
paginate: true
---

# HarvestSlot
### Harvest with a confirmed plan

A farmer in Oyo State with a crop that spoils fast asks one question:
**“Who will buy my harvest, how much will they take, and when and where should it be ready?”**

HarvestSlot answers it before anything is harvested. Starting with cassava and tomatoes.

The editable deck is `docs/HarvestSlot-Pitch-Deck-v3.pptx` (13 slides, with charts and photo credits).

---

## The problem

- The clock starts at harvest: cassava roots start spoiling within about 48 hours; ripe tomatoes bruise and soften within days.
- Farmers often harvest first and look for a buyer after, with no agreed price, quantity, date or place.
- Processors can't see which harvests are coming, so their capacity sits idle or gets overbooked.
- When the farm and the factory don't know the plan, they lose produce, money and trust.

---

## The solution: one simple sale

1. **Add my harvest**: where it is, roughly how much (kg or tonnes), and when it will be ready.
2. **Find a buyer**: only buyers whose location, dates and free space fit, each explained in one sentence.
3. **Review the offer**: price per kg, **estimated total**, date, place, who brings the cassava, any cost to the farmer.
4. **Accept**: capacity is reserved and the plan reads
   *“Oluyole Cassava will collect 2,000 kg at your farm on Thu 26 Nov for ₦100 per kg.”*
5. **Finish the sale**: the buyer records the weight accepted and the payment, and the farmer confirms the money arrived.

---

## One engine for fast-spoiling crops

- **Cassava** (live): garri, flour, starch, fufu and chips processors; delivered within 48 h by default.
- **Tomatoes** (live): tomato paste processors; delivered within 24 h by default.
- The farmer picks the crop when adding a harvest; each buyer intake line buys one crop; matching, requests and offers only pair the same crop.
- Next candidates, not built: oil palm fruit, fresh peppers.

---

## Where we fit

| | Today | Storage-led platforms (e.g. YucaChain) | HarvestSlot |
|---|---|---|---|
| Answer to spoilage | Harvest first, then find a buyer | Keep the crop fresh for longer (solar storage units) | Agree the buyer, date and handover before harvest |
| What it is | Informal traders | Integrated cassava company: app, storage, hubs; mills planned | Neutral software: no hardware, no stock |
| Crops | Any | Cassava | Cassava and tomatoes |

Storage makes cassava last longer; HarvestSlot makes sure the harvest never has to wait. A storage hub or mill could itself publish buying slots on HarvestSlot. (Competitor details from yucachain.com as published on 21 Nov 2026; no partnership implied.)

---

## Two ways to start

| Sell cassava (farmer) | Buy cassava (processor) |
|---|---|
| Phone-first app that also works offline | **Buying slots**: “how much, where, which dates” |
| One main action: *Add my harvest* | **Requests**: review, then send a prefilled offer |
| “What happens next” on every screen | **Bookings**: record the weight and the payment |

There is no driver registration, freight quote or dispatch step. Each offer settles **“How will the cassava get there?”**: the buyer collects from the farm, or the farmer delivers to the buyer.

---

## Trust built into the engine

- **No double booking**: capacity is held with database row locks, which concurrency tests confirm.
- **Ready to harvest** only when both sides have agreed the current terms, capacity is reserved and the handover is complete.
- **Changes need re-agreement**: price, quantity, date or handover changes don't take effect until the other side agrees.
- **Payment reported ≠ payment received**: a payment counts as received only once the farmer confirms it.
- **Problems can be reported**: weight disputes go to an audited resolution, and the accepted part is still invoiced.

---

## Worked example (tested end to end)

- Farmer in Akinyele: **2,000 kg** ready.
- The processor offers **₦100/kg**, full quantity, and will collect from the farm.
- The farmer sees **₦200,000 estimated** before accepting.
- The buyer records **1,900 kg accepted**, so the **final amount is ₦190,000**, with “100 kg less” flagged.
- The buyer records the payment, and the farmer confirms receipt: **Paid — sale complete**.

No driver, vehicle, freight quote or cooperative is needed.

---

## Built for real use

- **Stack**: Next.js PWA · NestJS API · PostgreSQL (Prisma) · background worker · OpenAPI.
- **Security**: CSRF protection, rate limits, admin MFA, audit log, private uploads, and roles enforced by the server.
- **Accessibility**: WCAG 2.1 AA automated checks, usable at 360 px phone width, readable language.
- **Honest integrations**: email, SMS and payments are marked *simulated* or *awaiting credentials* until they are connected for real.
- **Tests**: unit tests, integration tests on real PostgreSQL, Playwright browser tests and a race/load test.

---

## Business model

- The **buyer** pays a small platform fee per completed sale. The farmer never pays it.
- HarvestSlot never holds produce money: buyers pay farmers directly, and the farmer confirms receipt.
- Next: cooperatives acting for members, integration with transport partners, and road-distance routing.

*All figures in the demo are fictional. No pilots, partnerships or impact numbers are claimed.*

---

## Ask

- Pilot partners: processors and farmer groups in Oyo State.
- Feedback on the farmer journey from extension workers.
- Support connecting real payment and SMS providers.

**HarvestSlot: harvest only when the sale is planned.**
