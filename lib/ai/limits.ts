import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Profile } from '@/lib/types';
import { AiError, isMissingSchema } from './client';
import { ASSISTANT_MODEL } from './models';
import { totalSpendThisMonth } from './usage';

// Server-only: reads app_settings and reserves usage with the service-role client.

const CapSchema = z.object({ day: z.number().int().min(0), month: z.number().int().min(0) });

export const AiLimitsSchema = z.object({
  free: CapSchema,
  member: CapSchema,
  /** Total AI spend allowed per calendar month (UTC), every feature together. */
  monthly_budget_usd: z.number().min(0),
  /** Spend at which the assistant pauses for everyone but admins, leaving room for admin work. */
  assistant_pause_usd: z.number().min(0),
});

export type AiLimits = z.infer<typeof AiLimitsSchema>;

/** Kevin's numbers (2026-10-25); the admin can change them in app_settings.ai_limits. */
export const DEFAULT_AI_LIMITS: AiLimits = {
  free: { day: 10, month: 50 },
  member: { day: 40, month: 400 },
  monthly_budget_usd: 500,
  assistant_pause_usd: 450,
};

/** The current limits, falling back to the defaults for anything missing or malformed. */
export async function getAiLimits(admin: SupabaseClient): Promise<AiLimits> {
  const { data } = await admin.from('app_settings').select('value').eq('key', 'ai_limits').maybeSingle();
  const parsed = AiLimitsSchema.partial().safeParse(data?.value ?? {});
  return { ...DEFAULT_AI_LIMITS, ...(parsed.success ? parsed.data : {}) };
}

export type AccountLevel = 'free' | 'member' | 'admin';

export function accountLevel(profile: Pick<Profile, 'role' | 'subscription_status'> | null): AccountLevel {
  if (profile?.role === 'admin') return 'admin';
  if (profile?.subscription_status === 'paid' || profile?.subscription_status === 'donor') return 'member';
  return 'free';
}

/** A level's caps; admins have none. */
export function capsFor(level: AccountLevel, limits: AiLimits): { day: number; month: number } | null {
  return level === 'admin' ? null : limits[level];
}

export type CapReason = 'day' | 'month' | 'budget';

export interface Allowance {
  level: AccountLevel;
  caps: { day: number; month: number } | null;
  usedToday: number;
  usedMonth: number;
}

export type Reservation =
  | ({ allowed: true; usageId: string } & Allowance)
  | ({ allowed: false; reason: CapReason } & Allowance);

/**
 * Claims one assistant message against the user's caps and the monthly budget,
 * atomically (see ai_reserve_assistant_message). The reserved row is filled in
 * by finishUsage, or released by failUsage if the message never completes.
 */
export async function reserveAssistantMessage(
  admin: SupabaseClient,
  userId: string,
  level: AccountLevel,
): Promise<Reservation> {
  const limits = await getAiLimits(admin);
  const caps = capsFor(level, limits);
  const { data, error } = await admin.rpc('ai_reserve_assistant_message', {
    p_user_id: userId,
    p_model: ASSISTANT_MODEL,
    p_day_limit: caps?.day ?? null,
    p_month_limit: caps?.month ?? null,
    p_pause_at: level === 'admin' ? null : limits.assistant_pause_usd,
  });
  if (error) throw new Error(`Couldn't check AI usage: ${error.message}`);
  const row = (data as { allowed: boolean; reason: CapReason | null; used_today: number; used_month: number; usage_id: string | null }[])[0];
  const base = { level, caps, usedToday: row.used_today, usedMonth: row.used_month };
  return row.allowed && row.usage_id
    ? { allowed: true, usageId: row.usage_id, ...base }
    : { allowed: false, reason: row.reason ?? 'budget', ...base };
}

/** What the user has used and has left, without reserving anything. */
export async function assistantAllowance(admin: SupabaseClient, userId: string, level: AccountLevel): Promise<Allowance> {
  const [limits, usage] = await Promise.all([
    getAiLimits(admin),
    admin.rpc('ai_assistant_usage', { p_user_id: userId }),
  ]);
  if (usage.error) throw new Error(`Couldn't read AI usage: ${usage.error.message}`);
  const row = (usage.data as { used_today: number; used_month: number }[])[0] ?? { used_today: 0, used_month: 0 };
  return { level, caps: capsFor(level, limits), usedToday: row.used_today, usedMonth: row.used_month };
}

/**
 * Stops an admin AI tool (descriptions, mapping suggestions) once the month's
 * budget is spent. Before ai_features_migration.sql has run there is no usage
 * to measure, so admin tools keep working; the assistant never does without it.
 */
export async function ensureBudget(admin: SupabaseClient): Promise<void> {
  let spent: number;
  try {
    spent = await totalSpendThisMonth(admin);
  } catch (err) {
    if (err instanceof Error && isMissingSchema(err.message)) return;
    throw err;
  }
  const { monthly_budget_usd } = await getAiLimits(admin);
  if (spent >= monthly_budget_usd) {
    throw new AiError(`This month's AI budget ($${monthly_budget_usd}) is used up. It resets on the 1st.`, 402);
  }
}
