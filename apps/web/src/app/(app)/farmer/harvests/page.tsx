'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CloudOff, Plus, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { HarvestDto } from '@harvestslot/contracts';
import { useOnline } from '@/components/domain/banners';
import { FarmerGate } from '@/components/domain/farmer-gate';
import { harvestPayload, normaliseDraftValues, quantityKg } from '@/components/domain/harvest-form';
import { HarvestCards } from '@/components/domain/lists';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives';
import { ApiError, api } from '@/lib/api';
import { deleteDraft, listDrafts, type HarvestDraft } from '@/lib/drafts';
import { farmerCan, useApi, withFarmer, type FarmerContext } from '@/lib/hooks';
import { useSession } from '@/lib/session';

function DeviceDrafts({ ctx }: { ctx: FarmerContext }) {
  const { me } = useSession();
  const online = useOnline();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<HarvestDraft[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (me) listDrafts(me.user.id).then((d) => setDrafts(d.filter((x) => x.farmerProfileId === ctx.farmerProfileId)));
  }, [me, ctx.farmerProfileId]);
  useEffect(reload, [reload]);
  if (!drafts.length) return null;

  const send = async (d: HarvestDraft) => {
    setBusy(d.id);
    try {
      const saved = await api<HarvestDto>(`/farmers/${d.farmerProfileId}/harvests`, {
        method: 'POST',
        // The draft id is both the idempotency key and clientDraftId: re-sending cannot duplicate it.
        idempotencyKey: d.id,
        body: { ...harvestPayload(normaliseDraftValues(d.values)), clientDraftId: d.id, publish: false },
      });
      await deleteDraft(d.id);
      toast.success(`Sent as draft ${saved.reference}. Open it and choose “Find buyers”.`);
      await qc.invalidateQueries({ queryKey: ['harvests'] });
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError && e.code === 'VALIDATION_FAILED' ? 'Some answers need fixing — open the draft to correct them.' : e instanceof Error ? e.message : 'Could not send');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-amber-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudOff className="size-5" aria-hidden /> Saved on this phone only
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted">These have not reached HarvestSlot yet. Drafts are removed from this phone after 14 days or when you sign out.</p>
        {drafts.map((d) => {
          const v = normaliseDraftValues(d.values);
          const kg = quantityKg(v);
          return (
            <div key={d.id} className="flex flex-col gap-2 rounded-lg border border-line p-3 sm:flex-row sm:items-center">
              <div className="flex-1 text-sm">
                <p className="font-medium">{kg ? `${Number(kg)} kg` : 'Quantity not entered'} · {v.readyDate || 'date not set'}</p>
                <p className="text-xs text-muted">Saved {new Date(d.savedAt).toLocaleString('en-NG')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={withFarmer(`/farmer/harvests/new?draft=${d.id}`, ctx)}>Continue editing</Link>
                </Button>
                <Button size="sm" onClick={() => void send(d)} loading={busy === d.id} disabled={!online}>
                  <Send className="size-4" aria-hidden /> Send now
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Delete draft from this phone"
                  onClick={async () => {
                    await deleteDraft(d.id);
                    reload();
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function HarvestList({ ctx }: { ctx: FarmerContext }) {
  const params = useSearchParams();
  const q = useApi<HarvestDto[]>(['harvests', ctx.farmerProfileId], `/harvests?farmerProfileId=${ctx.farmerProfileId}`);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your harvests"
        description="Each harvest tells buyers how much cassava you can sell, where, and when."
        actions={
          farmerCan(ctx, 'harvest.edit') ? (
            <Button asChild size="lg">
              <Link href={withFarmer('/farmer/harvests/new', ctx)}>
                <Plus className="size-5" aria-hidden /> Add my harvest
              </Link>
            </Button>
          ) : null
        }
      />
      {params.get('saved') === 'device' ? <Alert tone="info" title="Kept on this phone">Send it when you are online — it is listed below.</Alert> : null}
      <DeviceDrafts ctx={ctx} />
      <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No harvests yet">Add your harvest to see which buyers can take it.</EmptyState>}>
        {(items) => <HarvestCards items={items} hrefFor={(h) => withFarmer(`/farmer/harvests/${h.id}`, ctx)} />}
      </QueryView>
    </div>
  );
}

export default function HarvestsPage() {
  return <FarmerGate>{(ctx) => <HarvestList ctx={ctx} />}</FarmerGate>;
}
