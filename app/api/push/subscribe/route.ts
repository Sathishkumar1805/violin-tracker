/**
 * POST /api/push/subscribe
 *
 * Saves a push subscription to the database. Called by lib/push.ts after the
 * browser registers a new subscription, and by the service worker when push
 * subscription keys rotate (pushsubscriptionchange event).
 *
 * Uses the service_role key so it can write regardless of RLS.
 * Never expose this route to untrusted callers — it requires userId.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function detectDeviceHint(userAgent: string): 'ios' | 'android' | 'desktop' {
  if (/iPad|iPhone|iPod/.test(userAgent)) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'desktop';
}

export async function POST(req: NextRequest) {
  const sb = getServiceClient();
  if (!sb) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  let body: {
    userId?: string;
    subscription?: Record<string, unknown>;
    userAgent?: string;
    oldEndpoint?: string; // sent by SW pushsubscriptionchange to update by old endpoint
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { userId, subscription, userAgent = '', oldEndpoint } = body;

  if (!subscription) {
    return NextResponse.json({ error: 'subscription required' }, { status: 400 });
  }

  const endpoint = subscription.endpoint as string;
  const keys = (subscription.keys ?? {}) as Record<string, string>;
  const p256dh = keys.p256dh ?? '';
  const auth   = keys.auth   ?? '';

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Subscription missing endpoint or keys' }, { status: 400 });
  }

  const device_hint = detectDeviceHint(userAgent || req.headers.get('user-agent') || '');

  // If the service worker is rotating keys, look up userId from the old endpoint
  let resolvedUserId = userId;
  if (!resolvedUserId && oldEndpoint) {
    const { data } = await sb
      .from('push_subscriptions')
      .select('user_id')
      .eq('endpoint', oldEndpoint)
      .single();
    resolvedUserId = data?.user_id;
  }

  if (!resolvedUserId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const { error } = await sb.from('push_subscriptions').upsert(
    {
      user_id:    resolvedUserId,
      endpoint,
      p256dh,
      auth,
      user_agent: userAgent || null,
      device_hint,
      active:     true,
    },
    { onConflict: 'endpoint' }
  );

  if (error) {
    console.error('[subscribe] DB error:', error.message);
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
