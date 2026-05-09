-- ============================================================
-- Violin Practice Tracker — Database Schema
--
-- HOW TO USE:
--   Supabase Dashboard → SQL Editor → New query → paste this file → Run
--
-- This file creates all the tables, security rules, and indexes the
-- app needs. You can run it multiple times safely — "IF NOT EXISTS"
-- and "OR REPLACE" make every statement idempotent (safe to re-run).
-- ============================================================


-- ── 1. PROFILES ────────────────────────────────────────────────────────────
-- One row per user. Stores everything about a person: their display name,
-- whether they're a student or a parent, how many gems they've earned, etc.
-- The "id" column links directly to Supabase Auth so deleting an auth user
-- also deletes their profile automatically (ON DELETE CASCADE).

CREATE TABLE IF NOT EXISTS profiles (
  id                 UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name       TEXT        NOT NULL,
  -- "student" can log practice and earn gems; "parent" can manage rewards and receive notifications
  role               TEXT        NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'parent')),
  -- Optional link from a student to their parent's profile
  parent_id          UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  -- How many minutes per day the student aims to practice (default 20)
  daily_goal_minutes INTEGER     NOT NULL DEFAULT 20,
  -- Running gem balance earned from practice sessions
  gems               INTEGER     NOT NULL DEFAULT 0,
  -- IANA timezone name (e.g. 'America/Chicago') used to calculate local dates for streaks
  timezone           TEXT        NOT NULL DEFAULT 'America/Chicago',
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ── Auto-create a profile when a new user signs up ───────────────────────────
-- Supabase triggers this function immediately after a new auth user is created,
-- so the app never needs to insert a profile manually.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, role)
  VALUES (
    NEW.id,
    -- Use the display_name from sign-up metadata if provided; fall back to the email prefix
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    -- Use the role from sign-up metadata if provided; default to 'student'
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')
  )
  ON CONFLICT (id) DO NOTHING; -- Safe to run even if a profile already exists
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach the function to the auth.users table so it fires on every new signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ── 2. PRACTICE SESSIONS ────────────────────────────────────────────────────
-- Each row records one practice session: when it started, when it ended,
-- and how long it lasted. The streak-calculation logic reads this table
-- to decide how many consecutive days the student has practiced.

CREATE TABLE IF NOT EXISTS practice_sessions (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  started_at       TIMESTAMPTZ NOT NULL,
  -- ended_at and duration_seconds are NULL while the timer is still running
  ended_at         TIMESTAMPTZ,
  duration_seconds INTEGER,
  -- Optional free-text note the student can add (not currently used by the UI)
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);


-- ── 3. REWARDS ──────────────────────────────────────────────────────────────
-- A parent creates rewards (e.g. "Extra screen time") with a gem cost.
-- When a student has enough gems they can redeem a reward; the parent then
-- approves it so the student can actually claim the prize.

CREATE TABLE IF NOT EXISTS rewards (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  -- The parent who created this reward
  created_by   UUID        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  -- The student this reward is available to
  for_user     UUID        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title        TEXT        NOT NULL,
  description  TEXT,
  -- How many gems the student must spend to redeem this reward
  gem_cost     INTEGER     NOT NULL CHECK (gem_cost > 0),
  emoji        TEXT        DEFAULT '🎁',
  is_active    BOOLEAN     DEFAULT TRUE,
  -- Set when the student clicks "Redeem"; NULL until then
  redeemed_at  TIMESTAMPTZ,
  -- Set when the parent approves the redemption; NULL until then
  approved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);


-- ── 4. ACHIEVEMENTS ─────────────────────────────────────────────────────────
-- Badges/milestones the student earns automatically by reaching practice goals
-- (e.g. "First session", "7-day streak", "100 minutes this month").
-- The UNIQUE constraint means a student can only earn each achievement once.

CREATE TABLE IF NOT EXISTS achievements (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  -- Internal code that identifies which achievement this is (e.g. 'streak_7')
  type         TEXT        NOT NULL,
  -- Gems awarded when this achievement was unlocked (may be 0)
  gems_awarded INTEGER     DEFAULT 0,
  earned_at    TIMESTAMPTZ DEFAULT NOW(),
  -- Prevents the same achievement from being awarded twice to the same student
  UNIQUE(user_id, type)
);


-- ── 5. ROW-LEVEL SECURITY (RLS) ─────────────────────────────────────────────
-- RLS is Supabase's built-in access control. Each policy defines exactly
-- who is allowed to read, write, or delete each row.
-- Rule of thumb: users can only see and change their own data.
-- Parents also get read access to their children's data.

ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewards           ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements      ENABLE ROW LEVEL SECURITY;

-- Profiles: a user can read and update their own profile row
CREATE POLICY "profiles: user can access own row"
  ON profiles FOR ALL
  USING (auth.uid() = id);

-- Profiles: a parent can also read their children's profiles (needed for the parent dashboard)
CREATE POLICY "profiles: parent can read children"
  ON profiles FOR SELECT
  USING (parent_id = auth.uid());

-- Practice sessions: users can read and write only their own sessions
CREATE POLICY "practice_sessions: user can access own sessions"
  ON practice_sessions FOR ALL
  USING (auth.uid() = user_id);

-- Practice sessions: a parent can read their children's sessions
CREATE POLICY "practice_sessions: parent can read children sessions"
  ON practice_sessions FOR SELECT
  USING (
    user_id IN (SELECT id FROM profiles WHERE parent_id = auth.uid())
  );

-- Rewards: a reward is visible to both the parent who created it and the student it's for
CREATE POLICY "rewards: creator or recipient can access"
  ON rewards FOR ALL
  USING (auth.uid() = created_by OR auth.uid() = for_user);

-- Achievements: users can access only their own achievements
CREATE POLICY "achievements: user can access own achievements"
  ON achievements FOR ALL
  USING (auth.uid() = user_id);

-- Achievements: a parent can read their children's achievements
CREATE POLICY "achievements: parent can read children achievements"
  ON achievements FOR SELECT
  USING (
    user_id IN (SELECT id FROM profiles WHERE parent_id = auth.uid())
  );


-- ── 6. INDEXES ──────────────────────────────────────────────────────────────
-- Indexes speed up common lookups. Without them, every query would scan
-- the entire table; with them, the database jumps straight to the right rows.

-- Quickly fetch all sessions for a user sorted by date (used for streak calc)
CREATE INDEX IF NOT EXISTS idx_sessions_user_started
  ON practice_sessions(user_id, started_at DESC);

-- Quickly list rewards for a student filtered by active status
CREATE INDEX IF NOT EXISTS idx_rewards_for_user
  ON rewards(for_user, is_active);

-- Quickly list achievements for a user
CREATE INDEX IF NOT EXISTS idx_achievements_user
  ON achievements(user_id);

-- Quickly find all children linked to a parent
CREATE INDEX IF NOT EXISTS idx_profiles_parent
  ON profiles(parent_id);


-- ── 7. GEM INCREMENT FUNCTION ───────────────────────────────────────────────
-- A helper stored procedure that safely adds gems to a user's balance.
-- Using a server-side function prevents race conditions where two simultaneous
-- requests might both read the same gem total and overwrite each other's update.

CREATE OR REPLACE FUNCTION increment_gems(p_user_id UUID, p_amount INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET gems = gems + p_amount WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permission so any authenticated user (not just admins) can call this function
GRANT EXECUTE ON FUNCTION increment_gems TO authenticated;


-- ── 8. MASCOT & PUSH NOTIFICATIONS ─────────────────────────────────────────

-- Add the mascot column to profiles (safe to run on an existing database)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mascot_type TEXT DEFAULT 'bird';

-- Push subscriptions table
-- When a user enables practice reminders, their browser generates a unique
-- "push subscription" object (contains an endpoint URL and encryption keys).
-- We store that object here so the server can deliver notifications to their device.
-- One row per user — if they re-subscribe, the existing row is updated (upsert).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Each user can have at most one active subscription (UNIQUE enforces this)
  user_id      UUID        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  -- The full subscription object as returned by the browser's PushManager API
  subscription JSONB       NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read and manage their own push subscription
CREATE POLICY "push_subscriptions: user can access own subscription"
  ON push_subscriptions FOR ALL
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id);


-- ── 9. NOTIFICATION LOG ─────────────────────────────────────────────────────
-- Tracks which scheduled reminder notifications have already been sent today.
-- The UNIQUE constraint on (user_id, type, local_date) is the key mechanism:
-- inserting a duplicate row fails, which signals "already sent today — skip".
-- This prevents a student from receiving the same morning reminder five times
-- if the scheduled function runs more than once in the same time window.

CREATE TABLE IF NOT EXISTS notification_log (
  id         UUID  DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID  REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  -- Notification type code, e.g. 'student_morning', 'parent_evening_<child-id>'
  type       TEXT  NOT NULL,
  -- The user's local calendar date when this was sent (e.g. '2025-05-09')
  -- Stored as DATE so comparisons are timezone-aware via the profiles.timezone field
  local_date DATE  NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Core deduplication constraint: one notification per user per type per day
  UNIQUE(user_id, type, local_date)
);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notification log entries
CREATE POLICY "notification_log: user can access own entries"
  ON notification_log FOR ALL
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_notification_log_user_date
  ON notification_log(user_id, local_date DESC);


-- ── FIRST-TIME SETUP (run manually after inviting users) ────────────────────
-- After creating accounts for the parent and student in Supabase Auth,
-- find their UUIDs in the Supabase Dashboard → Authentication → Users
-- and run these three UPDATE statements (replace the placeholder UUIDs).

-- Step 1: Promote the parent account to the 'parent' role
-- UPDATE profiles SET role = 'parent' WHERE id = 'PARENT-UUID-HERE';

-- Step 2: Link the student to their parent
-- UPDATE profiles SET parent_id = 'PARENT-UUID-HERE' WHERE id = 'STUDENT-UUID-HERE';

-- Step 3: Set display names and timezone for each user
-- UPDATE profiles SET display_name = 'Aradhiya', timezone = 'America/Chicago'
--   WHERE id = 'STUDENT-UUID-HERE';
