-- ============================================================
-- Violin Practice Tracker — Supabase Database Schema
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- ── 1. Profiles ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                   UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name         TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'parent')),
  parent_id            UUID REFERENCES profiles(id) ON DELETE SET NULL,
  daily_goal_minutes   INTEGER NOT NULL DEFAULT 20,
  gems                 INTEGER NOT NULL DEFAULT 0,
  timezone             TEXT NOT NULL DEFAULT 'America/Chicago',
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on sign-up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)), COALESCE(NEW.raw_user_meta_data->>'role','student'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── 2. Practice Sessions ───────────────────────────────────
CREATE TABLE IF NOT EXISTS practice_sessions (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  started_at       TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ,
  duration_seconds INTEGER,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. Rewards ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rewards (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by   UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  for_user     UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  gem_cost     INTEGER NOT NULL CHECK (gem_cost > 0),
  emoji        TEXT DEFAULT '🎁',
  is_active    BOOLEAN DEFAULT TRUE,
  redeemed_at  TIMESTAMPTZ,
  approved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. Achievements ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS achievements (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type         TEXT NOT NULL,
  gems_awarded INTEGER DEFAULT 0,
  earned_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, type)
);

-- ── 5. Row-Level Security ──────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile: own row" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "profile: parent reads children" ON profiles FOR SELECT USING (parent_id = auth.uid());
CREATE POLICY "session: own rows" ON practice_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "session: parent reads children" ON practice_sessions FOR SELECT USING (user_id IN (SELECT id FROM profiles WHERE parent_id = auth.uid()));
CREATE POLICY "reward: creator or recipient" ON rewards FOR ALL USING (auth.uid() = created_by OR auth.uid() = for_user);
CREATE POLICY "achievement: own rows" ON achievements FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "achievement: parent reads children" ON achievements FOR SELECT USING (user_id IN (SELECT id FROM profiles WHERE parent_id = auth.uid()));

-- ── 6. Indexes ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_user_started ON practice_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_rewards_for_user ON rewards(for_user, is_active);
CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_parent ON profiles(parent_id);

-- ── 7. Helper: increment gems ──────────────────────────────
CREATE OR REPLACE FUNCTION increment_gems(p_user_id UUID, p_amount INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET gems = gems + p_amount WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION increment_gems TO authenticated;

-- ── 8. Mascot & Push Notifications ───────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mascot_type TEXT DEFAULT 'bird';

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push: own subscriptions"
  ON push_subscriptions FOR ALL
  USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- ── First-time setup (run after inviting users) ─────────────
-- UPDATE profiles SET role='parent' WHERE id='PARENT-UUID';
-- UPDATE profiles SET parent_id='PARENT-UUID' WHERE id='STUDENT-UUID';
-- UPDATE profiles SET display_name='Aradhiya', timezone='America/Chicago' WHERE id='STUDENT-UUID';
