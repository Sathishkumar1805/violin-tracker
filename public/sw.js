// Service Worker — handles Web Push notifications for practice reminders

self.addEventListener('push', event => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? '🎻 Practice Time!', {
      body: data.body ?? "Don't forget to practice today!",
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'practice-reminder',
      renotify: true,
      data: { url: '/dashboard' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('/dashboard') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/dashboard');
    })
  );
});
