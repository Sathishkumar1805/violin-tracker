// lib/supabase.ts — Database client and all data-access helpers
//
// Supabase is the hosted PostgreSQL database that stores all app data
// (profiles, practice sessions, rewards, achievements, push subscriptions).
// Every function in this file talks to that database.
//
// ── Mock Mode ────────────────────────────────────────────────────────────────
// When NEXT_PUBLIC_SUPABASE_URL is missing or blank in .env.local, the app
// switches into "Mock Mode" automatically. In Mock Mode every function below
// returns safe empty/null values and the UI falls back to lib/mock-data.ts,
// so the app still runs without a real database (great for local demos).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Profile, PracticeSession, Reward, Achievement } from './types';

// ── Mock-mode detection ───────────────────────────────────────────────────────
// IS_MOCK is true when the Supabase URL hasn't been filled in yet.
export const IS_MOCK =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('your-') ||
  process.env.NEXT_PUBLIC_SUPABASE_URL === '';

// ── Singleton database client ─────────────────────────────────────────────────
// We create only one Supabase client instance for the entire app lifetime.
// Creating a new client on every function call would be wasteful and could
// cause connection limit issues in production.
let _supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (IS_MOCK) return null; // No database in mock mode
  if (!_supabaseClient) {
    _supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return _supabaseClient;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

// Sign in an existing user with email and password.
// Returns the Supabase auth result (includes the user session on success).
export async function signInWithEmail(email: string, password: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');
  return supabase.auth.signInWithPassword({ email, password });
}

// Sign the current user out and clear their session.
export async function signOut() {
  const supabase = getSupabaseClient();
  await supabase?.auth.signOut();
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILES
// A profile holds the user's display name, role (student / parent),
// gem balance, daily goal, timezone, and mascot choice.
// ─────────────────────────────────────────────────────────────────────────────

// Load a single user's full profile by their user ID.
export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
  return data ?? null;
}

// Update the gem total for a user (called after a practice session ends).
export async function updateGems(userId: string, newGemTotal: number): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.from('profiles').update({ gems: newGemTotal }).eq('id', userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// PRACTICE SESSIONS
// Each session records when practice started, when it ended, and how long
// it lasted (in seconds). Sessions are the core data the streak logic uses.
// ─────────────────────────────────────────────────────────────────────────────

// Load all practice sessions for a user, newest first.
export async function getSessions(userId: string): Promise<PracticeSession[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from('practice_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false });
  return data ?? [];
}

// Save a completed practice session to the database.
// Returns the saved session (including the server-assigned ID) or null on failure.
export async function saveSession(
  session: Omit<PracticeSession, 'id' | 'created_at'>,
): Promise<PracticeSession | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.from('practice_sessions').insert(session).select().single();
  return data ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// REWARDS
// Rewards are incentives (e.g. "extra screen time") created by a parent for
// a student to redeem with gems they've earned through practice.
// ─────────────────────────────────────────────────────────────────────────────

// Load all active rewards available to a specific student.
export async function getRewards(studentUserId: string): Promise<Reward[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from('rewards')
    .select('*')
    .eq('for_user', studentUserId)
    .order('gem_cost', { ascending: true });
  return data ?? [];
}

// Create a new reward (called by the parent when setting up the reward store).
export async function createReward(
  reward: Omit<Reward, 'id' | 'created_at' | 'redeemed_at' | 'approved_at'>,
): Promise<Reward | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.from('rewards').insert(reward).select().single();
  return data ?? null;
}

// Mark a reward as redeemed (student spent their gems on it).
export async function redeemReward(rewardId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase
    .from('rewards')
    .update({ redeemed_at: new Date().toISOString() })
    .eq('id', rewardId);
}

// Mark a reward as approved (parent confirmed the student can have it).
export async function approveReward(rewardId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase
    .from('rewards')
    .update({ approved_at: new Date().toISOString() })
    .eq('id', rewardId);
}

// Update the details of an existing reward (title, description, cost, emoji).
export async function updateReward(
  rewardId: string,
  updates: Partial<Pick<Reward, 'title' | 'description' | 'gem_cost' | 'emoji'>>,
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.from('rewards').update(updates).eq('id', rewardId);
}

// ─────────────────────────────────────────────────────────────────────────────
// MASCOT
// Each student can pick a mascot character (bird, dog, cat, etc.) that appears
// on their dashboard and reacts to how much they've practiced.
// ─────────────────────────────────────────────────────────────────────────────

// Save the student's mascot choice to their profile.
export async function updateMascot(userId: string, mascotType: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.from('profiles').update({ mascot_type: mascotType }).eq('id', userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// PUSH SUBSCRIPTIONS
// A push subscription is the browser-generated address the server uses to
// send a notification to a specific device. One row per user per device.
// ─────────────────────────────────────────────────────────────────────────────

// Save (or update) a push subscription for a user.
// Uses upsert so calling this a second time updates the existing row instead
// of creating a duplicate.
// Returns true if the save succeeded, false if it failed (e.g. RLS blocked it).
export async function savePushSubscription(userId: string, subscription: object): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false; // Can't save in mock mode
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ user_id: userId, subscription }, { onConflict: 'user_id' });
  if (error) console.error('savePushSubscription failed:', error.message);
  return !error;
}

// Remove a user's push subscription so the server stops sending them notifications.
export async function deletePushSubscription(userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.from('push_subscriptions').delete().eq('user_id', userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// ACHIEVEMENTS
// Achievements (also called challenges/milestones) are badges earned for
// reaching practice goals. The database enforces uniqueness so a student
// can't earn the same achievement twice.
// ─────────────────────────────────────────────────────────────────────────────

// Load all achievements earned by a user, most recent first.
export async function getAchievements(userId: string): Promise<Achievement[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from('achievements')
    .select('*')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });
  return data ?? [];
}

// Record a newly earned achievement.
// The database's UNIQUE(user_id, type) constraint prevents duplicates automatically.
export async function saveAchievement(
  achievement: Omit<Achievement, 'id' | 'earned_at'>,
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.from('achievements').upsert(achievement, { onConflict: 'user_id,type' });
}

// ─────────────────────────────────────────────────────────────────────────────
// PARENT HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Load all student profiles that are linked to a given parent account.
export async function getChildren(parentUserId: string): Promise<Profile[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('parent_id', parentUserId)
    .eq('role', 'student');
  return data ?? [];
}
