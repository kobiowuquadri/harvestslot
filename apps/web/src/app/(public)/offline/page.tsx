import Link from 'next/link';

export const metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-forest">You are offline</h1>
      <p className="mt-3 text-sm text-muted">
        HarvestSlot needs a connection to show bookings, offers and payments, so nothing out of date is shown here. You can still prepare a harvest request on this phone and send it later.
      </p>
      <Link href="/farmer/harvests/new" className="mt-6 inline-block rounded-lg bg-forest px-4 py-3 font-medium text-white">
        Prepare a harvest request
      </Link>
    </div>
  );
}
