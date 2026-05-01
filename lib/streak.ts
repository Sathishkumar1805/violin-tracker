// ─────────────────────────────────────────────────────────
// lib/streak.ts  —  Timezone-aware streak & analytics
// ─────────────────────────────────────────────────────────

import type { PracticeSession } from './types';

/** Convert a Date to YYYY-MM-DD in the given IANA timezone */
function toLocalDate(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-CA', { timeZone: timezone });
}

/** Unique practice dates (YYYY-MM-DD) sorted newest-first. Only completed sessions. */
export function getUniquePracticeDates(sessions: PracticeSession[], timezone: string): string[] {
  const set = new Set(
    sessions
      .filter(s => s.ended_at !== null)
      .map(s => toLocalDate(new Date(s.started_at), timezone)),
  );
  return [...set].sort().reverse();
}

/**
 * Current consecutive-day streak.
 * Grace period: streak is valid if it includes today OR yesterday.
 */
export function calculateStreak(sessions: PracticeSession[], timezone: string): number {
  const dates = getUniquePracticeDates(sessions, timezone);
  if (!dates.length) return 0;

  const today     = toLocalDate(new Date(), timezone);
  const yesterday = toLocalDate(new Date(Date.now() - 86_400_000), timezone);

  if (dates[0] !== today && dates[0] !== yesterday) return 0;

  let streak = 0;
  let cursor = dates[0];
  for (const date of dates) {
    if (date === cursor) {
      streak++;
      const d = new Date(`${cursor}T12:00:00`); // noon avoids DST edge cases
      d.setDate(d.getDate() - 1);
      cursor = toLocalDate(d, timezone);
    } else {
      break;
    }
  }
  return streak;
}

/** boolean[7] for Mon–Sun of the current calendar week (index 0 = Monday) */
export function getWeekPracticeStatus(sessions: PracticeSession[], timezone: string): boolean[] {
  const practiced = new Set(
    sessions
      .filter(s => s.ended_at !== null)
      .map(s => toLocalDate(new Date(s.started_at), timezone)),
  );
  const today = new Date();
  const dow = today.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + mondayOffset + i);
    return practiced.has(toLocalDate(d, timezone));
  });
}

/** Total minutes practiced today in the user's timezone */
export function getPracticedMinutesToday(sessions: PracticeSession[], timezone: string): number {
  const today = toLocalDate(new Date(), timezone);
  const secs = sessions
    .filter(s => s.ended_at !== null && toLocalDate(new Date(s.started_at), timezone) === today)
    .reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
  return Math.floor(secs / 60);
}

/** Total minutes practiced in the current calendar month */
export function getPracticedMinutesThisMonth(sessions: PracticeSession[], timezone: string): number {
  const month = toLocalDate(new Date(), timezone).slice(0, 7); // "YYYY-MM"
  const secs = sessions
    .filter(s => s.ended_at !== null && toLocalDate(new Date(s.started_at), timezone).startsWith(month))
    .reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
  return Math.floor(secs / 60);
}

export interface DayDetail {
  date: string;      // YYYY-MM-DD
  dayLabel: string;  // Mon, Tue, …
  dayDate: string;   // Apr 28
  minutes: number;
  isToday: boolean;
  isFuture: boolean;
}

/**
 * Returns per-day practice minutes for the Mon–Sun week at `weekOffset` from the current week.
 * weekOffset 0 = this week, -1 = last week, -2 = two weeks ago, etc.
 */
export function getWeekDetails(sessions: PracticeSession[], timezone: string, weekOffset = 0): DayDetail[] {
  const secsByDate = new Map<string, number>();
  sessions
    .filter(s => s.ended_at !== null)
    .forEach(s => {
      const d = toLocalDate(new Date(s.started_at), timezone);
      secsByDate.set(d, (secsByDate.get(d) ?? 0) + (s.duration_seconds ?? 0));
    });

  const today = new Date();
  const todayStr = toLocalDate(today, timezone);
  const dow = today.getDay(); // 0 = Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + mondayOffset + i + weekOffset * 7);
    const dateStr = toLocalDate(d, timezone);
    return {
      date: dateStr,
      dayLabel: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
      dayDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timezone }),
      minutes: Math.floor((secsByDate.get(dateStr) ?? 0) / 60),
      isToday: dateStr === todayStr,
      isFuture: dateStr > todayStr,
    };
  });
}
