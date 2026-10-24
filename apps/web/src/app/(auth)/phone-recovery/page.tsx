import { Suspense } from 'react';
import { PhoneRecovery } from '../recovery-pages';

export default function Page() {
  return (
    <Suspense>
      <PhoneRecovery />
    </Suspense>
  );
}
