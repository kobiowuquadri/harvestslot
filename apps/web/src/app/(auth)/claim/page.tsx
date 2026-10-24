import { Suspense } from 'react';
import { ClaimAccount } from '../recovery-pages';

export default function Page() {
  return (
    <Suspense>
      <ClaimAccount />
    </Suspense>
  );
}
