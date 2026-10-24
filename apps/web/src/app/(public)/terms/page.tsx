import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms of use' };

function Todo({ children }: { children: React.ReactNode }) {
  return <mark className="rounded bg-amber-100 px-1 text-amber-ink">[{children}]</mark>;
}

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed">
      <h1 className="text-3xl font-semibold text-forest">Terms of use</h1>
      <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-amber-ink">
        <strong>Template — requires legal review before production use.</strong> These terms describe how the platform actually works. Highlighted items must be completed by the operator and reviewed by a lawyer.
      </p>
      <h2 className="mt-8 text-lg font-semibold text-forest">1. What HarvestSlot is</h2>
      <p>HarvestSlot is a coordination platform operated by <Todo>operator legal name</Todo>. It records offers, agreements, logistics milestones, receiving decisions, invoices and payment confirmations between farmers, processors and transporters. HarvestSlot is not a party to the sale of cassava or to transport contracts, does not hold or transfer produce or freight money, and does not provide escrow, lending or insurance.</p>
      <h2 className="mt-6 text-lg font-semibold text-forest">2. Agreements between users</h2>
      <p>A sale is agreed when the farmer (or an authorised representative) and the processor confirm the same version of the booking terms; transport is agreed when the freight payer and transporter confirm it. Changes create a new version that each affected party must confirm; until then the previous version stays in force. Recommendations, matches and quotes are not commitments.</p>
      <h2 className="mt-6 text-lg font-semibold text-forest">3. Fees</h2>
      <p>Processors pay HarvestSlot the service fee shown in the booking terms when the booking was agreed. Farmers are not charged for selling their crop. <Todo>fee schedule publication, tax treatment, invoicing entity</Todo>.</p>
      <h2 className="mt-6 text-lg font-semibold text-forest">4. Payments</h2>
      <p>Payments between users are made directly between them. A payment recorded by a payer counts as received only when the recipient confirms it. Service fees may be paid online through Paystack; such payments are verified with Paystack before being counted.</p>
      <h2 className="mt-6 text-lg font-semibold text-forest">5. Quality, weights and disputes</h2>
      <p>Receiving facilities record weights and quality decisions with evidence. HarvestSlot does not certify weights, food safety or quality; photos are evidence, not certification. Disputes are handled in the dispute process; an administrator's resolution records the outcome and any invoice adjustment but does not itself move money.</p>
      <h2 className="mt-6 text-lg font-semibold text-forest">6. Accounts and conduct</h2>
      <p>Provide accurate information, keep your password private, and only act for others within the permissions they have given. HarvestSlot may suspend accounts or organisations for misuse, with a recorded reason. Organisation details are self-reported unless marked as reviewed; a review is not a guarantee.</p>
      <h2 className="mt-6 text-lg font-semibold text-forest">7. Liability, law and changes</h2>
      <p><Todo>limitation of liability, governing law (Federal Republic of Nigeria / Oyo State courts), dispute forum, notice of changes, termination</Todo>.</p>
      <p className="mt-6 text-muted">Version: 2026-10-draft.</p>
    </article>
  );
}
