import {
  formatKg,
  formatNaira,
  gramsToKgString,
  koboToNumber,
  produceAmountKobo,
  toGrams,
  type BookingParty,
  type BookingStatus,
  type BookingTermsContent,
  type NextStep,
  type ReceivingStatus,
  type SalePlan,
} from '@harvestslot/contracts';

/** Facts about one booking needed to describe the plan and the next step. Pure input, no I/O. */
export interface PlanFacts {
  status: BookingStatus;
  ready: boolean;
  now: Date;
  content: BookingTermsContent;
  /** Parties that still have to confirm the current terms version. */
  pendingParties: BookingParty[];
  /** First failing readiness check, if any. */
  blocker: { responsible: BookingParty | null; explanation: string } | null;
  receiving: {
    status: ReceivingStatus;
    netKg: string;
    acceptedKg: string | null;
    reasons: string[];
    note: string | null;
    farmerDecision: 'ACCEPTED' | 'DISPUTED' | null;
  } | null;
  invoice: {
    id: string;
    totalKobo: number;
    confirmedPaidKobo: number;
    reportedPendingKobo: number;
    outstandingKobo: number;
    dueAt: Date;
    overdue: boolean;
    pendingPaymentId: string | null;
  } | null;
  openDispute: boolean;
  viewer: { farmer: boolean; processor: boolean };
}

const DAY = new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });
const TIME = new Intl.DateTimeFormat('en-NG', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Lagos' });

/** "₦100" for whole naira, otherwise "₦100.50". */
export function nairaShort(kobo: number): string {
  const full = formatNaira(kobo);
  return full.endsWith('.00') ? full.slice(0, -3) : full;
}

export function dayLabel(iso: string | Date): string {
  return DAY.format(typeof iso === 'string' ? new Date(iso) : iso).replace(',', '');
}

export function timeRange(start: string | Date, end: string | Date): string {
  return `${TIME.format(new Date(start))}–${TIME.format(new Date(end))}`;
}

function placeOf(c: BookingTermsContent): string {
  if (c.handover) return c.handover.place.label;
  return c.facility.name;
}

/** The sentence a farmer could read aloud, e.g. "Oluyole will collect 2,000 kg at Adunni's farm on Thu 20 Nov for ₦100 per kg." */
export function planSentence(c: BookingTermsContent): string {
  const kg = formatKg(c.quantityKg);
  const price = `${nairaShort(c.priceKoboPerKg)} per kg`;
  if (c.handover?.arrangement === 'COLLECT_FROM_FARM') {
    return `${c.processor.name} will collect ${kg} at ${c.handover.place.label} on ${dayLabel(c.handover.window.start)} for ${price}.`;
  }
  if (c.handover?.arrangement === 'FARMER_DELIVERS') {
    return `${c.farmer.displayName} will deliver ${kg} to ${c.processor.name} at ${c.handover.place.label} on ${dayLabel(c.handover.window.start)} for ${price}.`;
  }
  const transport = c.transport ? ` ${c.transport.transporterName} carries it.` : ' Transport is not arranged yet.';
  return `${c.processor.name} will buy ${kg} at ${c.facility.name} on ${dayLabel(c.deliveryWindow.start)} for ${price}.${transport}`;
}

function step(stage: string, actor: NextStep['actor'], v: PlanFacts['viewer'], forFarmer: string | null, forProcessor: string | null, waitFarmer: string | null, waitProcessor: string | null): NextStep {
  return {
    stage,
    actor,
    forViewer: v.farmer ? forFarmer : v.processor ? forProcessor : null,
    waitingFor: v.farmer ? (forFarmer ? null : waitFarmer) : v.processor ? (forProcessor ? null : waitProcessor) : (waitFarmer ?? waitProcessor),
  };
}

export function describePlan(f: PlanFacts): { plan: SalePlan; nextStep: NextStep } {
  const c = f.content;
  const window = c.handover?.window ?? c.pickupWindow;
  const buyer = c.processor.name;
  const farmer = c.farmer.displayName;
  const kg = formatKg(c.quantityKg);
  const when = `${dayLabel(window.start)}, ${timeRange(window.start, window.end)}`;
  const place = placeOf(c);

  let weighed: SalePlan['weighed'] = null;
  if (f.receiving?.acceptedKg) {
    const acceptedG = toGrams(f.receiving.acceptedKg);
    const decision =
      f.receiving.farmerDecision === 'DISPUTED' || f.receiving.status === 'DISPUTED'
        ? 'PROBLEM_REPORTED'
        : f.receiving.farmerDecision === 'ACCEPTED'
          ? 'AGREED'
          : ['AWAITING_FARMER_REVIEW', 'REVIEW_OVERDUE'].includes(f.receiving.status)
            ? 'PENDING'
            : 'NOT_NEEDED';
    weighed = {
      receivedKg: gramsToKgString(toGrams(f.receiving.netKg)),
      acceptedKg: gramsToKgString(acceptedG),
      shortfallKg: gramsToKgString(toGrams(c.quantityKg) - acceptedG),
      reasons: f.receiving.reasons,
      note: f.receiving.note,
      finalAmountKobo: koboToNumber(produceAmountKobo(acceptedG, BigInt(c.priceKoboPerKg))),
      farmerDecision: decision,
    };
  }

  const plan: SalePlan = {
    sentence: planSentence(c),
    arrangement: c.handover?.arrangement ?? null,
    placeLabel: place,
    window,
    agreedKg: c.quantityKg,
    priceKoboPerKg: c.priceKoboPerKg,
    estimatedAmountKobo: c.estimatedProduceAmountKobo,
    farmerDeliveryCostKobo: c.handover?.farmerDeliveryCostKobo ?? null,
    weighed,
    payment: f.invoice
      ? {
          invoiceId: f.invoice.id,
          totalKobo: f.invoice.totalKobo,
          confirmedPaidKobo: f.invoice.confirmedPaidKobo,
          reportedPendingKobo: f.invoice.reportedPendingKobo,
          outstandingKobo: f.invoice.outstandingKobo,
          dueAt: f.invoice.dueAt.toISOString(),
          overdue: f.invoice.overdue,
          pendingPaymentId: f.invoice.pendingPaymentId,
        }
      : null,
  };

  const v = f.viewer;
  let nextStep: NextStep;
  if (f.status === 'CANCELLED') nextStep = step('Cancelled', 'NONE', v, null, null, 'This booking was cancelled.', 'This booking was cancelled.');
  else if (f.status === 'EXPIRED') nextStep = step('Expired — not confirmed in time', 'NONE', v, null, null, 'The capacity hold lapsed before everyone confirmed.', 'The capacity hold lapsed before everyone confirmed.');
  else if (f.status === 'DRAFT') {
    nextStep = step('Waiting for the farmer’s approval', 'FARMER', v, 'Approve or discard the acceptance your cooperative prepared', null, null, `Waiting for ${farmer} to approve`);
  } else if (f.status === 'AWAITING_CONFIRMATIONS') {
    if (f.pendingParties.includes('FARMER')) nextStep = step('Waiting for the farmer to confirm', 'FARMER', v, 'Review and confirm the terms', null, null, `Waiting for ${farmer} to confirm`);
    else if (f.pendingParties.includes('PROCESSOR')) nextStep = step('Waiting for the buyer to confirm', 'PROCESSOR', v, null, 'Review and confirm the terms', `Waiting for ${buyer} to confirm`, null);
    else if (!c.handover && !c.transport) {
      nextStep = step('Agree how the cassava gets there', 'PROCESSOR', v, null, 'Propose how the cassava will get to you (collect or farmer delivers)', `Waiting for ${buyer} to say how the cassava gets there`, null);
    } else nextStep = step('Waiting for transport', 'PROCESSOR', v, null, 'Confirm transport for this booking', 'Waiting for transport to be confirmed', null);
  } else if (weighed && plan.payment) {
    const p = plan.payment;
    const payStage: NextStep =
      p.outstandingKobo <= 0 && p.reportedPendingKobo <= 0
        ? step('Paid — sale complete', 'NONE', v, null, null, 'Payment received. Nothing else to do.', 'The farmer confirmed receipt. Nothing else to do.')
        : p.reportedPendingKobo > 0
          ? step('Payment reported', 'FARMER', v, `Confirm you received ${nairaShort(p.reportedPendingKobo)}`, null, null, `Waiting for ${farmer} to confirm receipt of ${nairaShort(p.reportedPendingKobo)}`)
          : step(
              p.overdue ? 'Payment overdue' : 'Waiting for payment',
              'PROCESSOR',
              v,
              null,
              `Record the payment of ${nairaShort(p.outstandingKobo)} to ${farmer}`,
              `Waiting for ${buyer} to pay ${nairaShort(p.outstandingKobo)}`,
              null,
            );
    if (weighed.farmerDecision === 'PENDING') {
      const short = toGrams(weighed.shortfallKg);
      const diff = short > 0n ? ` (${formatKg(short)} less than agreed)` : short < 0n ? ` (${formatKg(-short)} more than agreed)` : '';
      nextStep = {
        stage: 'Weight recorded — farmer to check',
        actor: 'FARMER',
        forViewer: v.farmer ? `Check the weight: ${formatKg(weighed.acceptedKg)} accepted${diff}. Agree, or report a problem.` : v.processor ? payStage.forViewer : null,
        waitingFor: v.farmer ? null : v.processor ? (payStage.forViewer ? null : `Waiting for ${farmer} to check the weight`) : `Waiting for ${farmer} to check the weight`,
      };
    } else if (weighed.farmerDecision === 'PROBLEM_REPORTED' && f.openDispute) {
      nextStep = {
        stage: 'Problem reported',
        actor: 'PROCESSOR',
        forViewer: v.processor ? 'Respond to the problem the farmer reported' : null,
        waitingFor: v.farmer ? `Waiting for ${buyer} to respond. The accepted part can still be paid.` : v.processor ? null : 'Waiting for the buyer to respond',
      };
      if (v.processor && payStage.actor === 'PROCESSOR') nextStep.forViewer = `${nextStep.forViewer}; ${payStage.forViewer!.charAt(0).toLowerCase()}${payStage.forViewer!.slice(1)} for the accepted weight`;
    } else nextStep = payStage;
  } else if (f.status === 'COMPLETED') {
    nextStep = step('Complete', 'NONE', v, null, null, 'This sale is complete.', 'This sale is complete.');
  } else if (f.ready || f.status === 'ACTIVE' || (c.handover && f.status === 'CONFIRMED' && f.now >= new Date(window.start))) {
    // Once the handover time arrives, the next recorded step is the buyer's weight — even after the window closes.
    const started = f.now >= new Date(window.start);
    const collect = c.handover?.arrangement !== 'FARMER_DELIVERS';
    nextStep = step(
      f.status === 'ACTIVE' ? 'Harvest in progress' : 'Ready to harvest',
      started || f.status === 'ACTIVE' ? 'PROCESSOR' : 'FARMER',
      v,
      collect ? `Have ${kg} ready at ${place} on ${when}` : `Deliver ${kg} to ${place} on ${when}`,
      collect ? `Collect ${kg} at ${place} on ${when}, then record the weight you accept` : `Receive ${kg} on ${when}, then record the weight you accept`,
      `${buyer} records the weight after ${collect ? 'collection' : 'delivery'}`,
      `${farmer} prepares the harvest`,
    );
  } else {
    const who = f.blocker?.responsible;
    const why = f.blocker?.explanation ?? 'Something in the plan needs attention.';
    nextStep = {
      stage: 'Not ready yet',
      actor: who === 'FARMER' ? 'FARMER' : who === 'PROCESSOR' ? 'PROCESSOR' : who === 'ADMIN' ? 'ADMIN' : 'NONE',
      forViewer: (v.farmer && who === 'FARMER') || (v.processor && who === 'PROCESSOR') ? why : null,
      waitingFor: (v.farmer && who === 'FARMER') || (v.processor && who === 'PROCESSOR') ? null : why,
    };
  }
  return { plan, nextStep };
}
