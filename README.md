# 🎻 Violin Practice Tracker

A Duolingo-style daily practice tracker for young violin students. Features a live practice timer, animated violin that fills with color, gem rewards, daily streaks, a mascot buddy with mood expressions, and a full parent dashboard — all in a mobile-first Next.js PWA.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔥 Daily Streak | Timezone-aware streak counter with flame animation and Mon–Sun week dots |
| 🎻 Violin Progress | SVG violin that fills with amber color as practice accumulates; glows at 100% |
| ⏱️ Practice Timer | Start/stop with localStorage persistence (survives page refresh) |
| 🎵 Ding Sound | Web Audio API fanfare plays when a session ends — no audio files needed |
| 🐦 Mascot Buddy | Duolingo-style animal companion (bird, dog, cat, rabbit, bear, fox) with 5 mood states — celebrating when goal is hit, worried when a streak is at risk |
| 🏆 Challenges | Weekly/monthly progress bars and collectable badges |
| 🛍️ Reward Shop | Spend gems on rewards parents define; approval queue in parent view |
| 👩‍👧 Parent Dashboard | Add/edit rewards, approve redemptions, navigate weekly practice history |
| 📅 Weekly History | Prev/Next week navigation with per-day bar chart; green = goal met |
| 🔔 Push Notifications | Daily reminder if the student hasn't practiced; mascot-personalised message |
| 🎭 Mock Mode | Full app preview with sample data — zero setup, zero database |

---

## 🚀 Quick Start (Mock Mode — No Database Required)

```bash
git clone https://github.com/Sathishkumar1805/violin-tracker.git
cd violin-tracker
npm install
npm run dev
```

Open **http://localhost:3000** → tap **Login** → full UI with sample data. No Supabase account needed.

---

## 🗄️ Full Supabase Setup

### Step 1 — Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) → **Start for Free**
2. Create a new project (save the database password somewhere safe)
3. Wait ~2 minutes for provisioning

### Step 2 — Run the Schema

1. In your project: **SQL Editor → New query**
2. Paste the entire contents of `supabase/schema.sql`
3. Click **Run** → you should see "Success. No rows returned"

### Step 3 — Get API Keys

**Settings → API**:
- **Project URL**: looks like `https://xxxxxxxxxxxx.supabase.co`
- **anon / public key**: the long JWT string under "Project API keys"

### Step 4 — Set Environment Variables

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in your values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Optional — required only for push notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
```

### Step 5 — Create Users

In Supabase: **Authentication → Users → Invite user**

Create two accounts, e.g. `aradhiya@family.com` (student) and `mom@family.com` (parent). Then link them in **SQL Editor**:

```sql
-- Paste the UUIDs shown in the Auth → Users table
UPDATE profiles SET role = 'parent'                    WHERE id = 'PASTE-MOM-UUID-HERE';
UPDATE profiles SET parent_id = 'PASTE-MOM-UUID-HERE' WHERE id = 'PASTE-ARADHIYA-UUID-HERE';
UPDATE profiles SET display_name = 'Aradhiya'          WHERE id = 'PASTE-ARADHIYA-UUID-HERE';
UPDATE profiles SET display_name = 'Mom'               WHERE id = 'PASTE-MOM-UUID-HERE';
UPDATE profiles SET timezone = 'America/Chicago'       WHERE id = 'PASTE-ARADHIYA-UUID-HERE';
```

Find valid timezone strings at: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones

### Step 6 — Run

```bash
npm run dev
```

Visit **http://localhost:3000/login**, log in as Aradhiya → student dashboard. Log in as Mom → parent dashboard.

---

## 🔔 Push Notifications Setup

Notifications are sent to both **students** and **parents** for five events:

| Event | Student gets | Parent gets |
|---|---|---|
| Morning reminder (7–9 am local) | "Time to practice!" | "Remind your child to practice today" |
| Evening reminder (5–7 pm local) | Streak-aware nudge | Child's streak at risk / hasn't practiced |
| Practice session complete | Duration + gems earned | Child's session summary |
| Daily streak milestone | Streak count | Child's streak count |
| Achievement unlocked | Badge name | Child's badge name |

### Step 1 — Generate VAPID Keys (do this once)

```bash
npx web-push generate-vapid-keys
```

This prints two keys. Save them somewhere safe — if you regenerate them later all existing push subscriptions stop working.

### Step 2 — Add Environment Variables

**Vercel** (Project → Settings → Environment Variables) — add all five:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public key from Step 1 |
| `VAPID_PUBLIC_KEY` | Same public key (used server-side by `/api/notify`) |
| `VAPID_PRIVATE_KEY` | Private key from Step 1 — keep secret |
| `VAPID_SUBJECT` | `mailto:you@example.com` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → `service_role` |

**Supabase Edge Function secrets** (Dashboard → Edge Functions → Secrets):

| Variable | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | Public key from Step 1 |
| `VAPID_PRIVATE_KEY` | Private key from Step 1 |
| `VAPID_SUBJECT` | `mailto:you@example.com` |
| `CRON_SECRET` | Any random string — e.g. run `openssl rand -hex 32` |

For local development, add the same five Vercel variables to `.env.local`.

### Step 3 — Run the Notification Log SQL

In Supabase → **SQL Editor → New query**, run:

```sql
CREATE TABLE IF NOT EXISTS notification_log (
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type       TEXT NOT NULL,
  local_date TEXT NOT NULL,
  sent_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, type, local_date)
);
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log(user_id, sent_at);
```

This prevents the hourly edge function from sending the same reminder twice in one day.

### Step 4 — Deploy the Edge Function

```bash
supabase functions deploy send-reminders
```

### Step 5 — Set the Cron Schedule to Hourly

In Supabase → **Edge Functions → send-reminders → Cron**, set the schedule to:

```
0 * * * *
```

This runs every hour. The function checks each user's **local time** and only sends when it falls inside the morning (7–9 am) or evening (5–7 pm) window.

### Step 6 — Enable Notifications in the App

- **Student**: dashboard → Practice tab → toggle 🔔 **Practice reminders** → allow when the browser asks
- **Parent**: parent dashboard → toggle 🔔 **Practice notifications** → allow when the browser asks

Both must enable notifications independently to receive them on their own device.

---

## 🌐 Deploying to Vercel (Free Tier)

### 1. Push to GitHub

```bash
git init && git add . && git commit -m "initial commit"
# Create repo on github.com then:
git remote add origin https://github.com/YOUR-USERNAME/violin-tracker.git
git push -u origin main
```

### 2. Import on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repository
3. Framework preset: **Next.js** (auto-detected)
4. Click **Deploy** — first deploy runs in Mock Mode (no env vars yet)

### 3. Add Environment Variables

In Vercel: **Project → Settings → Environment Variables**

Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then:

**Deployments → ⋯ → Redeploy**

Your live URL is now fully connected to Supabase. 🎉

---

## 📱 iPhone Home Screen (PWA)

### Method A — Safari "Add to Home Screen" (Simplest, 30 seconds)

1. Open your Vercel URL in **Safari** on the iPhone
2. Tap the **Share** button (box with upward arrow)
3. Scroll down → **Add to Home Screen**
4. Name it **"Aradhiya's Violin"** → tap **Add**

The app opens full-screen from the home screen with no browser chrome.

### Method B — Shortcuts App (Custom Icon)

1. Open the **Shortcuts** app → tap **+**
2. Add Action → **Open URL** → enter your Vercel URL
3. Tap the shortcut name → rename to **"Practice Time! 🎻"**
4. Tap the share icon → **Add to Home Screen** → choose a custom image

### Method C — True PWA Icons (Optional)

Create `public/icon-192.png` and `public/icon-512.png`:
- 192×192 and 512×512 PNG files
- Suggested design: violet `#5B4FCF` background, 🎻 emoji centered
- A free tool: [favicon.io](https://favicon.io/emoji-favicons/violin/)

The `manifest.json` is already configured — Safari uses it automatically.

---

## 📁 Project Structure

```
violin-tracker/
├── app/
│   ├── globals.css               # Tailwind + custom animations (mascot wobble)
│   ├── layout.tsx                # Root layout, PWA metadata, service worker
│   ├── page.tsx                  # Redirects / → /dashboard
│   ├── login/page.tsx            # Student / parent login
│   ├── dashboard/page.tsx        # Student dashboard (3 tabs)
│   └── parent/page.tsx           # Parent-only dashboard
├── components/
│   ├── StreakBanner.tsx           # Flame streak + Mon–Sun week dots
│   ├── ViolinProgress.tsx        # Animated SVG violin
│   ├── Timer.tsx                 # Start/stop with Web Audio ding
│   ├── ChallengesTab.tsx         # Weekly/monthly challenges + badges
│   ├── RewardStore.tsx           # Gem shop with pending/approved states
│   ├── Mascot.tsx                # Mascot animal with mood expressions
│   ├── MascotPicker.tsx          # Animal switcher (6 options)
│   ├── WeeklyHistory.tsx         # Parent weekly bar chart with navigation
│   └── ServiceWorkerRegister.tsx # Registers /sw.js on mount
├── lib/
│   ├── types.ts                  # All TypeScript interfaces
│   ├── supabase.ts               # DB client + data helpers (IS_MOCK flag)
│   ├── mock-data.ts              # Sample data for Mock Mode
│   ├── streak.ts                 # Timezone-aware streak, analytics & week details
│   ├── challenges.ts             # Challenge evaluation engine
│   └── push.ts                   # Web Push subscribe/unsubscribe helpers
├── public/
│   ├── sw.js                     # Service worker (handles push events)
│   └── manifest.json             # PWA manifest
├── supabase/
│   └── schema.sql                # Full DB schema + RLS policies + indexes
├── .env.local.example            # Environment variable template
└── README.md
```

---

## 🔧 Customisation

| What to change | Where |
|---|---|
| Student's name | `profiles.display_name` in DB (or `MOCK_PROFILE` in `lib/mock-data.ts`) |
| Daily goal | `profiles.daily_goal_minutes` in DB (default: 20 min) |
| Gems per minute | `GEMS_PER_MINUTE` constant in `components/Timer.tsx` (default: 5) |
| Timezone | `profiles.timezone` in DB — any IANA string works |
| Default mascot | `profiles.mascot_type` in DB — one of: `bird`, `dog`, `cat`, `rabbit`, `bear`, `fox` |
| Add challenges | Edit the array returned by `evaluateChallenges()` in `lib/challenges.ts` |
| Colour scheme | Edit Tailwind classes (primary: `indigo-600`, accent: `amber-400`) |

---

## 🔒 Security Notes

- All tables use **Row-Level Security (RLS)** — users can only read/write their own data
- Parents can read (but not write) their children's data via a policy join on `parent_id`
- The `increment_gems` function runs with `SECURITY DEFINER` so clients can't manipulate gem totals directly
- Push subscriptions are stored per-user; the service role key (used only in edge functions) is never exposed to the browser
- Supabase anon key is safe to expose client-side — it can only do what RLS allows

---

## 📜 License

MIT — free to fork, modify, and use for your family.
