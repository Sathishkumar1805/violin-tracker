// app/api/notify/route.ts
// Server-side push notification sender for immediate events.
// Called after: practice session complete, streak milestone, achievement unlocked.
// Sends to the student AND their parent (if both have push subscriptions).

import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

type NotifyPayload = {
  type: 'practice-complete' | 'streak' | 'milestone';
  studentId: string;
  durationMinutes?: number;
  gemsEarned?: number;
  streakDays?: number;
  achievementName?: string;
};

const MASCOT_EMOJI: Record<string, string> = {
  bird: '🐦', dog: '🐶', cat: '🐱', rabbit: '🐰', bear: '🐻', fox: '🦊',
};

function buildMessages(payload: NotifyPayload, name: string, mascotType: string) {
  const m = MASCOT_EMOJI[mascotType] ?? '🎻';

  if (payload.type === 'practice-complete') {
    const mins = payload.durationMinutes ?? 0;
    const gems = payload.gemsEarned ?? 0;
    return {
      student: {
        title: `${m} Practice complete!`,
        body: `You practiced ${mins} min and earned ${gems} gems! ✨`,
      },
      parent: {
        title: `🎻 ${name} finished practicing!`,
        body: `${name} practiced ${mins} minutes and earned ${gems} gems! 🌟`,
      },
    };
  }

  if (payload.type === 'streak') {
    const days = payload.streakDays ?? 1;
    return {
      student: {
        title: `🔥 ${days}-day streak!`,
        body: days === 1
          ? `You started a new streak today! Keep it going tomorrow! 💪`
          : `${days} days in a row — ${m} is so proud of you! 🎉`,
      },
      parent: {
        title: `🔥 ${name}'s ${days}-day streak!`,
        body: days === 1
          ? `${name} started a new practice streak today! 🎉`
          : `${name} has practiced ${days} days in a row! Amazing dedication! 🎉`,
      },
    };
  }

  if (payload.type === 'milestone') {
    const ach = payload.achievementName ?? 'a new milestone';
    return {
      student: {
        title: `🏆 New achievement unlocked!`,
        body: `You earned "${ach}"! Keep up the amazing work! 🌟`,
      },
      parent: {
        title: `🏆 ${name} earned an achievement!`,
        body: `${name} just unlocked "${ach}"! Amazing progress! 🎉`,
      },
    };
  }

  return null;
}

export async function POST(req: NextRequest) {
  const vapidPublic  = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY ?? '';
  const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:support@violintracker.app';

  if (!vapidPublic || !vapidPrivate) {
    return NextResponse.json({ error: 'Push notifications not configured' }, { status: 503 });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  let body: NotifyPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, studentId } = body;
  if (!studentId || !type) {
    return NextResponse.json({ error: 'Missing studentId or type' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const sb = createClient(supabaseUrl, serviceKey);

  const { data: student } = await sb
    .from('profiles')
    .select('display_name, parent_id, mascot_type')
    .eq('id', studentId)
    .single();

  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  const recipientIds = [studentId, ...(student.parent_id ? [student.parent_id] : [])];

  const { data: subs } = await sb
    .from('push_subscriptions')
    .select('user_id, subscription')
    .in('user_id', recipientIds);

  if (!subs?.length) return NextResponse.json({ sent: 0 });

  const msgs = buildMessages(body, student.display_name, student.mascot_type ?? 'bird');
  if (!msgs) return NextResponse.json({ error: 'Unknown notification type' }, { status: 400 });

  let sent = 0;
  for (const sub of subs) {
    const isParent = sub.user_id !== studentId;
    const msg      = isParent ? msgs.parent : msgs.student;
    const notifType = isParent ? `${type}-parent` : type;
    const url       = isParent ? '/parent' : '/dashboard';

    try {
      await webpush.sendNotification(
        sub.subscription as webpush.PushSubscription,
        JSON.stringify({ ...msg, type: notifType, url }),
      );
      sent++;
    } catch (err: unknown) {
      if ((err as { statusCode?: number }).statusCode === 410) {
        await sb.from('push_subscriptions').delete().eq('user_id', sub.user_id);
      }
    }
  }

  return NextResponse.json({ sent });
}
