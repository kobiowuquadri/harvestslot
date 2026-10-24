import { Suspense } from 'react';
import { ResetPassword } from '../recovery-pages';

export default function Page() {
  return (
    <Suspense>
      <ResetPassword />
    </Suspense>
  );
}
