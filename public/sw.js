// public/sw.js — Service Worker for Push Notifications
//
// iOS Safari (16.4+) requirements:
//   • App must be installed to home screen (standalone mode)
//   • Only options supported by all browsers should be used (no renotify, no badge on iOS)
//   • showNotification must be wrapped in waitUntil

const CACHE_NAME = 'violin-tracker-v1';
const OFFLINE_ASSETS = ['/', '/dashboard', '/icon-192.png', '/icon-512.png'];

const NOTIFICATION_TAG_BY_TYPE = {
  reminder_morning:           'practice-reminder-morning',
  reminder_evening:           'practice-reminder-evening',
  reminder_morning_parent:    'practice-reminder-morning-parent',
  reminder_evening_parent:    'practice-reminder-evening-parent',
  'practice-complete':        'practice-complete',
  'practice-complete-parent': 'practice-complete-parent',
  streak:                     'streak-update',
  'streak-parent':            'streak-update-parent',
  milestone:                  'milestone',
  'milestone-parent':         'milestone-parent',
};

// ── Lifecycle ─────────────────────────────────────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_ASSETS)).catch(() => {})
  );
  // Take control immediately so pushsubscriptionchange fires on first install
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Remove caches from older versions
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Push event: show notification ─────────────────────────────────────────────

// Receive a push message from the server
self.addEventListener('push', event => {
  const pushData = event.data?.json() ?? {};
  const notificationType = pushData.type ?? 'reminder';
  const notificationTag  = NOTIFICATION_TAG_BY_TYPE[notificationType] ?? 'practice-reminder';
  const destinationUrl   = pushData.url ?? '/dashboard';

  // Build notification options — only use options with broad cross-browser support.
  // iOS Safari does NOT support: renotify, badge, actions, vibrate.
  // Including unsupported options can cause showNotification to silently fail on iOS.
  const options = {
    body:  pushData.body ?? "Don't forget to practice today!",
    icon:  '/icon-192.png',
    tag:   notificationTag,
    data:  { url: destinationUrl },
  };

  event.waitUntil(
    self.registration.showNotification(
      pushData.title ?? '🎻 Practice Time!',
      options
    ).catch(err => {
      // Log but don't rethrow — a notification failure should not break the service worker
      console.error('[SW] showNotification failed:', err);
    })
  );
});

// ── pushsubscriptionchange: re-subscribe when keys rotate ─────────────────────
// Fired by Chrome/iOS when the push server rotates the subscription keys.
// Without this handler the app silently stops receiving push notifications.

self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: event.oldSubscription?.options?.applicationServerKey,
    }).then(newSub => {
      return fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: newSub.toJSON(),
          oldEndpoint:  event.oldSubscription?.endpoint,
        }),
      });
    }).catch(err => {
      console.error('[SW] pushsubscriptionchange re-subscribe failed:', err);
    })
  );
});

// ── Handle a tap on the notification banner ───────────────────────────────────

self.addEventListener('notificationclick', event => {
  const destinationUrl = event.notification.data?.url ?? '/dashboard';
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(openTabs => {
      for (const tab of openTabs) {
        if (tab.url.includes(destinationUrl) && 'focus' in tab) return tab.focus();
      }
      if (clients.openWindow) return clients.openWindow(destinationUrl);
    })
  );
});
