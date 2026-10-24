import { Suspense } from 'react';
import { AcceptInvitation } from '../../recovery-pages';

export default function Page() {
  return (
    <Suspense>
      <AcceptInvitation />
    </Suspense>
  );
}
