'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchApi } from '@/lib/import/http';
import type { AiBudget } from '@/lib/transcription/types';
import { AiBudgetMeter } from './ai-budget-meter';

interface Limits {
  free: { day: number; month: number };
  member: { day: number; month: number };
  monthly_budget_usd: number;
  assistant_pause_usd: number;
}

interface Usage {
  budget: AiBudget;
  limits: Limits;
  byFeature: { feature: string; calls: number; costUsd: number }[];
  byUser: { userId: string; name: string; email: string | null; level: 'free' | 'member' | 'admin'; messages: number; costUsd: number }[];
}

const FEATURE_LABELS: Record<string, string> = {
  assistant: 'Research assistant',
  transcription: 'Transcription batches',
  transcription_pilot: 'Transcription pilot',
  import_mapping: 'Import suggestions',
  descriptions: 'Collection descriptions',
};

const LEVEL_LABELS = { free: 'Free', member: 'Member', admin: 'Admin' } as const;

function NumberField({ label, value, onChange, step = 1, prefix }: { label: string; value: number; onChange: (n: number) => void; step?: number; prefix?: string }) {
  return (
    <label className="block text-xs text-brand-muted">
      {label}
      <span className="mt-1 flex items-center rounded-xl bg-brand-bg border border-brand-gold/[0.12] px-3 focus-within:border-brand-gold/40">
        {prefix && <span className="text-sm text-brand-muted mr-1">{prefix}</span>}
        <input
          type="number"
          min={0}
          step={step}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
          className="w-full bg-transparent py-2 text-sm text-brand-cream outline-none"
        />
      </span>
    </label>
  );
}

/** Admin → AI Usage: the month's spend, who's using the assistant, and the caps. */
export function AiUsagePanel() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchApi('/api/admin/ai-usage').then(({ ok, data }) => {
      if (!active) return;
      if (ok) {
        setUsage(data as unknown as Usage);
        setLimits((data as unknown as Usage).limits);
      } else {
        setError(data.error ?? 'Could not load AI usage');
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="bg-brand-card border border-brand-burgundy/30 rounded-2xl p-6 flex items-start gap-3" role="alert">
        <AlertCircle className="w-5 h-5 text-brand-burgundy-light shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-sm text-brand-cream">{error}</p>
      </div>
    );
  }
  if (!usage || !limits) {
    return (
      <p className="text-sm text-brand-muted flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading…
      </p>
    );
  }

  const set = (patch: Partial<Limits>) => setLimits({ ...limits, ...patch });
  const save = async () => {
    setSaving(true);
    const { ok, data } = await fetchApi('/api/admin/ai-usage', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(limits),
    });
    setSaving(false);
    if (!ok) {
      toast.error(data.error);
      return;
    }
    setUsage({ ...usage, limits });
    toast.success('Caps saved. They apply from the next message.');
  };
  const changed = JSON.stringify(limits) !== JSON.stringify(usage.limits);
  const capOf = (level: 'free' | 'member' | 'admin') => (level === 'admin' ? null : usage.limits[level].month);

  return (
    <div className="space-y-6">
      <AiBudgetMeter budget={usage.budget} />

      <section className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold text-brand-cream mb-4">This month by feature</h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(FEATURE_LABELS).map(([feature, label]) => {
            const f = usage.byFeature.find((x) => x.feature === feature);
            return (
              <div key={feature} className="bg-brand-bg rounded-xl p-4">
                <dt className="text-xs text-brand-muted">{label}</dt>
                <dd className="font-display text-lg text-brand-cream">${(f?.costUsd ?? 0).toFixed(2)}</dd>
                <dd className="text-[11px] text-brand-muted">{(f?.calls ?? 0).toLocaleString()} {feature === 'assistant' ? 'messages' : feature === 'transcription' ? 'batches' : 'calls'}</dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-brand-cream">Assistant caps and budget</h2>
          <p className="text-sm text-brand-muted mt-1">
            Questions per account. Admins have no cap. Once the month&apos;s AI spend reaches the pause point, the assistant
            pauses for everyone but admins until the 1st; admin tools keep working up to the budget.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="space-y-3 rounded-xl border border-brand-gold/[0.08] p-4">
            <legend className="px-1 text-sm text-brand-cream">Free accounts</legend>
            <NumberField label="Per day" value={limits.free.day} onChange={(n) => set({ free: { ...limits.free, day: n } })} />
            <NumberField label="Per month" value={limits.free.month} onChange={(n) => set({ free: { ...limits.free, month: n } })} />
          </fieldset>
          <fieldset className="space-y-3 rounded-xl border border-brand-gold/[0.08] p-4">
            <legend className="px-1 text-sm text-brand-cream">Members and donors</legend>
            <NumberField label="Per day" value={limits.member.day} onChange={(n) => set({ member: { ...limits.member, day: n } })} />
            <NumberField label="Per month" value={limits.member.month} onChange={(n) => set({ member: { ...limits.member, month: n } })} />
          </fieldset>
          <NumberField label="Monthly AI budget" prefix="$" step={10} value={limits.monthly_budget_usd} onChange={(n) => set({ monthly_budget_usd: n })} />
          <NumberField label="Pause the assistant at" prefix="$" step={10} value={limits.assistant_pause_usd} onChange={(n) => set({ assistant_pause_usd: n })} />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={!changed || saving} className="rounded-xl bg-brand-gold text-brand-bg hover:bg-brand-gold-light">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : 'Save caps'}
          </Button>
          {changed && (
            <button type="button" onClick={() => setLimits(usage.limits)} className="text-xs text-brand-muted hover:text-brand-cream">
              Undo changes
            </button>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-brand-cream">Who&apos;s using it this month</h2>
        {usage.byUser.length === 0 ? (
          <p className="text-sm text-brand-muted">No one yet.</p>
        ) : (
          <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-brand-muted border-b border-brand-gold/[0.08]">
                  <th className="px-4 py-3 font-semibold">Account</th>
                  <th className="px-4 py-3 font-semibold">Level</th>
                  <th className="px-4 py-3 font-semibold text-right">Questions</th>
                  <th className="px-4 py-3 font-semibold text-right">AI cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-gold/[0.04]">
                {usage.byUser.map((u) => {
                  const cap = capOf(u.level);
                  return (
                    <tr key={u.userId}>
                      <td className="px-4 py-3">
                        <p className="text-brand-cream">{u.name}</p>
                        {u.email && u.email !== u.name && <p className="text-[11px] text-brand-muted">{u.email}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-brand-muted">{LEVEL_LABELS[u.level]}</td>
                      <td className="px-4 py-3 text-right text-brand-cream">
                        {u.messages.toLocaleString()}
                        {cap !== null && <span className="text-brand-muted"> / {cap}</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-brand-cream">${u.costUsd.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
