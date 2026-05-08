'use client';

// components/Timer.tsx
// Start/stop practice timer with:
//   • localStorage persistence (survives page refresh)
//   • Web Audio API "ding" fanfare on session end
//   • Confetti explosion
//   • Gem award calculation
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square } from 'lucide-react';
import { saveSession, updateGems } from '@/lib/supabase';
import type { Profile, PracticeSession } from '@/lib/types';

const LS_KEY = 'violin-tracker-session-start';
const GEMS_PER_MINUTE = 5; // tune this in the README customisation section

interface Props {
  profile: Profile;
  isMock: boolean;
  onSessionComplete: (session: PracticeSession, gemsEarned: number) => void;
}

// ── Sound: four rising sine tones (C5 E5 G5 C6) ──────────
function playDing() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      osc.start(t);
      osc.stop(t + 0.8);
    });
  } catch { /* AudioContext blocked — silently skip */ }
}

// ── Confetti: 60 coloured squares raining from the top ───
function launchConfetti() {
  const container = document.getElementById('confetti-container');
  if (!container) return;
  const colours = ['#5B4FCF', '#F5A623', '#22C981', '#F0506E', '#9B59F5', '#FCD34D', '#38BDF8'];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    const size = 6 + Math.random() * 8;
    el.style.cssText = [
      `position:fixed`,
      `left:${10 + Math.random() * 80}%`,
      `top:${Math.random() * 15}%`,
      `width:${size}px`,
      `height:${size}px`,
      `background:${colours[Math.floor(Math.random() * colours.length)]}`,
      `border-radius:2px`,
      `transform:rotate(${Math.random() * 360}deg)`,
      `animation:confetti-fall ${1.6 + Math.random() * 0.8}s ease-in forwards`,
      `animation-delay:${Math.random() * 0.6}s`,
      `z-index:9999`,
      `pointer-events:none`,
    ].join(';');
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }
}

export default function Timer({ profile, isMock, onSessionComplete }: Props) {
  const [running, setRunning]   = useState(false);
  const [elapsed, setElapsed]   = useState(0);          // seconds
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [msg, setMsg]           = useState('Tap to start today\'s session');
  const intervalRef             = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Restore a session that survived a page refresh ──────
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (!stored) return;
    const t = new Date(stored);
    const secs = Math.floor((Date.now() - t.getTime()) / 1000);
    if (secs > 0 && secs < 7_200) {   // cap at 2 hrs to guard against stale data
      setStartTime(t);
      setElapsed(secs);
      setRunning(true);
      setMsg('Session in progress — keep playing! 🎶');
    } else {
      localStorage.removeItem(LS_KEY);
    }
  }, []);

  // ── Tick every second when running ──────────────────────
  useEffect(() => {
    if (running && startTime) {
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
      }, 1_000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, startTime]);

  function fmt(s: number) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function start() {
    const now = new Date();
    localStorage.setItem(LS_KEY, now.toISOString());
    setStartTime(now);
    setElapsed(0);
    setRunning(true);
    setMsg('Session in progress — keep playing! 🎶');
  }

  const stop = useCallback(async () => {
    if (!startTime) return;
    setRunning(false);
    localStorage.removeItem(LS_KEY);

    const endTime = new Date();
    const durSecs = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

    // Ignore accidental taps < 10 s
    if (durSecs < 10) {
      setMsg('Too short — give it another go! 😊');
      setElapsed(0);
      setStartTime(null);
      return;
    }

    const gems = Math.max(1, Math.floor((durSecs / 60) * GEMS_PER_MINUTE));

    const session: PracticeSession = {
      id: `tmp-${Date.now()}`,
      user_id: profile.id,
      started_at: startTime.toISOString(),
      ended_at: endTime.toISOString(),
      duration_seconds: durSecs,
      notes: null,
      created_at: startTime.toISOString(),
    };

    if (!isMock) {
      const saved = await saveSession({
        user_id: profile.id,
        started_at: startTime.toISOString(),
        ended_at: endTime.toISOString(),
        duration_seconds: durSecs,
        notes: null,
      });
      if (saved) session.id = saved.id;
      await updateGems(profile.id, profile.gems + gems);

      // Fire-and-forget: notify student + parent of completed session
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'practice-complete',
          studentId: profile.id,
          durationMinutes: Math.round(durSecs / 60),
          gemsEarned: gems,
        }),
      }).catch(() => {});
    }

    playDing();
    launchConfetti();
    setMsg(`Well played! +${gems} gems earned ✨`);
    onSessionComplete(session, gems);
    setElapsed(0);
    setStartTime(null);
  }, [startTime, profile, isMock, onSessionComplete]);

  const mins = Math.floor(elapsed / 60);

  return (
    <>
      {/* Portal target for confetti pieces (fixed-position so it overlays everything) */}
      <div id="confetti-container" className="fixed inset-0 pointer-events-none z-50 overflow-hidden" />

      <div className="bg-white rounded-3xl p-5 border border-violet-100 shadow-sm text-center">
        {/* Big timer */}
        <div
          className={`text-6xl font-black mb-1 tabular-nums transition-colors ${running ? 'text-indigo-600' : 'text-indigo-900'}`}
          style={{ fontFamily: 'Nunito, sans-serif', letterSpacing: '-3px' }}
        >
          {fmt(elapsed)}
        </div>

        {/* Sub-message */}
        <p className="text-xs font-semibold text-indigo-400 mb-5 min-h-[18px]">
          {running && mins > 0 ? `${mins} minute${mins !== 1 ? 's' : ''} in — amazing! 🎶` : msg}
        </p>

        {/* CTA button */}
        {!running ? (
          <button
            onClick={start}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-2xl font-black text-lg shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
            style={{ fontFamily: 'Nunito, sans-serif' }}
          >
            <Play size={20} fill="white" />
            Start Practice
          </button>
        ) : (
          <button
            onClick={stop}
            className="w-full py-4 bg-white border-2 border-rose-400 hover:bg-rose-50 active:scale-95 text-rose-500 rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-2"
            style={{ fontFamily: 'Nunito, sans-serif' }}
          >
            <Square size={20} fill="currentColor" />
            Stop &amp; Save
          </button>
        )}

        <p className="text-xs text-indigo-200 font-semibold mt-3">
          Earn {GEMS_PER_MINUTE} gems per minute practiced 💎
        </p>
      </div>

      {/* Confetti keyframes (injected once into the document) */}
      <style>{`
        @keyframes confetti-fall {
          0%   { opacity:1; transform: translateY(0)    rotate(0deg); }
          100% { opacity:0; transform: translateY(650px) rotate(720deg); }
        }
      `}</style>
    </>
  );
}
