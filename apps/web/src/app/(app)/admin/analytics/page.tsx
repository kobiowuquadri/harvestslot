'use client';

import { AnalyticsView } from '@/components/domain/analytics-view';
import { PageHeader } from '@/components/domain/states';

export default function AdminAnalytics() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Platform analytics" description="Measured from HarvestSlot records only. These are operational indicators, not evidence of wider loss reduction or income change." />
      <AnalyticsView path="/admin/analytics" />
    </div>
  );
}
