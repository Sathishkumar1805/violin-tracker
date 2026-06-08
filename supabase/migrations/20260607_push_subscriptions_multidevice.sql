-- Migration: multi-device push subscriptions
--
-- The previous schema had UNIQUE on user_id (one subscription per user).
-- This migration replaces it with UNIQUE on endpoint (one row per device/browser),
-- allowing a user to receive push notifications on multiple devices simultaneously.
--
-- IMPORTANT: Existing subscribers will need to re-enable notifications after
-- this migration runs, because the old subscription JSONB data is not migrated.
--
-- Run in: Supabase Dashboard → SQL Editor

-- Drop the old single-device table entirely (no data worth preserving)
DROP TABLE IF EXISTS push_subscriptions CASCADE;

-- Recreate with multi-device schema
CREATE TABLE push_subscriptions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  -- Endpoint URL uniquely identifies a browser/device subscription
  endpoint    TEXT        NOT NULL UNIQUE,
  -- Encryption keys for the Web Push payload
  p256dh      TEXT        NOT NULL,
  auth        TEXT        NOT NULL,
  -- Hint for analytics / debugging (not used for routing)
  device_hint TEXT        NOT NULL DEFAULT 'desktop' CHECK (device_hint IN ('ios', 'android', 'desktop')),
  user_agent  TEXT,
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at on every write
CREATE OR REPLACE FUNCTION update_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_push_subscriptions_updated_at();

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions: user can access own subscriptions"
  ON push_subscriptions FOR ALL
  USING (user_id = auth.uid());

CREATE INDEX idx_push_subscriptions_user
  ON push_subscriptions(user_id);

CREATE INDEX idx_push_subscriptions_active
  ON push_subscriptions(user_id, active);
