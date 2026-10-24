import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-forest">Page not found</h1>
      <p className="mt-3 text-sm text-muted">The link may be old, or you may not have access to it.</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-forest px-4 py-3 font-medium text-white">
        Go to HarvestSlot
      </Link>
    </main>
  );
}
