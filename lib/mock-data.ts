// ─────────────────────────────────────────────────────────
// lib/mock-data.ts  —  Realistic sample data used when
// Supabase env vars are absent (Mock Mode).
// ─────────────────────────────────────────────────────────

import type { Profile, PracticeSession, Reward, Achievement } from './types';

const TZ =
  typeof window !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : 'America/Chicago';

export const MOCK_PROFILE: Profile = {
  id: 'mock-student-id',
  display_name: 'Aradhiya',
  role: 'student',
  parent_id: 'mock-parent-id',
  daily_goal_minutes: 20,
  gems: 120,
  timezone: TZ,
  mascot_type: null,
  created_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
};

export const MOCK_PARENT_PROFILE: Profile = {
  id: 'mock-parent-id',
  display_name: 'Mom',
  role: 'parent',
  parent_id: null,
  daily_goal_minutes: 20,
  gems: 0,
  timezone: TZ,
  mascot_type: null,
  created_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
};

function buildMockSessions(): PracticeSession[] {
  const durations = [8 * 60, 22 * 60, 19 * 60, 25 * 60, 17 * 60];
  return [0, 1, 2, 3, 5].map((daysAgo, i) => {
    const start = new Date();
    start.setDate(start.getDate() - daysAgo);
    start.setHours(16, 30, 0, 0);
    const dur = durations[i];
    const end = new Date(start.getTime() + dur * 1000);
    return {
      id: `mock-session-${i}`,
      user_id: 'mock-student-id',
      started_at: start.toISOString(),
      ended_at: end.toISOString(),
      duration_seconds: dur,
      notes: null,
      created_at: start.toISOString(),
    };
  });
}

export const MOCK_SESSIONS: PracticeSession[] = buildMockSessions();

export const MOCK_REWARDS: Reward[] = [
  { id: 'r1', created_by: 'mock-parent-id', for_user: 'mock-student-id', title: 'Pick Friday Movie', description: "Your choice, no questions asked!", gem_cost: 60, emoji: '🎬', is_active: true, redeemed_at: null, approved_at: null, created_at: new Date().toISOString() },
  { id: 'r2', created_by: 'mock-parent-id', for_user: 'mock-student-id', title: 'Extra 30 Min Game Time', description: 'Tonight after homework', gem_cost: 80, emoji: '🎮', is_active: true, redeemed_at: null, approved_at: null, created_at: new Date().toISOString() },
  { id: 'r3', created_by: 'mock-parent-id', for_user: 'mock-student-id', title: 'Ice Cream Trip', description: 'You pick the flavor!', gem_cost: 100, emoji: '🍦', is_active: true, redeemed_at: null, approved_at: null, created_at: new Date().toISOString() },
  { id: 'r4', created_by: 'mock-parent-id', for_user: 'mock-student-id', title: 'Choose Dinner Tonight', description: 'Pizza, tacos — you decide!', gem_cost: 120, emoji: '🍕', is_active: true, redeemed_at: null, approved_at: null, created_at: new Date().toISOString() },
  { id: 'r5', created_by: 'mock-parent-id', for_user: 'mock-student-id', title: 'Stay Up 30 Min Later', description: 'On a weekend night', gem_cost: 150, emoji: '🌙', is_active: true, redeemed_at: null, approved_at: null, created_at: new Date().toISOString() },
];

export const MOCK_ACHIEVEMENTS: Achievement[] = [
  { id: 'a1', user_id: 'mock-student-id', type: 'first_session', gems_awarded: 25, earned_at: new Date(Date.now() - 5 * 86_400_000).toISOString() },
  { id: 'a2', user_id: 'mock-student-id', type: 'streak_3', gems_awarded: 30, earned_at: new Date(Date.now() - 2 * 86_400_000).toISOString() },
];
