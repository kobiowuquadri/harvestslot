'use client';

import { useState } from 'react';
import type { NotificationPrefs } from '@harvestslot/contracts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/form';
import { Alert, Card, CardContent } from '@/components/ui/primitives';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';

const CATEGORIES: Array<{ key: NotificationPrefs['mutedCategories'][number]; label: string }> = [
  { key: 'offers', label: 'Offers and counter-offers' },
  { key: 'bookings', label: 'Booking confirmations and changes' },
  { key: 'transport', label: 'Transport and pickup' },
  { key: 'receiving', label: 'Receiving and quality decisions' },
  { key: 'payments', label: 'Invoices and payments' },
  { key: 'disputes', label: 'Disputes' },
];

export default function NotificationSettings() {
  const { me, config } = useSession();
  const [prefs, setPrefs] = useState<NotificationPrefs>(me?.user.notificationPrefs ?? { email: true, sms: false, mutedCategories: [] });
  const save = useAction({ request: () => ({ path: '/auth/account', method: 'PATCH', body: { notificationPrefs: prefs }, idempotent: false }), invalidate: [['me']], success: 'Preferences saved' });
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted">In-app notifications are always on. Choose which copies you also receive by email or SMS.</p>
        {me?.user.isDemo ? <Alert tone="info">Demo accounts never receive real email or SMS; messages are captured locally for development.</Alert> : null}
        <Checkbox label="Email" description={me?.user.email ? me.user.email : 'No email address on your account'} checked={prefs.email} disabled={!me?.user.email} onChange={(e) => setPrefs((p) => ({ ...p, email: e.target.checked }))} />
        <Checkbox
          label="SMS"
          description={!config?.smsAvailable ? 'SMS is not configured in this environment.' : me?.user.phoneVerified ? me.user.phone : 'Verify your phone number first.'}
          checked={prefs.sms}
          disabled={!config?.smsAvailable || !me?.user.phoneVerified}
          onChange={(e) => setPrefs((p) => ({ ...p, sms: e.target.checked }))}
        />
        <fieldset className="flex flex-col gap-1 rounded-lg border border-line p-3">
          <legend className="px-1 text-sm font-medium">Send email/SMS copies for</legend>
          {CATEGORIES.map((c) => (
            <Checkbox key={c.key} label={c.label} checked={!prefs.mutedCategories.includes(c.key)} onChange={(e) => setPrefs((p) => ({ ...p, mutedCategories: e.target.checked ? p.mutedCategories.filter((x) => x !== c.key) : [...p.mutedCategories, c.key] }))} />
          ))}
        </fieldset>
        <Button className="self-start" onClick={() => save.mutate()} loading={save.isPending}>
          Save preferences
        </Button>
      </CardContent>
    </Card>
  );
}
