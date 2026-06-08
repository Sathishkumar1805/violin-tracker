// lib/push.ts — Web Push subscription helpers (browser-side only)

// ── Platform detection ────────────────────────────────────────────────────────

export function isPushSupported(): boolean {
  return typeof window !== 'undefined'
    && !!navigator.serviceWorker   // check the value, not just property existence
    && 'PushManager' in window
    && 'Notification' in window;
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isInStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

// ── VAPID key helper ──────────────────────────────────────────────────────────
// Converts the VAPID public key from URL-safe base64 (env var format) to the
// raw bytes the browser's PushManager.subscribe() call expects.

function convertVapidKeyToBytes(base64UrlString: string): Uint8Array {
  const padding = '='.repeat((4 - (base64UrlString.length % 4)) % 4);
  const base64  = (base64UrlString + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

// ── checkPushStatus ───────────────────────────────────────────────────────────
// Returns true if this browser already has an active push subscription.

export async function checkPushStatus(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

// ── getSubscriptionStatus ─────────────────────────────────────────────────────
// Returns a detailed status string used by the push toggle UI.

export type PushStatus =
  | 'not-supported'
  | 'ios-not-installed'
  | 'denied'
  | 'subscribed'
  | 'unsubscribed';

export async function getSubscriptionStatus(): Promise<PushStatus> {
  if (!isPushSupported()) {
    if (isIos() && !isInStandaloneMode()) return 'ios-not-installed';
    return 'not-supported';
  }
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'subscribed' : 'unsubscribed';
  } catch {
    return 'unsubscribed';
  }
}

// ── subscribeToPush ───────────────────────────────────────────────────────────
// Requests permission, registers with the browser push service, then POSTs
// the subscription to /api/push/subscribe to persist it in the database.
// Returns true on success. On failure (permission denied, network error, DB error)
// returns false and rolls back the browser subscription so state stays consistent.

export async function subscribeToPush(userId: string): Promise<boolean> {
  if (!isPushSupported()) return false;

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    console.warn('NEXT_PUBLIC_VAPID_PUBLIC_KEY not set — push notifications disabled');
    return false;
  }

  let sub: PushSubscription | null = null;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const reg = await navigator.serviceWorker.ready;
    sub = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: convertVapidKeyToBytes(vapidKey) as unknown as ArrayBuffer,
    });

    const res = await fetch('/api/push/subscribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        userId,
        subscription: sub.toJSON(),
        userAgent:    navigator.userAgent,
      }),
    });

    if (!res.ok) {
      // Roll back so the toggle stays in sync with what the server knows
      await sub.unsubscribe();
      return false;
    }

    return true;
  } catch (err) {
    console.error('Push subscribe failed:', err);
    if (sub) { try { await sub.unsubscribe(); } catch { /* ignore */ } }
    return false;
  }
}

// ── unsubscribeFromPush ───────────────────────────────────────────────────────
// Cancels the browser subscription and removes the DB record.

export async function unsubscribeFromPush(userId: string): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const reg      = await navigator.serviceWorker.ready;
    const sub      = await reg.pushManager.getSubscription();
    const endpoint = sub?.endpoint;
    if (sub) await sub.unsubscribe();

    await fetch('/api/push/unsubscribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId, endpoint }),
    });
  } catch (err) {
    console.error('Push unsubscribe failed:', err);
  }
}
