// lib/push.ts — Web Push subscription helpers (browser-side only)
//
// "Web Push" is the browser standard that lets a website send notifications
// to a user's device even when the site isn't open.
//
// How it works in plain English:
//   1. The user taps "Enable reminders" in the dashboard.
//   2. The browser shows a "Allow notifications?" permission prompt.
//   3. If the user accepts, the browser registers a unique push subscription
//      (essentially a secret address for this device) with a push service like
//      Google's FCM or Mozilla's autopush.
//   4. We save that address to our database so the server can send messages
//      to this exact device whenever it needs to.
//
// VAPID keys (set in .env.local) are like a "sender licence" — the browser
// checks them to confirm our server is authorised to send to this device.

// ─── Internal helper ─────────────────────────────────────────────────────────
// Converts the VAPID public key from URL-safe base64 text (the format used in
// .env files) to raw bytes (the format the browser's PushManager API requires).
function convertVapidKeyToBytes(base64UrlString: string): Uint8Array<ArrayBuffer> {
  // Base64 strings must be a multiple of 4 chars; pad with '=' if necessary
  const padding   = '='.repeat((4 - (base64UrlString.length % 4)) % 4);
  // URL-safe base64 uses '-' and '_'; standard base64 uses '+' and '/'
  const base64    = (base64UrlString + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawBytes  = atob(base64); // decode base64 → binary string
  const bytes     = new Uint8Array(rawBytes.length);
  for (let i = 0; i < rawBytes.length; i++) bytes[i] = rawBytes.charCodeAt(i);
  return bytes;
}

// ─── checkPushStatus ─────────────────────────────────────────────────────────
// Returns true if this browser already has an active push subscription saved.
// The dashboard uses this on load to decide whether the reminder toggle is ON or OFF.
export async function checkPushStatus(): Promise<boolean> {
  // Push notifications require service worker support AND the PushManager API.
  // Older browsers and iOS Safari (pre-16.4) may not have both.
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

  try {
    // "serviceWorker.ready" resolves once the service worker is active and controlling the page
    const swRegistration      = await navigator.serviceWorker.ready;
    const existingSubscription = await swRegistration.pushManager.getSubscription();
    return !!existingSubscription; // true = already subscribed, false = not subscribed
  } catch {
    return false;
  }
}

// ─── subscribeToPush ─────────────────────────────────────────────────────────
// Walks through the full subscription flow:
//   1. Requests permission from the user
//   2. Registers the device with the browser's push service
//   3. Saves the subscription to our database
//
// Returns true if the user is now subscribed and ready to receive notifications.
// Returns false if the user denied permission, the browser doesn't support push,
// or saving to the database failed.
export async function subscribeToPush(userId: string): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

  // The public VAPID key is embedded in the client bundle via NEXT_PUBLIC_ prefix.
  // If it's missing, push is disabled (usually means .env.local isn't configured).
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    console.warn('NEXT_PUBLIC_VAPID_PUBLIC_KEY not set — push notifications disabled');
    return false;
  }

  try {
    // ── Step 1: Ask the user for permission ──────────────────────────────────
    // The browser shows its native "Allow notifications?" dialog.
    const permissionResult = await Notification.requestPermission();
    if (permissionResult !== 'granted') return false; // User said no or dismissed

    // ── Step 2: Register with the browser's push service ────────────────────
    // The browser contacts e.g. Google FCM and gets back a unique endpoint URL
    // for this device + this app combination. We pass our VAPID key so the push
    // service knows only our server is allowed to use that endpoint.
    const swRegistration  = await navigator.serviceWorker.ready;
    const pushSubscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly:    true,                                   // Required: we promise to only notify for visible events
      applicationServerKey: convertVapidKeyToBytes(vapidPublicKey), // Our VAPID "sender licence"
    });

    // ── Step 3: Save the subscription to our database ────────────────────────
    // The subscription object contains the endpoint URL and encryption keys
    // the server needs to actually send a notification to this device later.
    const { savePushSubscription } = await import('./supabase');
    const savedSuccessfully = await savePushSubscription(userId, pushSubscription.toJSON() as object);

    if (!savedSuccessfully) {
      // The browser subscription was created but we couldn't store it.
      // Roll it back so the toggle state stays consistent with what the server knows.
      await pushSubscription.unsubscribe();
      return false;
    }

    return true;
  } catch (error) {
    console.error('Push subscribe failed:', error);
    return false;
  }
}

// ─── unsubscribeFromPush ─────────────────────────────────────────────────────
// Turns off push notifications for this user on this device:
//   1. Tells the browser to cancel its push subscription (stops push service delivering to us)
//   2. Removes the subscription record from our database (server stops trying to send)
export async function unsubscribeFromPush(userId: string): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  try {
    const swRegistration   = await navigator.serviceWorker.ready;
    const pushSubscription  = await swRegistration.pushManager.getSubscription();

    // Cancel the browser-side subscription if one exists
    if (pushSubscription) await pushSubscription.unsubscribe();

    // Remove from the database so the server won't attempt to notify this device
    const { deletePushSubscription } = await import('./supabase');
    await deletePushSubscription(userId);
  } catch (error) {
    console.error('Push unsubscribe failed:', error);
  }
}
