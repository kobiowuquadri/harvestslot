import { Suspense } from 'react';
import { ForgotPassword } from '../recovery-pages';

export default function Page() {
  return (
    <Suspense>
      <ForgotPassword />
    </Suspense>
  );
}
