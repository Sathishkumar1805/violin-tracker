// Supabase Edge Function — send scheduled practice reminders via Web Push
//
// Deploy:   supabase functions deploy send-reminders
// Schedule: Supabase Dashboard → Edge Functions → Cron  →  0 * * * *  (every hour)
//           The function checks each user's local time and sends only when it falls
//           inside the morning (07–09) or evening (17–19) window.
//
// Required secrets (Supabase Dashboard → Settings → Edge Functions):
//   VAPID_PUBLIC_KEY      from: npx web-push generate-vapid-keys
//   VAPID_PRIVATE_KEY     from: npx web-push generate-vapid-keys
//   VAPID_SUBJECT         mailto:you@example.com
//   CRON_SECRET           random string to authenticate cron calls

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore — npm: specifier supported in Supabase Deno runtime
import webpush from 'npm:web-push';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY     = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY    = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT        = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@violintracker.app';
const CRON_SECRET          = Deno.env.get('CRON_SECRET');

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────

function toLocalDate(date: Date, tz: string): string {
  return date.toLocaleDateString('en-CA', { timeZone: tz });
}

function localHour(date: Date, tz: string): number {
  return parseInt(date.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }), 10);
}

function calcStreak(sessions: { started_at: string }[], tz: string): number {
  const dates = [...new Set(sessions.map(s => toLocalDate(new Date(s.started_at), tz)))]
    .sort().reverse();
  if (!dates.length) return 0;
  const yesterday = toLocalDate(new Date(Date.now() - 86_400_000), tz);
  if (dates[0] !== yesterday) return 0;
  let streak = 0, cursor = yesterday;
  for (const d of dates) {
    if (d !== cursor) break;
    streak++;
    const prev = new Date(`${cursor}T12:00:00`);
    prev.setDate(prev.getDate() - 1);
    cursor = toLocalDate(prev, tz);
  }
  return streak;
}

// Returns true if the notification was not already logged (i.e. safe to send).
// Uses UNIQUE(user_id, type, local_date) to prevent duplicates per day.
async function canSend(
  sb: ReturnType<typeof createClient>,
  userId: string,
  type: string,
  localDate: string,
): Promise<boolean> {
  const { error } = await sb
    .from('notification_log')
    .insert({ user_id: userId, type, local_date: localDate });
  return !error; // error = UNIQUE violation → already sent today
}

async function pushAndCleanup(
  sb: ReturnType<typeof createClient>,
  subscription: object,
  userId: string,
  payload: object,
): Promise<boolean> {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 410) {
      await sb.from('push_subscriptions').delete().eq('user_id', userId);
    }
    return false;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const sb  = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const now = new Date();
  const since = new Date(Date.now() - 8 * 86_400_000).toISOString();

  // ── Load all push subscriptions with profile data ─────────────────────
  type Profile = {
    id: string;
    display_name: string;
    role: string;
    timezone: string;
    mascot_type: string;
    parent_id: string | null;
  };

  const { data: subs, error } = await sb
    .from('push_subscriptions')
    .select('user_id, subscription, profiles(id, display_name, role, timezone, mascot_type, parent_id)');

  if (error || !subs?.length) {
    return new Response(JSON.stringify({ sent: 0, error: error?.message }), { status: 200 });
  }

  // ── For parent subscribers, load their children's profiles ───────────
  const parentSubIds = subs
    .filter(s => (s.profiles as Profile)?.role === 'parent')
    .map(s => s.user_id);

  type ChildRow = { id: string; display_name: string; timezone: string; mascot_type: string; parent_id: string };
  const childrenByParent: Record<string, ChildRow[]> = {};
  const allStudentIds: string[] = subs
    .filter(s => (s.profiles as Profile)?.role === 'student')
    .map(s => s.user_id);

  if (parentSubIds.length > 0) {
    const { data: children } = await sb
      .from('profiles')
      .select('id, display_name, timezone, mascot_type, parent_id')
      .in('parent_id', parentSubIds);

    for (const c of (children ?? []) as ChildRow[]) {
      if (!childrenByParent[c.parent_id]) childrenByParent[c.parent_id] = [];
      childrenByParent[c.parent_id].push(c);
      allStudentIds.push(c.id);
    }
  }

  // ── Load recent sessions for all students ────────────────────────────
  const { data: allSessions } = await sb
    .from('practice_sessions')
    .select('user_id, started_at')
    .in('user_id', [...new Set(allStudentIds)])
    .not('ended_at', 'is', null)
    .gte('started_at', since);

  const sessionsByUser: Record<string, { started_at: string }[]> = {};
  for (const s of (allSessions ?? [])) {
    (sessionsByUser[s.user_id] ??= []).push(s);
  }

  // ── Process each subscription ─────────────────────────────────────────
  let sent = 0;

  for (const sub of subs) {
    const profile = sub.profiles as Profile | null;
    if (!profile) continue;

    const tz    = profile.timezone ?? 'America/Chicago';
    const h     = localHour(now, tz);
    const today = toLocalDate(now, tz);

    const isMorning = h >= 7 && h < 9;
    const isEvening = h >= 17 && h < 19;
    if (!isMorning && !isEvening) continue;

    const timeWindow = isMorning ? 'morning' : 'evening';

    // ── Student subscriber ────────────────────────────────────────────
    if (profile.role === 'student') {
      const sessions      = sessionsByUser[sub.user_id] ?? [];
      const practicedToday = sessions.some(s => toLocalDate(new Date(s.started_at), tz) === today);
      if (practicedToday) continue;

      if (!await canSend(sb, sub.user_id, `student_${timeWindow}`, today)) continue;

      const streak = calcStreak(sessions, tz);
      const title  = isMorning
        ? `🌅 Good morning, ${profile.display_name}!`
        : streak > 0 ? `⏰ Keep your ${streak}-day streak!` : `⏰ Evening reminder`;
      const body   = isMorning
        ? `Start your day with some violin practice! 🎻`
        : streak > 0
          ? `Don't break your streak, ${profile.display_name}! A few minutes will do! 🎶`
          : `Hey ${profile.display_name}, there's still time to practice tonight! 🎻`;

      if (await pushAndCleanup(sb, sub.subscription, sub.user_id,
        { title, body, type: `reminder_${timeWindow}`, url: '/dashboard' })) sent++;

    // ── Parent subscriber ─────────────────────────────────────────────
    } else if (profile.role === 'parent') {
      const children = childrenByParent[sub.user_id] ?? [];

      for (const child of children) {
        const childTz      = child.timezone ?? tz;
        const childToday   = toLocalDate(now, childTz);
        const childSessions = sessionsByUser[child.id] ?? [];
        const childPracticed = childSessions.some(
          s => toLocalDate(new Date(s.started_at), childTz) === childToday,
        );
        if (childPracticed) continue;

        const logKey = `parent_${timeWindow}_${child.id}`;
        if (!await canSend(sb, sub.user_id, logKey, today)) continue;

        const streak = calcStreak(childSessions, childTz);
        const title  = isMorning
          ? `🌅 Morning reminder — ${child.display_name}`
          : streak > 0
            ? `⏰ ${child.display_name}'s streak is at risk!`
            : `⏰ ${child.display_name} hasn't practiced yet`;
        const body   = isMorning
          ? `Don't forget to schedule practice time for ${child.display_name} today! 🎻`
          : streak > 0
            ? `${child.display_name}'s ${streak}-day streak needs today's session! 🎶`
            : `${child.display_name} hasn't practiced violin yet today. Still time tonight! 🎻`;

        if (await pushAndCleanup(sb, sub.subscription, sub.user_id,
          { title, body, type: `reminder_${timeWindow}_parent`, url: '/parent' })) sent++;
      }
    }
  }

  return new Response(JSON.stringify({ sent }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
