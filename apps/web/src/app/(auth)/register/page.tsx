'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { ArrowLeft, ArrowRight, Factory, Sprout } from 'lucide-react';
import { registerSchema, type RegisterInput } from '@harvestslot/contracts';
import { Button } from '@/components/ui/button';
import { ChoiceCards } from '@/components/ui/choice';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { Alert } from '@/components/ui/primitives';
import { ApiError, post } from '@/lib/api';
import { useSession } from '@/lib/session';

type Purpose = 'FARMER' | 'PROCESSOR';

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
  // Staff join through their organisation's invitation link; that path skips the two public choices.
  const invited = params.get('type') === 'STAFF';
  const initialPurpose = params.get('type') === 'PROCESSOR' ? 'PROCESSOR' : params.get('type') === 'FARMER' ? 'FARMER' : null;
  const { refresh, config } = useSession();
  const [purpose, setPurpose] = useState<Purpose | null>(initialPurpose);
  const [step, setStep] = useState<'choose' | 'details'>(invited ? 'details' : 'choose');
  const [chooseError, setChooseError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema) as never,
    defaultValues: { accountType: invited ? 'STAFF' : (initialPurpose ?? 'FARMER'), contactConsentEmail: true, contactConsentSms: false } as Partial<RegisterInput>,
  });
  const { register, handleSubmit, setValue, setError, formState, control } = form;
  const type = useWatch({ control, name: 'accountType' });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await post('/auth/register', values);
      await refresh();
      router.push(safeNext ?? '/app?welcome=1');
    } catch (e) {
      if (e instanceof ApiError) {
        for (const [path, message] of Object.entries(e.fieldErrors)) setError(path as keyof RegisterInput, { message });
        setServerError(e.message);
      } else setServerError('Registration failed');
    }
  });
  const err = (k: keyof RegisterInput) => formState.errors[k]?.message as string | undefined;

  if (step === 'choose') {
    return (
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">What would you like to do?</h1>
        <p className="mt-2 text-[15px] text-muted">Choose one to create your free account. You can add farm or facility details later.</p>
        <form
          className="mt-8 flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!purpose) {
              setChooseError('Choose selling or buying to continue');
              return;
            }
            setValue('accountType', purpose);
            setStep('details');
          }}
        >
          <ChoiceCards<Purpose>
            name="purpose"
            legend="What would you like to do?"
            hideLegend
            value={purpose}
            onChange={(v) => {
              setPurpose(v);
              setChooseError(null);
            }}
            error={chooseError ?? undefined}
            options={[
              { value: 'FARMER', label: 'Sell cassava', description: 'I’m a farmer looking for a buyer.', icon: <Sprout className="size-6" /> },
              { value: 'PROCESSOR', label: 'Buy cassava', description: 'I buy fresh cassava for a processing facility.', icon: <Factory className="size-6" /> },
            ]}
          />
          <Button type="submit" size="lg">
            Continue <ArrowRight className="size-4" aria-hidden />
          </Button>
          <p className="text-center text-sm text-muted">
            Already registered?{' '}
            <Link href="/login" className="font-medium text-forest underline underline-offset-2">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    );
  }

  const title = type === 'PROCESSOR' ? 'Create your buyer account' : type === 'STAFF' ? 'Create your staff account' : 'Create your seller account';
  const intro =
    type === 'PROCESSOR'
      ? 'Next you will tell farmers how much cassava you can receive, where, and when. HarvestSlot reviews new businesses before their buying slots go live.'
      : type === 'STAFF'
        ? 'Use the email address your invitation was sent to. Afterwards, open the invitation link again to join your organisation.'
        : 'Next you will add your harvest — where it is, how much, and when it will be ready.';

  return (
    <div>
      {!invited ? (
        <button type="button" onClick={() => setStep('choose')} className="mb-5 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-forest hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> {type === 'PROCESSOR' ? 'Buying cassava' : 'Selling cassava'} · change
        </button>
      ) : null}
      <h1 className="text-3xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="mt-2 text-[15px] text-muted">{intro}</p>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
        {serverError ? <Alert tone="danger">{serverError}</Alert> : null}
        <Field label="Your name" error={err('displayName')} required>
          <Input autoComplete="name" {...register('displayName')} />
        </Field>
        {type === 'PROCESSOR' ? (
          <Field label="Business name" hint="The name farmers will see on your offers." error={err('organisationName')} required>
            <Input autoComplete="organization" {...register('organisationName', { setValueAs: (v: string) => (v === '' ? undefined : v) })} />
          </Field>
        ) : null}
        <Field label="Email address" hint={config?.smsAvailable ? 'Email or phone is required.' : 'Required here: phone-only sign-up needs SMS, which is not available yet.'} error={err('email')}>
          <Input type="email" autoComplete="email" {...register('email', { setValueAs: (v: string) => (v === '' ? undefined : v) })} />
        </Field>
        <Field label="Phone number (optional)" hint="Like 08012345678. Used for SMS updates only if you agree below and verify it." error={err('phone')}>
          <Input type="tel" autoComplete="tel" inputMode="tel" {...register('phone', { setValueAs: (v: string) => (v === '' ? undefined : v) })} />
        </Field>
        <Field label="Password" hint="At least 8 characters." error={err('password')} required>
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        <fieldset className="flex flex-col gap-1 rounded-xl border border-line bg-canvas/60 p-4">
          <legend className="px-1 text-sm font-medium">Agreements and contact</legend>
          <Checkbox
            label={
              <>
                I accept the{' '}
                <Link href="/terms" className="underline" target="_blank">
                  terms of use
                </Link>
              </>
            }
            {...register('acceptTerms')}
          />
          {err('acceptTerms') ? <p className="text-sm text-danger">{err('acceptTerms')}</p> : null}
          <Checkbox
            label={
              <>
                I have read the{' '}
                <Link href="/privacy" className="underline" target="_blank">
                  privacy notice
                </Link>
              </>
            }
            {...register('acceptPrivacy')}
          />
          {err('acceptPrivacy') ? <p className="text-sm text-danger">{err('acceptPrivacy')}</p> : null}
          <Checkbox label="Email me booking and payment updates" description="You can change this any time." {...register('contactConsentEmail')} />
          <Checkbox label="Send me SMS updates" description={config?.smsAvailable ? 'Only after you verify your phone.' : 'SMS is not configured in this environment yet.'} {...register('contactConsentSms')} />
        </fieldset>
        <Button type="submit" size="lg" loading={formState.isSubmitting}>
          Create account
        </Button>
        <p className="text-center text-sm text-muted">
          Already registered?{' '}
          <Link href="/login" className="font-medium text-forest underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
