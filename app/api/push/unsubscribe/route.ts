/**
 * POST /api/push/unsubscribe
 *
 * Removes a push subscription from the database. Called by lib/push.ts when
 * the user turns off reminders.
 *
 * Body: { userId, endpoint? }
 * If endpoint is provided, deletes only that device's subscription.
 * Otherwise deletes all subscriptions for the user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  const sb = getServiceClient();
  if (!sb) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  let body: { userId?: string; endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { userId, endpoint } = body;

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  let query = sb.from('push_subscriptions').delete().eq('user_id', userId);
  if (endpoint) {
    query = query.eq('endpoint', endpoint);
  }

  const { error } = await query;

  if (error) {
    console.error('[unsubscribe] DB error:', error.message);
    return NextResponse.json({ error: 'Failed to remove subscription' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
