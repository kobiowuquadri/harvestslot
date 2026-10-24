import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Who HarvestSlot is for' };

const roles = [
  {
    id: 'farmers',
    title: 'Farmers',
    points: [
      'Register with a phone number or email. You can also be registered by your cooperative and claim your own account later.',
      'Add your farm pickup points. Exact locations are only shown to the processor and transporter on a confirmed booking.',
      'Post expected harvests, compare offers, accept exact terms, and see when you are ready to harvest.',
      'Confirm pickup handovers, review weighing and quality decisions, and confirm payments when the money arrives.',
      'Decide what your cooperative may do for you, and revoke it at any time.',
    ],
  },
  {
    id: 'processors',
    title: 'Processors',
    points: [
      'Register your organisation and submit documents for review by HarvestSlot administrators.',
      'Model each facility and processing line; publish slots with both machine capacity and the quantity you are willing to buy.',
      'Make offers from your harvest inbox; each offer holds capacity until it expires. Capacity can never be reduced below what is committed.',
      'Assign staff roles: managers make commercial decisions, receiving officers record weights and quality, finance officers record payments.',
      'Pay farmers and transporters directly and record each payment for the recipient to confirm.',
    ],
  },
  {
    id: 'transporters',
    title: 'Transporters and drivers',
    points: [
      'Register vehicles with their capacity, add drivers, publish your service areas and when each vehicle is available.',
      'Quote on jobs with a specific vehicle. A vehicle and a driver can only hold one overlapping job, including turnaround time.',
      'Drivers see only their assigned jobs, record arrival, loading and delivery, and use one-time handover codes from the farmer and the facility.',
    ],
  },
  {
    id: 'cooperatives',
    title: 'Cooperatives',
    points: [
      'Register members who do not yet have phones or accounts, with their recorded consent (a witness or a signed form).',
      'Act for members only within the permissions they give: helping with data entry is separate from approving a sale.',
      'Every action shows who acted and for whom. Members can claim their own account and review or revoke permissions.',
    ],
  },
];

export default function RolesPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-forest">Who HarvestSlot is for</h1>
      <nav aria-label="Roles" className="mt-4 flex flex-wrap gap-2 text-sm">
        {roles.map((r) => (
          <a key={r.id} href={`#${r.id}`} className="rounded-full border border-line bg-surface px-3 py-1.5 hover:border-leaf">
            {r.title}
          </a>
        ))}
      </nav>
      <div className="mt-8 flex flex-col gap-6">
        {roles.map((r) => (
          <section key={r.id} id={r.id} className="scroll-mt-20 rounded-xl border border-line bg-surface p-6">
            <h2 className="text-xl font-semibold text-forest">{r.title}</h2>
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-muted">
              {r.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-8 text-sm">
        <Link href="/register" className="font-medium text-leaf underline">Create an account</Link> — choose your role during registration.
      </p>
    </div>
  );
}
