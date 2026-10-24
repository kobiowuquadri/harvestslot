'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DELEGATION_SCOPE_LABELS, DelegationScopeE, OYO_LGAS, type DelegationScope } from '@harvestslot/contracts';
import { OrgGate } from '@/components/domain/org-gate';
import { PageHeader } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives';
import { ApiError, uploadFile } from '@/lib/api';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';

function Register({ coopId }: { coopId: string }) {
  const router = useRouter();
  const { config } = useSession();
  const lgas = config?.supportedLgas?.length ? config.supportedLgas : [...OYO_LGAS];
  const [displayName, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [lga, setLga] = useState('');
  const [community, setCommunity] = useState('');
  const [memberRef, setMemberRef] = useState('');
  const [language, setLanguage] = useState<'en' | 'yo'>('yo');
  const [scopes, setScopes] = useState<DelegationScope[]>(['ASSIST_DATA_ENTRY']);
  const [witness, setWitness] = useState('');
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [contactConsent, setContactConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const register = useAction({
    request: () => ({
      path: `/cooperatives/${coopId}/members`,
      body: {
        displayName,
        phone: phone || undefined,
        email: email || undefined,
        lga,
        community: community || undefined,
        memberRef: memberRef || undefined,
        preferredLanguage: language,
        consent: { scopes, witnessName: witness || undefined, evidenceAttachmentId: evidenceId ?? undefined, note: note || undefined, contactConsent },
      },
    }),
    invalidate: [['coop-members', coopId], ['me']],
    success: 'Member registered with the recorded consent',
    toastErrors: false,
    onSuccess: () => router.push('/coop/members'),
  });
  const err = register.error?.fieldErrors ?? {};
  return (
    <Card>
      <CardHeader>
        <CardTitle>Register a farmer without an account</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            register.mutate();
          }}
        >
          {register.error ? <Alert tone="danger">{register.error.message}</Alert> : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Farmer’s name" error={err.displayName} required>
              <Input value={displayName} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Member number (optional)">
              <Input value={memberRef} onChange={(e) => setMemberRef(e.target.value)} />
            </Field>
            <Field label="Farmer’s own phone (optional)" hint="Needed for them to claim the account later. Never enter someone else’s number." error={err.phone}>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Farmer’s email (optional)" error={err.email}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="LGA" error={err.lga} required>
              <Select value={lga} onChange={(e) => setLga(e.target.value)}>
                <option value="" disabled>
                  Choose…
                </option>
                {lgas.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Community">
              <Input value={community} onChange={(e) => setCommunity(e.target.value)} />
            </Field>
            <Field label="Preferred language">
              <Select value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'yo')}>
                <option value="yo">Yorùbá</option>
                <option value="en">English</option>
              </Select>
            </Field>
          </div>
          <fieldset className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <legend className="px-1 text-sm font-medium">Consent the farmer gave you</legend>
            {DelegationScopeE.values.map((s) => (
              <Checkbox key={s} label={DELEGATION_SCOPE_LABELS[s].label} description={DELEGATION_SCOPE_LABELS[s].description} checked={scopes.includes(s)} onChange={(e) => setScopes((p) => (e.target.checked ? [...p, s] : p.filter((x) => x !== s)))} />
            ))}
            {err['consent.scopes'] ? <p className="text-sm text-danger">{err['consent.scopes']}</p> : null}
            <Checkbox label="The farmer agrees to be contacted by HarvestSlot about their bookings" checked={contactConsent} onChange={(e) => setContactConsent(e.target.checked)} />
            <Field label="Witness name" error={err['consent.witnessName']}>
              <Input value={witness} onChange={(e) => setWitness(e.target.value)} />
            </Field>
            <label className="inline-flex w-fit cursor-pointer items-center rounded-lg border border-line-strong px-3 py-2 text-sm font-medium hover:bg-leaf-50">
              {uploading ? 'Uploading…' : evidenceId ? 'Signed form attached ✓' : 'Attach signed consent form'}
              <input
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setUploading(true);
                  try {
                    const a = await uploadFile<{ id: string }>(file, { purpose: 'CONSENT_FORM', organisationId: coopId });
                    setEvidenceId(a.id);
                  } catch (err2) {
                    toast.error(err2 instanceof ApiError ? err2.message : 'Upload failed');
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
            <Field label="Note">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </fieldset>
          <Checkbox label="I explained these permissions to the farmer and they agreed to them" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <Button type="submit" loading={register.isPending} disabled={!confirmed || !displayName || !lga || (!witness && !evidenceId)}>
            Register member
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function LinkExisting({ coopId }: { coopId: string }) {
  const [identifier, setIdentifier] = useState('');
  const [memberRef, setMemberRef] = useState('');
  const link = useAction({ request: () => ({ path: `/cooperatives/${coopId}/members/link`, body: { farmerEmailOrPhone: identifier, memberRef: memberRef || undefined } }), invalidate: [['coop-members', coopId]], success: 'Linked. Ask the farmer to give you permissions in their app.', toastErrors: false });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Link a farmer who already has an account</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {link.error ? <Alert tone="danger">{link.error.message}</Alert> : null}
        <p className="text-sm text-muted">They then choose in their own app what you may do for them.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
          <Field label="Their email or phone">
            <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
          </Field>
          <Field label="Member number (optional)">
            <Input value={memberRef} onChange={(e) => setMemberRef(e.target.value)} />
          </Field>
          <Button onClick={() => link.mutate()} loading={link.isPending} disabled={identifier.length < 3}>
            Link member
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function NewMemberPage() {
  return (
    <OrgGate kind="cooperative">
      {(w) => (
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <PageHeader title="Add a member" />
          <LinkExisting coopId={w.orgId} />
          <Register coopId={w.orgId} />
        </div>
      )}
    </OrgGate>
  );
}
