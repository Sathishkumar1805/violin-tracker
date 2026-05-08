// Service Worker — handles Web Push notifications

self.addEventListener('push', event => {
  const data = event.data?.json() ?? {};
  const type = data.type ?? 'reminder';

  // Each notification type gets a unique tag so they stack rather than replace each other.
  // renotify:true re-vibrates even if a same-tag notification already exists.
  const TAG_MAP = {
    'reminder_morning':         'practice-reminder-morning',
    'reminder_evening':         'practice-reminder-evening',
    'reminder_morning_parent':  'practice-reminder-morning-parent',
    'reminder_evening_parent':  'practice-reminder-evening-parent',
    'practice-complete':        'practice-complete',
    'practice-complete-parent': 'practice-complete-parent',
    'streak':                   'streak-update',
    'streak-parent':            'streak-update-parent',
    'milestone':                'milestone',
    'milestone-parent':         'milestone-parent',
  };

  const tag = TAG_MAP[type] ?? 'practice-reminder';
  const url = data.url ?? '/dashboard';

  event.waitUntil(
    self.registration.showNotification(data.title ?? '🎻 Practice Time!', {
      body: data.body ?? "Don't forget to practice today!",
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag,
      renotify: true,
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', event => {
  const url = event.notification.data?.url ?? '/dashboard';
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
