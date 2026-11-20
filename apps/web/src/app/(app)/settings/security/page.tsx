'use client';

import { useState } from 'react';
import type { SessionInfo } from '@harvestslot/contracts';
import { When } from '@/components/domain/display';
import { QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useAction({
    request: () => ({ path: '/auth/password/change', body: { currentPassword: current, newPassword: next }, idempotent: false }),
    success: 'Password changed. Your other sessions were signed out.',
    toastErrors: false,
    onSuccess: () => {
      setCurrent('');
      setNext('');
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            change.mutate();
          }}
        >
          {change.error ? <Alert tone="danger">{change.error.message}</Alert> : null}
          <Field label="Current password">
            <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="New password" hint="At least 8 characters." error={change.error?.fieldErrors.newPassword}>
            <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Button type="submit" loading={change.isPending} className="self-start" disabled={!current || !next}>
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TwoFactor() {
  const { me } = useSession();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const start = useAction<void, { secret: string; otpauthUrl: string }>({ request: () => ({ path: '/auth/mfa/setup', idempotent: false }), onSuccess: (r) => setSetup(r) });
  const enable = useAction<void, { recoveryCodes: string[] }>({ request: () => ({ path: '/auth/mfa/enable', body: { code }, idempotent: false }), invalidate: [['me']], success: 'Two-factor authentication is on', onSuccess: (r) => setCodes(r.recoveryCodes) });
  const disable = useAction({ request: () => ({ path: '/auth/mfa/disable', body: { code }, idempotent: false }), invalidate: [['me']], success: 'Two-factor authentication is off' });
  if (!me) return null;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Two-factor authentication</CardTitle>
          <Badge tone={me.user.mfaEnabled ? 'success' : 'neutral'}>{me.user.mfaEnabled ? 'On' : 'Off'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <p className="text-muted">Uses an authenticator app (time-based codes). Required for administrators in production.</p>
        {codes ? (
          <Alert tone="warning" title="Save these recovery codes now">
            Each works once if you lose your phone. They are not shown again.
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono">
              {codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        {!me.user.mfaEnabled ? (
          setup ? (
            <>
              <p>Add this key to your authenticator app, then enter the 6-digit code it shows.</p>
              <p className="break-all rounded bg-canvas p-2 font-mono">{setup.secret}</p>
              <a className="text-leaf underline" href={setup.otpauthUrl}>
                Open in authenticator app
              </a>
              <div className="flex gap-2">
                <Input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} aria-label="6-digit code" />
                <Button onClick={() => enable.mutate()} loading={enable.isPending}>
                  Turn on
                </Button>
              </div>
              {enable.error ? <Alert tone="danger">{enable.error.message}</Alert> : null}
            </>
          ) : (
            <Button className="self-start" onClick={() => start.mutate()} loading={start.isPending}>
              Set up two-factor authentication
            </Button>
          )
        ) : (
          <div className="flex gap-2">
            <Input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Code to turn off" placeholder="Current code" />
            <Button variant="danger" onClick={() => disable.mutate()} loading={disable.isPending}>
              Turn off
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Sessions() {
  const q = useApi<SessionInfo[]>(['sessions'], '/auth/sessions');
  const revokeOthers = useAction({ request: () => ({ path: '/auth/sessions/revoke-others', idempotent: false }), invalidate: [['sessions']], success: 'Other sessions signed out' });
  const revoke = useAction<string>({ request: (id) => ({ path: `/auth/sessions/${id}`, method: 'DELETE', idempotent: false }), invalidate: [['sessions']], success: 'Session signed out' });
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Where you are signed in</CardTitle>
          <Button size="sm" variant="outline" onClick={() => revokeOthers.mutate()} loading={revokeOthers.isPending}>
            Sign out other sessions
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <QueryView query={q}>
          {(sessions) => (
            <ul className="flex flex-col gap-2 text-sm">
              {sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3">
                  <span className="flex-1">
                    <span className="block font-medium">{s.userAgent ? s.userAgent.slice(0, 80) : 'Unknown device'}</span>
                    <span className="text-muted">
                      Last active <When at={s.lastSeenAt} relative /> {s.ip ? `· ${s.ip}` : ''}
                    </span>
                  </span>
                  {s.current ? (
                    <Badge tone="success">This device</Badge>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => revoke.mutate(s.id)}>
                      Sign out
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </CardContent>
    </Card>
  );
}

export default function SecuritySettings() {
  return (
    <div className="flex flex-col gap-6">
      <ChangePassword />
      <TwoFactor />
      <Sessions />
    </div>
  );
}
