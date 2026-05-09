// public/sw.js — Service Worker for Push Notifications
//
// A "service worker" is a tiny background script the browser installs for our app.
// It runs separately from the web page — even when the tab is closed — which is
// why it can receive push notifications from our server at any time.
//
// This file has two responsibilities:
//   1. Show a notification banner when the server sends a push message
//   2. Open the right page in the app when the user taps that banner

// ─── Notification tag map ────────────────────────────────────────────────────
// Each notification type gets a unique "tag" string.
// The tag acts like an ID: if a notification with the same tag already exists
// on the device, the new one replaces it instead of stacking on top.
// That way a student won't see five identical "morning reminder" banners.
// Setting renotify: true (below) still makes the phone vibrate/chime even when
// updating an existing notification, so the user isn't silently ignored.
const NOTIFICATION_TAG_BY_TYPE = {
  reminder_morning:         'practice-reminder-morning',
  reminder_evening:         'practice-reminder-evening',
  reminder_morning_parent:  'practice-reminder-morning-parent',
  reminder_evening_parent:  'practice-reminder-evening-parent',
  'practice-complete':        'practice-complete',
  'practice-complete-parent': 'practice-complete-parent',
  streak:                   'streak-update',
  'streak-parent':            'streak-update-parent',
  milestone:                'milestone',
  'milestone-parent':         'milestone-parent',
};

// ─── Receive a push message from our server ──────────────────────────────────
// This event fires every time our server sends a notification to this device.
// "event.waitUntil" tells the browser to keep the service worker alive until
// the notification is fully displayed — without it the worker might be stopped
// before the banner ever appears.
self.addEventListener('push', event => {
  // Read the JSON data attached to the push message.
  // If the server sent nothing, fall back to a safe empty object.
  const pushData = event.data?.json() ?? {};

  // Determine which kind of notification this is (morning reminder, streak, etc.)
  const notificationType = pushData.type ?? 'reminder';

  // Pick the matching tag, or use a generic fallback
  const notificationTag = NOTIFICATION_TAG_BY_TYPE[notificationType] ?? 'practice-reminder';

  // The page to open when the user taps the banner (e.g. /dashboard or /parent)
  const destinationUrl = pushData.url ?? '/dashboard';

  event.waitUntil(
    self.registration.showNotification(
      // Title shown in bold at the top of the banner
      pushData.title ?? '🎻 Practice Time!',
      {
        // Body text shown below the title
        body:     pushData.body ?? "Don't forget to practice today!",
        // App icon shown in the notification banner
        icon:     '/icon-192.png',
        // Small monochrome icon shown in the phone status bar (Android)
        badge:    '/icon-192.png',
        // Unique identifier for this notification type (prevents stacking)
        tag:      notificationTag,
        // Always vibrate/alert even when updating an existing notification
        renotify: true,
        // Extra data passed through to the click handler below
        data:     { url: destinationUrl },
      }
    )
  );
});

// ─── Handle a tap on the notification banner ─────────────────────────────────
// When the user taps the notification, close it and navigate to the right page.
self.addEventListener('notificationclick', event => {
  const destinationUrl = event.notification.data?.url ?? '/dashboard';

  // Dismiss the banner immediately so it doesn't linger after the tap
  event.notification.close();

  event.waitUntil(
    // Get a list of all open browser tabs/windows that belong to our app
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(openTabs => {
      // If a tab is already showing the destination page, just bring it into focus
      for (const tab of openTabs) {
        if (tab.url.includes(destinationUrl) && 'focus' in tab) {
          return tab.focus();
        }
      }
      // No matching tab found — open a new one
      if (clients.openWindow) return clients.openWindow(destinationUrl);
    })
  );
});
