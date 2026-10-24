'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { DemoEntry } from '@/app/(public)/demo-entry';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives';
import { ApiError, post } from '@/lib/api';
import { useSession } from '@/lib/session';

function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/app';
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh, status } = useSession();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfa, setMfa] = useState(status === 'mfa');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!mfa) {
        const res = await post<{ mfaRequired: boolean }>('/auth/login', { identifier, password });
        if (res.mfaRequired) {
          setMfa(true);
          return;
        }
      } else {
        await post('/auth/mfa/verify', { code });
      }
      await refresh();
      router.push(safeNext(params.get('next')));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{mfa ? 'Two-factor check' : 'Sign in'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {!mfa ? (
            <>
              <Field label="Email or phone number" required>
                <Input autoComplete="username" inputMode="email" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
              </Field>
              <Field label="Password" required>
                <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            </>
          ) : (
            <Field label="Authenticator code" hint="Enter the 6-digit code from your authenticator app, or one of your recovery codes.">
              <Input autoComplete="one-time-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
            </Field>
          )}
          <Button type="submit" size="lg" loading={busy}>
            {mfa ? 'Verify' : 'Sign in'}
          </Button>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <Link href="/forgot-password" className="text-leaf underline">Forgot password?</Link>
            <Link href="/register" className="text-leaf underline">Create an account</Link>
          </div>
          <p className="text-sm text-muted">
            Registered by your cooperative? <Link href="/claim" className="text-leaf underline">Claim your account</Link>.
          </p>
        </form>
        <div className="mt-6">
          <DemoEntry compact />
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
