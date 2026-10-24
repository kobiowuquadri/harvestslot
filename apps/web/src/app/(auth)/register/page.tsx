'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { OYO_LGAS, registerSchema, type RegisterInput } from '@harvestslot/contracts';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, RadioCards, Select } from '@/components/ui/form';
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives';
import { ApiError, post } from '@/lib/api';
import { useSession } from '@/lib/session';

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
  const { refresh, config } = useSession();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema) as never,
    defaultValues: { accountType: params.get('type') === 'STAFF' ? 'STAFF' : 'FARMER', contactConsentEmail: true, contactConsentSms: false } as Partial<RegisterInput>,
  });
  const { register, handleSubmit, control, setError, formState } = form;
  const type = useWatch({ control, name: 'accountType' });
  const lgas = config?.supportedLgas?.length ? config.supportedLgas : [...OYO_LGAS];

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await post('/auth/register', values);
      await refresh();
      router.push(safeNext ?? '/app?welcome=1');
    } catch (e) {
      if (e instanceof ApiError) {
        const fields = e.fieldErrors;
        for (const [path, message] of Object.entries(fields)) setError(path as keyof RegisterInput, { message });
        setServerError(e.message);
      } else setServerError('Registration failed');
    }
  });
  const err = (k: keyof RegisterInput) => formState.errors[k]?.message as string | undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Create your HarvestSlot account</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          {serverError ? <Alert tone="danger">{serverError}</Alert> : null}
          <Controller
            control={control}
            name="accountType"
            render={({ field }) => (
              <RadioCards
                legend="I am registering as"
                name="accountType"
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: 'FARMER', label: 'A farmer', description: 'Sell cassava and arrange harvests' },
                  { value: 'PROCESSOR', label: 'A processor', description: 'Buy and process fresh cassava' },
                  { value: 'TRANSPORTER', label: 'A transporter', description: 'Move cassava from farms to facilities' },
                  { value: 'COOPERATIVE', label: 'A cooperative', description: 'Help member farmers with their consent' },
                  { value: 'STAFF', label: 'Staff or a driver', description: 'An organisation invited you to join it' },
                ]}
              />
            )}
          />
          <Field label={type === 'FARMER' ? 'Your name' : 'Your name (account holder)'} error={err('displayName')} required>
            <Input autoComplete="name" {...register('displayName')} />
          </Field>
          {type !== 'FARMER' && type !== 'STAFF' ? (
            <>
              <Field label="Organisation name" error={err('organisationName')} required>
                <Input autoComplete="organization" {...register('organisationName')} />
              </Field>
              <Field label="Registration number (optional)" hint="Self-reported (e.g. CAC number). It is shown as unverified until an administrator reviews your documents." error={err('registrationNumber')}>
                <Input {...register('registrationNumber')} />
              </Field>
            </>
          ) : null}
          <Field label="Email address" hint={config?.smsAvailable ? 'Email or phone is required.' : 'Required: phone-only sign-up needs SMS, which is not available here.'} error={err('email')}>
            <Input type="email" autoComplete="email" {...register('email', { setValueAs: (v: string) => (v === '' ? undefined : v) })} />
          </Field>
          <Field label="Phone number (optional)" hint="Like 08012345678. Used for SMS updates only if you agree below and verify it." error={err('phone')}>
            <Input type="tel" autoComplete="tel" inputMode="tel" {...register('phone', { setValueAs: (v: string) => (v === '' ? undefined : v) })} />
          </Field>
          <Field label="Password" hint="At least 10 characters." error={err('password')} required>
            <Input type="password" autoComplete="new-password" {...register('password')} />
          </Field>
          {type === 'STAFF' ? <p className="text-sm text-muted">After creating your account, open the invitation link from your email again to join the organisation.</p> : null}
          {type !== 'STAFF' ? (
          <Field label="Local government area" error={err('lga')} required>
            <Select defaultValue="" {...register('lga')}>
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
          ) : null}
          {type === 'FARMER' ? (
            <Field label="Town or community (optional)" error={err('community')}>
              <Input {...register('community', { setValueAs: (v: string) => (v === '' ? undefined : v) })} />
            </Field>
          ) : null}
          <fieldset className="flex flex-col gap-1 rounded-lg border border-line p-3">
            <legend className="px-1 text-sm font-medium">Agreements and contact</legend>
            <Checkbox label={<>I accept the <Link href="/terms" className="underline" target="_blank">terms of use</Link></>} {...register('acceptTerms')} />
            {err('acceptTerms') ? <p className="text-sm text-danger">{err('acceptTerms')}</p> : null}
            <Checkbox label={<>I have read the <Link href="/privacy" className="underline" target="_blank">privacy notice</Link></>} {...register('acceptPrivacy')} />
            {err('acceptPrivacy') ? <p className="text-sm text-danger">{err('acceptPrivacy')}</p> : null}
            <Checkbox label="Email me booking and payment updates" description="You can change this any time." {...register('contactConsentEmail')} />
            <Checkbox label="Send me SMS updates" description={config?.smsAvailable ? 'Only after you verify your phone.' : 'SMS is not configured in this environment yet.'} {...register('contactConsentSms')} />
          </fieldset>
          <Button type="submit" size="lg" loading={formState.isSubmitting}>
            Create account
          </Button>
          <p className="text-sm text-muted">
            Already registered? <Link href="/login" className="text-leaf underline">Sign in</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
