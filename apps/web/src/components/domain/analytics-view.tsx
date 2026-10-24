'use client';

import { useState } from 'react';
import { addDays, formatKg, formatNaira, lagosDateString, type AnalyticsResponse } from '@harvestslot/contracts';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Badge, Card, CardContent } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { When } from './display';
import { QueryView } from './states';

function formatValue(value: number | string | null, unit: string): string {
  if (value === null) return '—';
  if (unit === 'kobo') return formatNaira(Number(value));
  if (unit === 'kg') return formatKg(String(value));
  if (unit === 'percent') return `${Number(value).toFixed(1)}%`;
  if (unit === 'hours') return `${Number(value).toFixed(1)} h`;
  return Number(value).toLocaleString('en-NG');
}

/**
 * Metrics computed from recorded platform events, each with its definition. Values with too little
 * data say so instead of showing a number; demo and live data are never mixed.
 */
export function AnalyticsView({ path }: { path: string }) {
  const { config } = useSession();
  const today = lagosDateString(new Date());
  const [from, setFrom] = useState(addDays(today, -90));
  const [to, setTo] = useState(today);
  const [scope, setScope] = useState<'live' | 'demo'>(config?.demoMode ? 'demo' : 'live');
  const q = useApi<AnalyticsResponse>(['analytics', path, from, to, scope], `${path}?from=${from}&to=${to}&dataScope=${scope}`);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Data">
          <Select value={scope} onChange={(e) => setScope(e.target.value as 'live' | 'demo')}>
            <option value="live">Live records only</option>
            <option value="demo">Demo records only</option>
          </Select>
        </Field>
      </div>
      <QueryView query={q}>
        {(r) => (
          <>
            {r.dataScope === 'demo' ? <Alert tone="warning" title="Demo data">These figures come from fictional demonstration records and say nothing about real-world impact.</Alert> : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {r.definitions.map((d) => {
                const v = r.values.find((x) => x.key === d.key);
                return (
                  <Card key={d.key}>
                    <CardContent className="flex flex-col gap-2">
                      <p className="text-sm font-medium text-muted">{d.label}</p>
                      {v?.value === null || v === undefined ? (
                        <p className="text-sm text-amber-ink">{v?.emptyReason ?? 'Not enough data'}</p>
                      ) : (
                        <p className="text-2xl font-semibold tabular text-forest">{formatValue(v.value, d.unit)}</p>
                      )}
                      {v?.breakdown?.length ? (
                        <ul className="text-xs text-muted">
                          {v.breakdown.map((b) => (
                            <li key={b.label}>
                              {b.label}: {formatValue(b.value, d.unit)}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <details className="text-xs text-muted">
                        <summary className="cursor-pointer">How this is calculated</summary>
                        <p className="mt-1">{d.definition}</p>
                        <p className="mt-1">Sources: {d.sources.join(', ')}</p>
                        <p className="mt-1">Excludes: {d.exclusions}</p>
                      </details>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {r.notes.length ? (
              <ul className="list-disc pl-5 text-sm text-muted">
                {r.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
            <p className="text-xs text-muted">
              {r.scope.name} · {r.range.from} to {r.range.to} · generated <When at={r.generatedAt} /> <Badge tone="neutral">{r.dataScope}</Badge>
            </p>
          </>
        )}
      </QueryView>
    </div>
  );
}
