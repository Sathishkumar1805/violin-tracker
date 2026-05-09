// app/api/notify/route.ts — Server-side push notification sender
//
// This is an API endpoint (POST /api/notify) called by the app immediately
// after certain events happen:
//   • A student finishes a practice session
//   • A student keeps or starts a daily streak
//   • A student unlocks a new achievement/milestone
//
// For each event the server:
//   1. Looks up the student's name and mascot in the database
//   2. Finds all push subscriptions for the student AND their parent
//   3. Builds personalised notification messages for each recipient
//   4. Sends the notifications via the web-push protocol
//   5. Removes any stale/expired subscriptions it discovers along the way

import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

// ─── Types ───────────────────────────────────────────────────────────────────

// Shape of the JSON body the client sends when calling this endpoint
type NotifyRequestPayload = {
  type:              'practice-complete' | 'streak' | 'milestone';
  studentId:         string;
  durationMinutes?:  number; // how long the session was (for practice-complete)
  gemsEarned?:       number; // gems awarded this session (for practice-complete)
  streakDays?:       number; // current streak length (for streak)
  achievementName?:  string; // display name of the achievement (for milestone)
};

// Shape of the notification content we build for each recipient
type NotificationContent = {
  title: string;
  body:  string;
};

// Pair of messages — one for the student, one for their parent
type RecipientMessages = {
  student: NotificationContent;
  parent:  NotificationContent;
};

// ─── Mascot emoji lookup ──────────────────────────────────────────────────────
// Maps each mascot type (stored in the database) to its emoji.
// Used to personalise the notification with the student's chosen mascot character.
const MASCOT_EMOJI_BY_TYPE: Record<string, string> = {
  bird:   '🐦',
  dog:    '🐶',
  cat:    '🐱',
  rabbit: '🐰',
  bear:   '🐻',
  fox:    '🦊',
};

// ─── buildNotificationMessages ────────────────────────────────────────────────
// Creates the title and body text for both the student and their parent,
// tailored to the event type (practice complete, streak, or milestone).
// Returns null for unknown event types so the caller can return a 400 error.
function buildNotificationMessages(
  payload:     NotifyRequestPayload,
  studentName: string,
  mascotType:  string,
): RecipientMessages | null {
  // Fall back to the violin emoji if the mascot type isn't in our lookup table
  const mascotEmoji = MASCOT_EMOJI_BY_TYPE[mascotType] ?? '🎻';

  // ── Practice session complete ─────────────────────────────────────────────
  if (payload.type === 'practice-complete') {
    const minutes   = payload.durationMinutes ?? 0;
    const gems      = payload.gemsEarned ?? 0;
    return {
      student: {
        title: `${mascotEmoji} Practice complete!`,
        body:  `You practiced ${minutes} min and earned ${gems} gems! ✨`,
      },
      parent: {
        title: `🎻 ${studentName} finished practicing!`,
        body:  `${studentName} practiced ${minutes} minutes and earned ${gems} gems! 🌟`,
      },
    };
  }

  // ── Daily streak notification ─────────────────────────────────────────────
  if (payload.type === 'streak') {
    const streakDays = payload.streakDays ?? 1;
    return {
      student: {
        title: `🔥 ${streakDays}-day streak!`,
        body:  streakDays === 1
          ? `You started a new streak today! Keep it going tomorrow! 💪`
          : `${streakDays} days in a row — ${mascotEmoji} is so proud of you! 🎉`,
      },
      parent: {
        title: `🔥 ${studentName}'s ${streakDays}-day streak!`,
        body:  streakDays === 1
          ? `${studentName} started a new practice streak today! 🎉`
          : `${studentName} has practiced ${streakDays} days in a row! Amazing dedication! 🎉`,
      },
    };
  }

  // ── Achievement / milestone unlocked ─────────────────────────────────────
  if (payload.type === 'milestone') {
    const achievementTitle = payload.achievementName ?? 'a new milestone';
    return {
      student: {
        title: `🏆 New achievement unlocked!`,
        body:  `You earned "${achievementTitle}"! Keep up the amazing work! 🌟`,
      },
      parent: {
        title: `🏆 ${studentName} earned an achievement!`,
        body:  `${studentName} just unlocked "${achievementTitle}"! Amazing progress! 🎉`,
      },
    };
  }

  return null; // Unknown notification type
}

// ─── POST /api/notify ─────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // ── Validate VAPID keys ───────────────────────────────────────────────────
  // VAPID (Voluntary Application Server Identification) keys prove to the push
  // service (e.g. Google FCM) that our server is authorised to send notifications.
  // They must be set in .env.local; without them push is impossible.
  const vapidPublicKey  = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? '';
  const vapidContact    = process.env.VAPID_SUBJECT ?? 'mailto:support@violintracker.app';

  if (!vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ error: 'Push notifications not configured' }, { status: 503 });
  }

  // Register our VAPID credentials with the web-push library for this request
  webpush.setVapidDetails(vapidContact, vapidPublicKey, vapidPrivateKey);

  // ── Parse the request body ────────────────────────────────────────────────
  let requestPayload: NotifyRequestPayload;
  try {
    requestPayload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, studentId } = requestPayload;
  if (!studentId || !type) {
    return NextResponse.json({ error: 'Missing studentId or type' }, { status: 400 });
  }

  // ── Connect to the database ───────────────────────────────────────────────
  // We use the service role key here (not the anonymous key) so we can read
  // any user's push subscriptions regardless of Row-Level Security policies.
  // This key must never be exposed to the browser — it lives only on the server.
  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // ── Fetch the student's profile ───────────────────────────────────────────
  // We need their display name (for personalised messages) and parent_id
  // (so we can also notify the parent).
  const { data: studentProfile } = await supabase
    .from('profiles')
    .select('display_name, parent_id, mascot_type')
    .eq('id', studentId)
    .single();

  if (!studentProfile) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  // ── Collect all recipient user IDs ────────────────────────────────────────
  // Always includes the student; adds the parent if one is linked to the account.
  const recipientUserIds = [
    studentId,
    ...(studentProfile.parent_id ? [studentProfile.parent_id] : []),
  ];

  // ── Load push subscriptions for all recipients ────────────────────────────
  // Each row contains the unique push endpoint URL and encryption keys
  // the server needs to deliver a notification to that device.
  const { data: pushSubscriptions } = await supabase
    .from('push_subscriptions')
    .select('user_id, subscription')
    .in('user_id', recipientUserIds);

  // If nobody has enabled push notifications, there's nothing to send
  if (!pushSubscriptions?.length) return NextResponse.json({ sent: 0 });

  // ── Build the notification text ───────────────────────────────────────────
  const notificationMessages = buildNotificationMessages(
    requestPayload,
    studentProfile.display_name,
    studentProfile.mascot_type ?? 'bird',
  );

  if (!notificationMessages) {
    return NextResponse.json({ error: 'Unknown notification type' }, { status: 400 });
  }

  // ── Send a notification to each subscribed device ─────────────────────────
  let sentCount = 0;

  for (const recipientSub of pushSubscriptions) {
    // Decide which message variant to use based on whether this is the parent or the student
    const isParent          = recipientSub.user_id !== studentId;
    const messageContent    = isParent ? notificationMessages.parent : notificationMessages.student;
    const notificationType  = isParent ? `${type}-parent` : type;
    const destinationUrl    = isParent ? '/parent' : '/dashboard';

    try {
      await webpush.sendNotification(
        recipientSub.subscription as webpush.PushSubscription,
        // The service worker receives this JSON string and uses it to show the banner
        JSON.stringify({ ...messageContent, type: notificationType, url: destinationUrl }),
      );
      sentCount++;
    } catch (error: unknown) {
      // HTTP 410 = subscription expired; HTTP 404 = subscription no longer exists.
      // In both cases, remove the stale record so we don't waste time on it again.
      const httpStatus = (error as { statusCode?: number }).statusCode;
      if (httpStatus === 410 || httpStatus === 404) {
        await supabase.from('push_subscriptions').delete().eq('user_id', recipientSub.user_id);
      }
    }
  }

  return NextResponse.json({ sent: sentCount });
}
