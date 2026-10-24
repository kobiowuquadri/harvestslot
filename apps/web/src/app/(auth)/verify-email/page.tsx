import { Suspense } from 'react';
import { VerifyEmail } from '../recovery-pages';

export default function Page() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
