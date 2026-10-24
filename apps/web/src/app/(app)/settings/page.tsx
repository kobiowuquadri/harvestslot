'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Badge, Card, CardContent } from '@/components/ui/primitives';
import { ApiError, post } from '@/lib/api';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';

function PhoneVerification() {
  const { me, config } = useSession();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const verify = useAction({ request: () => ({ path: '/auth/phone/verify', body: { code } }), invalidate: [['me']], success: 'Phone verified' });
  if (!me?.user.phone || me.user.phoneVerified) return null;
  if (!config?.smsAvailable) return <p className="text-xs text-muted">SMS is not configured here, so the phone number cannot be verified yet.</p>;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      {!sent ? (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await post('/auth/phone/send-code');
              setSent(true);
            } catch (e) {
              toast.error(e instanceof ApiError ? e.message : 'Could not send the code');
            }
          }}
        >
          Send verification code
        </Button>
      ) : (
        <div className="flex gap-2">
          <Input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} aria-label="6-digit code" />
          <Button onClick={() => verify.mutate()} loading={verify.isPending}>
            Verify
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AccountSettings() {
  const { me } = useSession();
  const [displayName, setDisplayName] = useState(me?.user.displayName ?? '');
  const [locale, setLocale] = useState(me?.user.locale ?? 'en');
  const [email, setEmail] = useState(me?.user.email ?? '');
  const [phone, setPhone] = useState(me?.user.phone ?? '');
  const save = useAction({
    request: () => ({
      path: '/auth/account',
      method: 'PATCH',
      idempotent: false,
      body: {
        displayName,
        locale,
        ...(email && email !== me?.user.email ? { email } : {}),
        ...(phone && phone !== me?.user.phone ? { phone } : {}),
      },
    }),
    invalidate: [['me']],
    success: 'Saved',
    toastErrors: false,
  });
  const resend = useAction({ request: () => ({ path: '/auth/verify-email/resend', idempotent: false }), success: 'Verification email sent' });
  if (!me) return null;
  return (
    <Card>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {save.error ? <Alert tone="danger">{save.error.message}</Alert> : null}
          <Field label="Your name">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field label="Language" hint="Yorùbá is partial and awaiting review by a fluent speaker; missing text appears in English.">
            <Select value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="en">English</option>
              <option value="yo">Yorùbá (partial)</option>
            </Select>
          </Field>
          <Field
            label={
              <span className="inline-flex items-center gap-2">
                Email {me.user.email ? <Badge tone={me.user.emailVerified ? 'success' : 'warning'}>{me.user.emailVerified ? 'Verified' : 'Not verified'}</Badge> : null}
              </span>
            }
            hint="Changing it requires verifying the new address."
          >
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {me.user.email && !me.user.emailVerified ? (
            <Button type="button" size="sm" variant="outline" onClick={() => resend.mutate()} loading={resend.isPending} className="self-start">
              Resend verification email
            </Button>
          ) : null}
          <Field
            label={
              <span className="inline-flex items-center gap-2">
                Phone {me.user.phone ? <Badge tone={me.user.phoneVerified ? 'success' : 'warning'}>{me.user.phoneVerified ? 'Verified' : 'Not verified'}</Badge> : null}
              </span>
            }
          >
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <PhoneVerification />
          <Button type="submit" loading={save.isPending} className="self-start">
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
