'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Alert } from '@/components/ui/primitives';
import { ApiError, post } from '@/lib/api';
import { useSession } from '@/lib/session';

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">{title}</h1>
      <div className="mt-8">{children}</div>
    </div>
  );
}

function useSubmit<T>(fn: () => Promise<T>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<T | null>(null);
  const run = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setDone(await fn());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, done, run };
}

export function ForgotPassword() {
  const [identifier, setIdentifier] = useState('');
  const s = useSubmit(() => post<{ message: string }>('/auth/forgot-password', { identifier }));
  return (
    <Shell title="Reset your password">
      {s.done ? (
        <Alert tone="success">{s.done.message}</Alert>
      ) : (
        <form onSubmit={s.run} className="flex flex-col gap-4">
          {s.error ? <Alert tone="danger">{s.error}</Alert> : null}
          <Field label="Email or phone number" hint="We send a reset link by email, or a code by SMS where SMS is available.">
            <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" />
          </Field>
          <Button type="submit" loading={s.busy}>Send instructions</Button>
          <p className="text-sm text-muted">
            Reset with a phone code instead? <Link className="text-leaf underline" href="/phone-recovery">Use your phone</Link>
          </p>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const s = useSubmit(async () => {
    await post('/auth/reset-password', { token, newPassword: password });
    return true;
  });
  useEffect(() => {
    if (s.done) setTimeout(() => router.push('/login'), 1500);
  }, [s.done, router]);
  return (
    <Shell title="Choose a new password">
      {s.done ? (
        <Alert tone="success">Password changed. All your other sessions were signed out. Redirecting to sign in…</Alert>
      ) : (
        <form onSubmit={s.run} className="flex flex-col gap-4">
          {!token ? <Alert tone="danger">This link is incomplete. Open the link from your email again.</Alert> : null}
          {s.error ? <Alert tone="danger">{s.error}</Alert> : null}
          <Field label="New password" hint="At least 8 characters.">
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" loading={s.busy} disabled={!token}>Set password</Button>
        </form>
      )}
    </Shell>
  );
}

export function VerifyEmail() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const started = useRef(false);
  const s = useSubmit(async () => {
    await post('/auth/verify-email', { token });
    return true;
  });
  useEffect(() => {
    if (token && !started.current) {
      started.current = true;
      void s.run();
    }
  }, [token, s]);
  return (
    <Shell title="Verify your email">
      {s.done ? <Alert tone="success">Email verified. <Link href="/app" className="underline">Continue</Link></Alert> : s.error ? <Alert tone="danger">{s.error}</Alert> : <p className="text-sm text-muted">Checking your link…</p>}
    </Shell>
  );
}

export function PhoneRecovery() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const start = useSubmit(async () => {
    await post('/auth/phone-recovery/start', { phone });
    setSent(true);
    return true;
  });
  const complete = useSubmit(async () => {
    await post('/auth/phone-recovery/complete', { phone, code, newPassword: password });
    return true;
  });
  const { config } = useSession();
  return (
    <Shell title="Reset with your phone">
      {!config?.smsAvailable ? <Alert tone="warning">SMS is not configured here, so phone codes cannot be sent. Use email reset instead.</Alert> : null}
      {complete.done ? (
        <Alert tone="success">Password changed. <Link href="/login" className="underline">Sign in</Link></Alert>
      ) : !sent ? (
        <form onSubmit={start.run} className="mt-3 flex flex-col gap-4">
          {start.error ? <Alert tone="danger">{start.error}</Alert> : null}
          <Field label="Verified phone number">
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Button type="submit" loading={start.busy} disabled={!config?.smsAvailable}>Send code</Button>
        </form>
      ) : (
        <form onSubmit={complete.run} className="mt-3 flex flex-col gap-4">
          <Alert tone="info">If the number belongs to a verified account, a 6-digit code was sent. It expires in 10 minutes.</Alert>
          {complete.error ? <Alert tone="danger">{complete.error}</Alert> : null}
          <Field label="Code">
            <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="New password">
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" loading={complete.busy}>Reset password</Button>
        </form>
      )}
    </Shell>
  );
}

export function ClaimAccount() {
  const router = useRouter();
  const { refresh, config } = useSession();
  const [claimCode, setClaimCode] = useState('');
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accept, setAccept] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const start = useSubmit(async () => {
    const r = await post<{ sentTo: string }>('/auth/claim/start', { claimCode });
    setSentTo(r.sentTo);
    return r;
  });
  const complete = useSubmit(async () => {
    await post('/auth/claim/complete', { claimCode, otp, email: email || undefined, password, acceptTerms: true, acceptPrivacy: true });
    await refresh();
    router.push('/farmer/permissions?claimed=1');
    return true;
  });
  return (
    <Shell title="Claim your farmer account">
      <p className="mb-4 text-sm text-muted">If your cooperative registered you, they can give you a claim code. We then send a code to the phone number they recorded for you, to confirm it is you.</p>
      {!config?.smsAvailable ? <Alert tone="warning">SMS is not configured in this environment, so claiming is not available yet.</Alert> : null}
      {!sentTo ? (
        <form onSubmit={start.run} className="mt-3 flex flex-col gap-4">
          {start.error ? <Alert tone="danger">{start.error}</Alert> : null}
          <Field label="Claim code">
            <Input value={claimCode} onChange={(e) => setClaimCode(e.target.value.toUpperCase())} autoCapitalize="characters" />
          </Field>
          <Button type="submit" loading={start.busy} disabled={!config?.smsAvailable}>Continue</Button>
        </form>
      ) : (
        <form onSubmit={complete.run} className="mt-3 flex flex-col gap-4">
          <Alert tone="info">We sent a 6-digit code to {sentTo}.</Alert>
          {complete.error ? <Alert tone="danger">{complete.error}</Alert> : null}
          <Field label="Code from SMS">
            <Input inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value)} />
          </Field>
          <Field label="Email (optional)">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Create a password" hint="At least 8 characters.">
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 size-5" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
            <span>
              I accept the <Link href="/terms" className="underline">terms</Link> and have read the <Link href="/privacy" className="underline">privacy notice</Link>.
            </span>
          </label>
          <Button type="submit" loading={complete.busy} disabled={!accept}>Claim my account</Button>
        </form>
      )}
    </Shell>
  );
}

export function AcceptInvitation() {
  const params = useSearchParams();
  const router = useRouter();
  const { status, refresh } = useSession();
  const token = params.get('token') ?? '';
  const s = useSubmit(async () => {
    await post('/auth/invitations/accept', { token });
    await refresh();
    router.push('/app');
    return true;
  });
  if (status === 'unauthenticated') {
    return (
      <Shell title="Join your team">
        <p className="text-sm text-muted">Sign in, or create an account, with the email address the invitation was sent to. You will come back here to accept it.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent(`/invitations/accept?token=${token}`)}`}>Sign in</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/register?type=STAFF&next=${encodeURIComponent(`/invitations/accept?token=${token}`)}`}>Create an account</Link>
          </Button>
        </div>
      </Shell>
    );
  }
  return (
    <Shell title="Join your team">
      {s.error ? <Alert tone="danger">{s.error}</Alert> : null}
      <Button onClick={() => void s.run()} loading={s.busy} disabled={!token}>Accept invitation</Button>
    </Shell>
  );
}
