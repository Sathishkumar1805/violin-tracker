// ─────────────────────────────────────────────────────────
// lib/supabase.ts  —  DB client + all data-access helpers
//
// MOCK MODE: when NEXT_PUBLIC_SUPABASE_URL is missing or
// starts with "your-", every helper returns empty/null and
// the app falls back to lib/mock-data.ts automatically.
// ─────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Profile, PracticeSession, Reward, Achievement } from './types';

// ── Mock-mode detection ───────────────────────────────────
export const IS_MOCK =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('your-') ||
  process.env.NEXT_PUBLIC_SUPABASE_URL === '';

// ── Singleton client factory ──────────────────────────────
let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (IS_MOCK) return null;
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return _client;
}

// ── Auth ──────────────────────────────────────────────────
export async function signInWithEmail(email: string, password: string) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Supabase not configured');
  return sb.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  const sb = getSupabaseClient();
  await sb?.auth.signOut();
}

// ── Profile ───────────────────────────────────────────────
export async function getProfile(userId: string): Promise<Profile | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data } = await sb.from('profiles').select('*').eq('id', userId).single();
  return data ?? null;
}

export async function updateGems(userId: string, newTotal: number): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;
  await sb.from('profiles').update({ gems: newTotal }).eq('id', userId);
}

// ── Practice Sessions ─────────────────────────────────────
export async function getSessions(userId: string): Promise<PracticeSession[]> {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data } = await sb
    .from('practice_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false });
  return data ?? [];
}

export async function saveSession(
  session: Omit<PracticeSession, 'id' | 'created_at'>,
): Promise<PracticeSession | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data } = await sb.from('practice_sessions').insert(session).select().single();
  return data ?? null;
}

// ── Rewards ───────────────────────────────────────────────
export async function getRewards(forUserId: string): Promise<Reward[]> {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data } = await sb
    .from('rewards')
    .select('*')
    .eq('for_user', forUserId)
    .order('gem_cost', { ascending: true });
  return data ?? [];
}

export async function createReward(
  reward: Omit<Reward, 'id' | 'created_at' | 'redeemed_at' | 'approved_at'>,
): Promise<Reward | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data } = await sb.from('rewards').insert(reward).select().single();
  return data ?? null;
}

export async function redeemReward(rewardId: string): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;
  await sb
    .from('rewards')
    .update({ redeemed_at: new Date().toISOString() })
    .eq('id', rewardId);
}

export async function approveReward(rewardId: string): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;
  await sb
    .from('rewards')
    .update({ approved_at: new Date().toISOString() })
    .eq('id', rewardId);
}

export async function updateMascot(userId: string, mascotType: string): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;
  await sb.from('profiles').update({ mascot_type: mascotType }).eq('id', userId);
}

export async function savePushSubscription(userId: string, subscription: object): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;
  await sb.from('push_subscriptions')
    .upsert({ user_id: userId, subscription }, { onConflict: 'user_id' });
}

export async function deletePushSubscription(userId: string): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;
  await sb.from('push_subscriptions').delete().eq('user_id', userId);
}

export async function updateReward(
  rewardId: string,
  updates: Partial<Pick<Reward, 'title' | 'description' | 'gem_cost' | 'emoji'>>,
): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;
  await sb.from('rewards').update(updates).eq('id', rewardId);
}

// ── Achievements ──────────────────────────────────────────
export async function getAchievements(userId: string): Promise<Achievement[]> {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data } = await sb
    .from('achievements')
    .select('*')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });
  return data ?? [];
}

export async function saveAchievement(
  achievement: Omit<Achievement, 'id' | 'earned_at'>,
): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;
  // UNIQUE(user_id, type) prevents duplicates at the DB level
  await sb.from('achievements').upsert(achievement, { onConflict: 'user_id,type' });
}

// ── Parent helpers ────────────────────────────────────────
export async function getChildren(parentId: string): Promise<Profile[]> {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data } = await sb
    .from('profiles')
    .select('*')
    .eq('parent_id', parentId)
    .eq('role', 'student');
  return data ?? [];
}
