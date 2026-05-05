// ─────────────────────────────────────────────────────────
// lib/types.ts  —  Shared TypeScript interfaces
// ─────────────────────────────────────────────────────────

export type UserRole = 'student' | 'parent';

/** Extends auth.users with app-specific fields */
export interface Profile {
  id: string;
  display_name: string;
  role: UserRole;
  parent_id: string | null;
  daily_goal_minutes: number;
  gems: number;
  timezone: string; // IANA timezone string, e.g. "America/Chicago"
  mascot_type: string | null;  // student's chosen mascot animal
  created_at: string;
}

/** One timed practice session */
export interface PracticeSession {
  id: string;
  user_id: string;
  started_at: string;    // ISO 8601
  ended_at: string | null;
  duration_seconds: number | null;
  notes: string | null;
  created_at: string;
}

/** A reward defined by a parent, redeemable with gems */
export interface Reward {
  id: string;
  created_by: string;    // parent's user id
  for_user: string;      // student's user id
  title: string;
  description: string | null;
  gem_cost: number;
  emoji: string;
  is_active: boolean;
  redeemed_at: string | null;  // set when student redeems
  approved_at: string | null;  // set when parent approves
  created_at: string;
}

/** An earned achievement / badge */
export interface Achievement {
  id: string;
  user_id: string;
  type: string;          // e.g. "streak_5", "monthly_10h"
  gems_awarded: number;
  earned_at: string;
}

/** Evaluated challenge shown in the Challenges tab */
export interface Challenge {
  id: string;
  title: string;
  description: string;
  emoji: string;
  type: 'weekly' | 'monthly' | 'onetime';
  gemsReward: number;
  current: number;       // progress toward target
  target: number;
  completed: boolean;
}
