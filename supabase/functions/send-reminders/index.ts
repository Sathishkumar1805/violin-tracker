// Supabase Edge Function — Send Scheduled Practice Reminders via Push
//
// This function runs automatically on a cron schedule (every hour).
// It checks each subscribed user's local time, and if it falls inside
// the morning (7–9 AM) or evening (5–7 PM) window AND the student hasn't
// practiced today, it sends a push notification reminder.
//
// ── How to deploy ────────────────────────────────────────────────────────────
//   supabase functions deploy send-reminders
//
// ── How to schedule ──────────────────────────────────────────────────────────
//   Supabase Dashboard → Edge Functions → Cron → Add schedule
//   Cron expression:  0 * * * *   (runs at the top of every hour)
//
// ── Required secrets (Supabase Dashboard → Settings → Edge Functions) ────────
//   VAPID_PUBLIC_KEY   — from: npx web-push generate-vapid-keys
//   VAPID_PRIVATE_KEY  — from: npx web-push generate-vapid-keys
//   VAPID_SUBJECT      — e.g. mailto:you@example.com
//   CRON_SECRET        — a random string to authenticate cron calls (optional but recommended)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore — npm: specifier supported in Supabase Deno runtime
import webpush from 'npm:web-push';

// ── Environment variable setup ────────────────────────────────────────────────
// These values are set as secrets in the Supabase Dashboard and injected
// at runtime by the Deno server — they're never bundled into the function code.
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY     = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY    = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT        = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@violintracker.app';
const CRON_SECRET          = Deno.env.get('CRON_SECRET');

// Register our VAPID keys with the web-push library once at startup
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);


// ─── Date/time helpers ────────────────────────────────────────────────────────

// Convert a UTC Date to a 'YYYY-MM-DD' calendar date string in the user's timezone.
// Example: toLocalDateString(new Date(), 'America/Chicago') → '2025-05-09'
function toLocalDateString(utcDate: Date, timezone: string): string {
  return utcDate.toLocaleDateString('en-CA', { timeZone: timezone });
}

// Return the hour (0–23) in the user's local timezone.
// Used to decide whether the user is in their morning or evening reminder window.
function getLocalHour(utcDate: Date, timezone: string): number {
  return parseInt(
    utcDate.toLocaleString('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }),
    10,
  );
}


// ─── Streak calculation ───────────────────────────────────────────────────────
// Counts how many consecutive days ending with yesterday the student practiced.
// We look at yesterday (not today) because today's session may not have happened yet.
function calculateStreakDays(
  sessions: { started_at: string }[],
  timezone: string,
): number {
  // Deduplicate: get a sorted list of unique practice days (newest first)
  const practiceDays = [
    ...new Set(sessions.map(s => toLocalDateString(new Date(s.started_at), timezone))),
  ].sort().reverse();

  if (!practiceDays.length) return 0;

  // The streak only counts if yesterday was a practice day
  const yesterday = toLocalDateString(new Date(Date.now() - 86_400_000), timezone);
  if (practiceDays[0] !== yesterday) return 0;

  // Walk backwards through the days counting consecutive dates
  let streakCount = 0;
  let expectedDay = yesterday;

  for (const day of practiceDays) {
    if (day !== expectedDay) break; // Gap found — streak ends here
    streakCount++;
    // Move expected day one day earlier
    const previousDay = new Date(`${expectedDay}T12:00:00`);
    previousDay.setDate(previousDay.getDate() - 1);
    expectedDay = toLocalDateString(previousDay, timezone);
  }

  return streakCount;
}


// ─── Deduplication check ──────────────────────────────────────────────────────
// Attempts to insert a row into notification_log for this user + type + date.
// Returns true  → insert succeeded, meaning this notification hasn't been sent today.
// Returns false → insert failed with a UNIQUE violation, meaning it was already sent.
async function hasNotBeenSentToday(
  supabase:  ReturnType<typeof createClient>,
  userId:    string,
  type:      string,
  localDate: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('notification_log')
    .insert({ user_id: userId, type, local_date: localDate });
  // A unique-constraint error means we already logged this notification today
  return !error;
}


// ─── Send push and clean up stale subscriptions ───────────────────────────────
// Sends a push notification to the given subscription.
// If the push service says the subscription is expired or gone (410 or 404),
// the stale record is removed from the database automatically.
// Returns true if the notification was delivered successfully.
async function sendPushAndHandleErrors(
  supabase:     ReturnType<typeof createClient>,
  subscription: object,
  userId:       string,
  payload:      object,
): Promise<boolean> {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (error) {
    const httpStatus = (error as { statusCode?: number }).statusCode;
    // 410 = subscription expired; 404 = subscription endpoint no longer exists
    // Both mean the device can no longer receive push — safe to delete
    if (httpStatus === 410 || httpStatus === 404) {
      await supabase.from('push_subscriptions').delete().eq('user_id', userId);
    }
    return false;
  }
}


// ─── Main request handler ─────────────────────────────────────────────────────
// Supabase calls this function on the cron schedule. The cron runner sends the
// CRON_SECRET in the Authorization header so random internet requests can't
// trigger spurious notifications.
Deno.serve(async (request) => {
  // ── Authenticate the cron caller ─────────────────────────────────────────
  if (CRON_SECRET && request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase  = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const nowUtc    = new Date();

  // Only look at sessions from the past 8 days (more than enough for any streak)
  const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();

  // ── Load all push subscriptions with basic profile data ───────────────────
  // We join to profiles so we know each subscriber's role, timezone, and name
  // without a separate query per user.
  type ProfileRow = {
    id:           string;
    display_name: string;
    role:         string;
    timezone:     string;
    mascot_type:  string;
    parent_id:    string | null;
  };

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('user_id, subscription, profiles(id, display_name, role, timezone, mascot_type, parent_id)');

  if (subscriptionError || !subscriptions?.length) {
    return new Response(
      JSON.stringify({ sent: 0, error: subscriptionError?.message }),
      { status: 200 },
    );
  }

  // ── For parent subscribers: load their children's profiles ────────────────
  // Parents receive reminders about their children, not themselves, so we need
  // to know which children each parent has and those children's timezones.
  const parentSubscriberIds = subscriptions
    .filter(s => (s.profiles as ProfileRow)?.role === 'parent')
    .map(s => s.user_id);

  type ChildProfileRow = {
    id:           string;
    display_name: string;
    timezone:     string;
    mascot_type:  string;
    parent_id:    string;
  };

  // childrenByParentId maps parent user ID → array of child profile rows
  const childrenByParentId: Record<string, ChildProfileRow[]> = {};

  // We also collect all student IDs so we can load their sessions in one query
  const allStudentIds: string[] = subscriptions
    .filter(s => (s.profiles as ProfileRow)?.role === 'student')
    .map(s => s.user_id);

  if (parentSubscriberIds.length > 0) {
    const { data: childProfiles } = await supabase
      .from('profiles')
      .select('id, display_name, timezone, mascot_type, parent_id')
      .in('parent_id', parentSubscriberIds);

    for (const child of (childProfiles ?? []) as ChildProfileRow[]) {
      if (!childrenByParentId[child.parent_id]) childrenByParentId[child.parent_id] = [];
      childrenByParentId[child.parent_id].push(child);
      allStudentIds.push(child.id); // Include this child's sessions in the bulk load below
    }
  }

  // ── Load recent practice sessions for all relevant students ──────────────
  // One query for every student involved (direct subscribers + parents' children).
  const { data: recentSessions } = await supabase
    .from('practice_sessions')
    .select('user_id, started_at')
    .in('user_id', [...new Set(allStudentIds)]) // deduplicate IDs before querying
    .not('ended_at', 'is', null)               // exclude sessions still in progress
    .gte('started_at', eightDaysAgo);

  // Group sessions by student user ID for fast lookup below
  const sessionsByStudentId: Record<string, { started_at: string }[]> = {};
  for (const session of (recentSessions ?? [])) {
    (sessionsByStudentId[session.user_id] ??= []).push(session);
  }

  // ── Process each push subscription ───────────────────────────────────────
  let sentCount = 0;

  for (const sub of subscriptions) {
    const profile = sub.profiles as ProfileRow | null;
    if (!profile) continue; // Skip if the profile join returned nothing (shouldn't happen)

    const timezone   = profile.timezone ?? 'America/Chicago';
    const hourOfDay  = getLocalHour(nowUtc, timezone);
    const todayLocal = toLocalDateString(nowUtc, timezone);

    // Only send notifications during morning (7–9 AM) and evening (5–7 PM) windows
    const isMorningWindow = hourOfDay >= 7 && hourOfDay < 9;
    const isEveningWindow = hourOfDay >= 17 && hourOfDay < 19;
    if (!isMorningWindow && !isEveningWindow) continue;

    const timeWindowLabel = isMorningWindow ? 'morning' : 'evening';

    // ── Student subscriber ────────────────────────────────────────────────
    if (profile.role === 'student') {
      const studentSessions  = sessionsByStudentId[sub.user_id] ?? [];
      const practicedToday   = studentSessions.some(
        (s: { started_at: string }) => toLocalDateString(new Date(s.started_at), timezone) === todayLocal,
      );

      // Don't remind a student who already practiced today
      if (practicedToday) continue;

      // Check deduplication log — skip if we already sent this reminder today
      const notificationKey = `student_${timeWindowLabel}`;
      if (!await hasNotBeenSentToday(supabase, sub.user_id, notificationKey, todayLocal)) continue;

      const currentStreak = calculateStreakDays(studentSessions, timezone);

      const notificationTitle = isMorningWindow
        ? `🌅 Good morning, ${profile.display_name}!`
        : currentStreak > 0
          ? `⏰ Keep your ${currentStreak}-day streak!`
          : `⏰ Evening reminder`;

      const notificationBody = isMorningWindow
        ? `Start your day with some violin practice! 🎻`
        : currentStreak > 0
          ? `Don't break your streak, ${profile.display_name}! A few minutes will do! 🎶`
          : `Hey ${profile.display_name}, there's still time to practice tonight! 🎻`;

      const wasDelivered = await sendPushAndHandleErrors(
        supabase,
        sub.subscription,
        sub.user_id,
        { title: notificationTitle, body: notificationBody, type: `reminder_${timeWindowLabel}`, url: '/dashboard' },
      );
      if (wasDelivered) sentCount++;

    // ── Parent subscriber ─────────────────────────────────────────────────
    } else if (profile.role === 'parent') {
      const linkedChildren = childrenByParentId[sub.user_id] ?? [];

      // Send a separate notification for each child who hasn't practiced yet
      for (const child of linkedChildren) {
        const childTimezone    = child.timezone ?? timezone;
        const childTodayLocal  = toLocalDateString(nowUtc, childTimezone);
        const childSessions    = sessionsByStudentId[child.id] ?? [];
        const childPracticed   = childSessions.some(
          (s: { started_at: string }) => toLocalDateString(new Date(s.started_at), childTimezone) === childTodayLocal,
        );

        // Don't remind a parent whose child has already practiced today
        if (childPracticed) continue;

        // Deduplicate per parent per child per time window per day
        const notificationKey = `parent_${timeWindowLabel}_${child.id}`;
        if (!await hasNotBeenSentToday(supabase, sub.user_id, notificationKey, todayLocal)) continue;

        const childStreak = calculateStreakDays(childSessions, childTimezone);

        const notificationTitle = isMorningWindow
          ? `🌅 Morning reminder — ${child.display_name}`
          : childStreak > 0
            ? `⏰ ${child.display_name}'s streak is at risk!`
            : `⏰ ${child.display_name} hasn't practiced yet`;

        const notificationBody = isMorningWindow
          ? `Don't forget to schedule practice time for ${child.display_name} today! 🎻`
          : childStreak > 0
            ? `${child.display_name}'s ${childStreak}-day streak needs today's session! 🎶`
            : `${child.display_name} hasn't practiced violin yet today. Still time tonight! 🎻`;

        const wasDelivered = await sendPushAndHandleErrors(
          supabase,
          sub.subscription,
          sub.user_id,
          { title: notificationTitle, body: notificationBody, type: `reminder_${timeWindowLabel}_parent`, url: '/parent' },
        );
        if (wasDelivered) sentCount++;
      }
    }
  }

  return new Response(
    JSON.stringify({ sent: sentCount }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
