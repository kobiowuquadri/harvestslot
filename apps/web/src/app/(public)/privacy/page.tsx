import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy notice' };

function Todo({ children }: { children: React.ReactNode }) {
  return <mark className="rounded bg-amber-100 px-1 text-amber-ink">[{children}]</mark>;
}

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed">
      <h1 className="text-3xl font-semibold text-ink">Privacy notice</h1>
      <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-amber-ink">
        <strong>Template — requires legal review before production use.</strong> This notice describes how this software actually handles personal data. Highlighted items must be completed by the operator and reviewed by a qualified lawyer against the Nigeria Data Protection Act 2023 and applicable regulations. It is not a certification of legal compliance.
      </p>
      <h2 className="mt-8 text-lg font-semibold text-ink">Who is responsible</h2>
      <p>The data controller is <Todo>operator legal name, registration number, address, data protection officer contact</Todo>.</p>
      <h2 className="mt-6 text-lg font-semibold text-ink">What we collect and why</h2>
      <ul className="list-disc pl-5">
        <li><strong>Account data</strong> (name, email and/or phone, password hash, language): to run your account and keep it secure.</li>
        <li><strong>Farm and harvest data</strong> (farm locations, expected quantities, dates): to arrange buyers, capacity and transport. Exact farm coordinates are shown only to the processor and transporter on your confirmed booking; others see an approximate area (about 1 km).</li>
        <li><strong>Booking records</strong> (agreed terms, confirmations, pickup and delivery records, weights, quality decisions, invoices, payment reports and confirmations, disputes, messages): to perform the agreements between farmers, processors and transporters and to keep an accurate record.</li>
        <li><strong>Evidence files</strong> (photos, weighbridge tickets, payment evidence, signed consent forms): stored privately; photos are re-encoded and their embedded metadata (including GPS) is removed from the stored copy.</li>
        <li><strong>Location from your device</strong>: only when you choose to pin a location or a driver records a milestone. We record whether a location came from the device or was entered by hand, and its accuracy.</li>
        <li><strong>Security logs</strong> (sign-ins, sessions, IP address, audit events): to protect accounts and investigate abuse.</li>
      </ul>
      <h2 className="mt-6 text-lg font-semibold text-ink">Cooperatives acting for farmers</h2>
      <p>A cooperative may register you and act for you only within the permissions you give, recorded with a witness or signed form, or granted by you in the app. Every action records both the representative and you. You can review and revoke these permissions; revoking stops future actions but does not undo agreements already made.</p>
      <h2 className="mt-6 text-lg font-semibold text-ink">Messages we send</h2>
      <p>In-app notifications are always available. Email and SMS are sent only if you have consented and verified the contact, and you can switch them off in Settings. Demonstration accounts never receive external messages.</p>
      <h2 className="mt-6 text-lg font-semibold text-ink">Who we share data with</h2>
      <ul className="list-disc pl-5">
        <li>The other parties to your booking, limited to what they need.</li>
        <li>Service providers that host and operate the service: <Todo>hosting provider, email provider, SMS provider (e.g. Termii), payment provider (Paystack, for service fees only), object storage provider</Todo>.</li>
        <li>Authorities where the law requires it.</li>
      </ul>
      <p>We do not sell personal data. HarvestSlot does not use automated credit scoring.</p>
      <h2 className="mt-6 text-lg font-semibold text-ink">How long we keep data</h2>
      <p>
        Account data is kept while your account is active. Agreed terms, confirmations, invoices, payment records, disputes and audit events are kept for <Todo>retention period, e.g. 6 years, per accounting and limitation rules</Todo> because they record agreements with other parties. If you ask us to delete your account, we remove or anonymise personal data that is not needed for those records and keep the transaction history in pseudonymised form.
      </p>
      <h2 className="mt-6 text-lg font-semibold text-ink">Your rights</h2>
      <p>You can request a copy of your data (generated automatically in Settings › Privacy), correct your details, withdraw consent for messages or location, and ask for deletion. Deletion requests are reviewed by an administrator because of the retention duties above. You may complain to <Todo>Nigeria Data Protection Commission contact details</Todo>.</p>
      <h2 className="mt-6 text-lg font-semibold text-ink">Security</h2>
      <p>Passwords are hashed with Argon2id; sessions use secure, HttpOnly cookies and can be revoked; files are stored privately and served through short-lived authorised links; administrator actions require a reason and are audited.</p>
      <p className="mt-6 text-muted">Version: 2026-10-draft. Last updated: <Todo>date of publication</Todo>.</p>
    </article>
  );
}
