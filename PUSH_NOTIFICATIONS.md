# 🔔 Push Notifications

This document covers everything about push notifications in the Violin Practice Tracker —
from the basics of how they work, to the exact files involved, to the step-by-step setup guide.

---

## Part 1 — What Are Push Notifications?

A **push notification** is a message that appears on your phone or computer screen even when you don't have the app open. You've seen them: the little banners that say "Your Uber is arriving" or "You have a new email."

For a website (as opposed to a native phone app), these are called **Web Push Notifications** and they work like this:

```
Your server  ──sends message──►  Push Service (Google/Mozilla)  ──delivers──►  User's device
                                  (middle-man run by the browser maker)
```

**In plain English, the chain looks like:**

1. The browser (Chrome, Firefox, Safari) runs a tiny background script on the user's device — called a **service worker** — that stays alive even when the browser tab is closed.
2. That service worker is registered with a **push service** run by the browser maker (Google for Chrome, Mozilla for Firefox, Apple for Safari). Think of it as a post office that holds mail for your device.
3. Our server sends a message to that post office, addressed to this specific device.
4. The post office wakes up the service worker on the device and delivers the message.
5. The service worker shows the notification banner on screen.

**The key pieces that make this secure:**

| Piece | What it is | Plain-English analogy |
|---|---|---|
| **Service Worker** | Background script in the browser | A sleeping postman who wakes up when mail arrives |
| **Push Subscription** | Unique address for this browser on this device | A PO Box number at the post office |
| **VAPID Keys** | A public/private key pair that proves our server is authorised | A sender's licence — the post office checks it before accepting mail |

---

## Part 2 — What Notifications Does This App Send?

There are two kinds of notifications: **immediate** (triggered by an action) and **scheduled** (sent on a timer).

### Immediate notifications
Sent the moment something happens in the app.

| Event | Student receives | Parent receives |
|---|---|---|
| Practice session ends | Duration + gems earned with mascot emoji | Child's session summary |
| Daily streak milestone | Streak count + encouragement | Child's streak count |
| Achievement/badge unlocked | Badge name + celebration | Child's badge name |

### Scheduled reminder notifications
Sent by a background job that runs every hour and checks whether it's reminder time.

| Window | Student receives | Parent receives |
|---|---|---|
| Morning (7–9 AM local time) | "Good morning — start your day with practice!" | "Remind [child] to practice today!" |
| Evening (5–7 PM local time) | Streak-aware nudge ("Don't break your streak!") | "Child's streak is at risk!" or "Hasn't practiced yet" |

Both the student's timezone and the parent's timezone are respected. A student in Chicago and a parent travelling in New York each get reminded at their own local 7 AM.

**Deduplication:** the app keeps a `notification_log` table that records every notification sent. Before sending a reminder, it tries to insert a row for today. If that row already exists (unique constraint), the insert fails and the function knows to skip — so a student never gets the same reminder twice on the same day even if the hourly function runs multiple times.

---

## Part 3 — How It Is Implemented in This App

### Flow diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  SUBSCRIBE FLOW (once per device)                                    │
│                                                                      │
│  User taps 🔔 toggle                                                 │
│      │                                                               │
│      ▼                                                               │
│  Browser shows "Allow notifications?" prompt                         │
│      │  (user clicks Allow)                                          │
│      ▼                                                               │
│  browser.pushManager.subscribe(vapidPublicKey)                       │
│      │  browser contacts Google/Mozilla/Apple push service           │
│      │  and gets back a unique subscription object                   │
│      ▼                                                               │
│  POST /api/save  → saved to push_subscriptions table in Supabase     │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  IMMEDIATE NOTIFICATION FLOW (triggered by app events)               │
│                                                                      │
│  Student stops the timer                                             │
│      │                                                               │
│      ▼                                                               │
│  Timer.tsx  →  POST /api/notify  { type: 'practice-complete', ... }  │
│      │                                                               │
│      ▼                                                               │
│  API route reads push_subscriptions for student + parent             │
│      │                                                               │
│      ▼                                                               │
│  webpush.sendNotification(subscription, message)                     │
│      │  (uses VAPID private key to sign the request)                 │
│      ▼                                                               │
│  Push service delivers to device → service worker wakes up           │
│      │                                                               │
│      ▼                                                               │
│  sw.js  →  self.registration.showNotification(...)                   │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  SCHEDULED REMINDER FLOW (runs every hour via cron)                  │
│                                                                      │
│  Supabase cron triggers  send-reminders  edge function               │
│      │                                                               │
│      ▼                                                               │
│  Loads all push_subscriptions + matching profiles                    │
│      │                                                               │
│      ▼                                                               │
│  For each subscriber:                                                │
│    • Convert UTC now → user's local time                             │
│    • Is it 7–9 AM or 5–7 PM local?  →  no? skip                     │
│    • Has the student practiced today?  →  yes? skip                  │
│    • Already sent this reminder today? (notification_log)  →  skip   │
│    • Send push notification                                           │
└──────────────────────────────────────────────────────────────────────┘
```

### Files involved

| File | Role |
|---|---|
| [`components/ServiceWorkerRegister.tsx`](components/ServiceWorkerRegister.tsx) | Registers the service worker (`/sw.js`) when the app first loads |
| [`public/sw.js`](public/sw.js) | Service worker — receives push events and shows notification banners; handles tap → navigate |
| [`lib/push.ts`](lib/push.ts) | Browser-side helpers: request permission, subscribe, unsubscribe |
| [`lib/supabase.ts`](lib/supabase.ts) | `savePushSubscription` / `deletePushSubscription` — reads and writes the `push_subscriptions` DB table |
| [`app/api/notify/route.ts`](app/api/notify/route.ts) | Server API endpoint (`POST /api/notify`) — sends immediate notifications after practice events |
| [`supabase/functions/send-reminders/index.ts`](supabase/functions/send-reminders/index.ts) | Supabase Edge Function — scheduled hourly; sends morning/evening reminders |
| [`supabase/schema.sql`](supabase/schema.sql) | Defines `push_subscriptions` and `notification_log` tables with RLS policies |

### Database tables

**`push_subscriptions`**
Stores one row per subscribed device. The `subscription` column holds the full JSON object the browser's PushManager returns — it contains the push service endpoint URL and the encryption keys needed to send a message to that specific device.

```
user_id  (UUID)  →  links to the profiles table
subscription (JSONB) →  { endpoint, keys: { p256dh, auth } }
```

**`notification_log`**
Prevents duplicate reminders. One row is inserted the moment a scheduled reminder is sent. The `UNIQUE(user_id, type, local_date)` constraint means a second insert for the same user + type + day fails, and the function knows to skip.

```
user_id    (UUID)  →  who was notified
type       (TEXT)  →  e.g. 'student_morning', 'parent_evening_<child-id>'
local_date (DATE)  →  the user's local calendar date
```

---

## Part 4 — Configuration (Step by Step)

### Prerequisites
- Supabase project set up (see README → Full Supabase Setup)
- `supabase/schema.sql` already run (it creates both `push_subscriptions` and `notification_log`)
- App deployed to Vercel (or running locally with HTTPS — push requires a secure connection)

> **Note:** Push notifications do **not** work on plain `http://` URLs. Vercel deployments are always HTTPS. For local development, Chrome allows `localhost` as an exception.

---

### Step 1 — Generate VAPID Keys

VAPID keys are a one-time setup. They prove to the browser's push service that our server is the authorised sender for this app.

Run this **once** in your terminal:

```bash
npx web-push generate-vapid-keys
```

You'll see output like:

```
Public Key:
BNr8K6pVCNG8jJ-SeDqNMnSU-1GmjJoeM7QbaD9Qsxh...

Private Key:
xhT2yh7grQT_y6ITkyrPaJS1FoU0z5U70q0v4CKm5AY
```

> **Important:** Save both keys somewhere safe (a password manager is ideal).
> If you ever regenerate them, every existing push subscription on every user's device becomes invalid and they will need to re-subscribe.

---

### Step 2 — Set Environment Variables for the Next.js App

These variables control the app server (both local dev and Vercel production).

**For local development** — add to `.env.local`:

```env
# The public key is safe to expose to the browser (it's in the client bundle)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BNr8K6pVCNG8jJ...

# Server-side only — never exposed to the browser
VAPID_PUBLIC_KEY=BNr8K6pVCNG8jJ...
VAPID_PRIVATE_KEY=xhT2yh7grQT_...
VAPID_SUBJECT=mailto:you@example.com

# Supabase service role key — lets /api/notify bypass Row-Level Security
# to read any user's push subscription
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

Get `SUPABASE_SERVICE_ROLE_KEY` from:
> Supabase Dashboard → Settings → API → **service_role** (under "Project API keys")

> **Warning:** The service role key bypasses all security rules. Keep it secret — never put it in client-side code or commit it to a public repository.

**For Vercel production** — add the same five variables in:
> Vercel Dashboard → Your Project → Settings → Environment Variables

After adding them, trigger a redeploy:
> Vercel Dashboard → Deployments → ⋯ (latest) → Redeploy

---

### Step 3 — Set Edge Function Secrets

The scheduled reminder function runs inside Supabase's infrastructure, not on Vercel, so it needs its own copy of the secrets.

In Supabase Dashboard → **Edge Functions → Secrets → Add secret**, add these four:

| Secret name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | Your public VAPID key from Step 1 |
| `VAPID_PRIVATE_KEY` | Your private VAPID key from Step 1 |
| `VAPID_SUBJECT` | `mailto:you@example.com` |
| `CRON_SECRET` | Any random string — used to authenticate the cron caller |

Generate a strong `CRON_SECRET` with:
```bash
openssl rand -hex 32
```

---

### Step 4 — Deploy the Edge Function

Install the Supabase CLI if you haven't already:
```bash
npm install -g supabase
```

Log in and link your project:
```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
```

(`YOUR-PROJECT-REF` is the string in your Supabase project URL: `https://YOUR-PROJECT-REF.supabase.co`)

Deploy the function:
```bash
supabase functions deploy send-reminders
```

---

### Step 5 — Set the Cron Schedule

In Supabase Dashboard → **Edge Functions → send-reminders → Schedule**, add a new schedule:

```
0 * * * *
```

This runs at the top of every hour (e.g. 7:00, 8:00, 9:00 …).

The function does its own time-window check internally — it only sends reminders when the user's **local clock** shows 7–9 AM or 5–7 PM. Running it hourly means reminders are delivered within 60 minutes of the window opening.

Set the Authorization header to:
```
Bearer YOUR-CRON-SECRET
```
(replace with the value you generated in Step 3)

---

### Step 6 — Enable Notifications in the App

Push notifications require the **user** to opt in on each device — neither the app nor the server can force it.

**Student:**
1. Open the app on their phone/browser
2. Go to the **Practice** tab on the dashboard
3. Tap the 🔔 **Practice reminders** toggle
4. When the browser asks "Allow notifications?" → tap **Allow**

**Parent:**
1. Open the parent dashboard on their phone/browser
2. Tap the 🔔 **Practice notifications** toggle
3. Tap **Allow** when prompted

Each person must enable notifications independently on each device they want to receive them on.

---

## Part 5 — Troubleshooting

### The toggle says "Not available in this browser"

**Cause:** The browser doesn't support service workers or the PushManager API.

**Fix options:**
- Use Chrome or Firefox on Android/desktop (best support)
- On iPhone: use Safari 16.4+ and ensure the app is added to the Home Screen as a PWA
- The toggle is hidden automatically in unsupported browsers — no action needed

---

### I toggled the reminder on but never receive notifications

Work through this checklist:

1. **Is Supabase configured?**
   Check `.env.local` — if `NEXT_PUBLIC_SUPABASE_URL` is empty, the app runs in Mock Mode and no subscriptions are saved. The yellow "Mock Mode" banner at the bottom of the screen confirms this.

2. **Is the VAPID public key set?**
   Open browser DevTools → Console. If you see `NEXT_PUBLIC_VAPID_PUBLIC_KEY not set`, the key is missing from `.env.local`.

3. **Did the subscription save to the database?**
   Supabase Dashboard → Table Editor → `push_subscriptions`. There should be a row for your user ID. If there's no row, the anon client insert may have been blocked by Row-Level Security — check that RLS policies from `schema.sql` were applied.

4. **Is `/api/notify` returning an error?**
   Open DevTools → Network tab → stop a practice session → look for the `POST /api/notify` request. If the response is `503 Push notifications not configured`, the VAPID keys or service role key are missing from the server environment.

5. **Did you redeploy after adding Vercel env vars?**
   Environment variables only take effect after a redeploy. Go to Vercel → Deployments → Redeploy.

6. **Is the edge function deployed and scheduled?**
   Supabase → Edge Functions → `send-reminders` should show "Active". The cron schedule should show `0 * * * *`.

---

### Notifications were working but suddenly stopped

**Most likely cause:** VAPID keys were regenerated.

When VAPID keys change, all existing browser subscriptions become invalid. The push service returns HTTP 410 (expired) or 404 (not found) and the app automatically deletes those stale records from `push_subscriptions`.

**Fix:** All users must re-enable push notifications (toggle off → toggle on) to create fresh subscriptions with the new keys.

---

### The browser shows a notification but tapping it does nothing

**Cause:** The service worker's click handler can't find an open tab, or the destination URL (`/dashboard` or `/parent`) isn't matching correctly.

**Fix:** Check `public/sw.js` → `notificationclick` handler. The `tab.url.includes(destinationUrl)` check must match your deployed domain. If the app is on a subpath (e.g. `/violin-tracker/dashboard`), update the URL comparison accordingly.

---

### Reminders send more than once a day

**Cause:** The `notification_log` table is missing or the UNIQUE constraint wasn't created.

**Fix:** Re-run the schema from `supabase/schema.sql` in the Supabase SQL Editor. Look for the `notification_log` table creation and its `UNIQUE(user_id, type, local_date)` constraint.

---

## Quick Reference

| What you need | Where to get it |
|---|---|
| VAPID keys | `npx web-push generate-vapid-keys` (run once, save forever) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role |
| Project ref (for CLI) | Your Supabase URL: `https://YOUR-REF.supabase.co` |
| Valid timezone strings | [IANA timezone list](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) |
| `CRON_SECRET` | `openssl rand -hex 32` |
