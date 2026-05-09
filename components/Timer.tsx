'use client';

// components/Timer.tsx — Practice session timer
//
// This component displays a large MM:SS clock the student taps to start
// and stop their practice session. When stopped it:
//   • Saves the session to the database
//   • Awards gems based on how long they practiced
//   • Plays a four-note fanfare sound
//   • Launches a confetti animation
//   • Sends a push notification to the student and their parent
//
// The timer survives a page refresh by storing the start time in
// localStorage. If the student accidentally closes the tab, they can
// come back and the session will still be running.

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square } from 'lucide-react';
import { saveSession, updateGems } from '@/lib/supabase';
import type { Profile, PracticeSession } from '@/lib/types';

// Key used to persist the session start time across page refreshes
const SESSION_START_KEY = 'violin-tracker-session-start';

// How many gems the student earns per minute of practice (tune this to adjust difficulty)
const GEMS_PER_MINUTE = 5;

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  profile:           Profile;
  isMock:            boolean;                                              // true = no database, demo mode
  onSessionComplete: (session: PracticeSession, gemsEarned: number) => void; // callback to update parent state
}

// ── Fanfare sound ─────────────────────────────────────────────────────────────
// Plays four rising sine-wave tones (C5 → E5 → G5 → C6) using the Web Audio API.
// The tones are generated in real time — no audio file needed.
// If the browser blocks AudioContext (e.g. before a user interaction), we silently skip.
function playFanfare() {
  try {
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    // Each frequency plays 180 ms after the previous one, creating a rising arpeggio
    const noteFrequencies = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    noteFrequencies.forEach((frequency, index) => {
      const oscillator = audioCtx.createOscillator();
      const gainNode   = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type            = 'sine';
      oscillator.frequency.value = frequency;

      // Schedule this note to start after (index × 180 ms) from now
      const startTime = audioCtx.currentTime + index * 0.18;
      gainNode.gain.setValueAtTime(0, startTime);                     // silent at start
      gainNode.gain.linearRampToValueAtTime(0.22, startTime + 0.03); // quick fade in
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.8); // slow fade out

      oscillator.start(startTime);
      oscillator.stop(startTime + 0.8);
    });
  } catch {
    // AudioContext can be blocked in some browsers — silently skip the sound effect
  }
}

// ── Confetti explosion ────────────────────────────────────────────────────────
// Creates 60 coloured squares that rain down from the top of the screen.
// Each square is a temporary DOM element appended to #confetti-container
// (defined in the JSX below) and removed after the animation completes.
function launchConfetti() {
  const container = document.getElementById('confetti-container');
  if (!container) return;

  const confettiColors = ['#5B4FCF', '#F5A623', '#22C981', '#F0506E', '#9B59F5', '#FCD34D', '#38BDF8'];

  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    const size  = 6 + Math.random() * 8; // random size between 6 px and 14 px

    piece.style.cssText = [
      `position:fixed`,
      `left:${10 + Math.random() * 80}%`,                                       // random horizontal position
      `top:${Math.random() * 15}%`,                                              // start near the top
      `width:${size}px`,
      `height:${size}px`,
      `background:${confettiColors[Math.floor(Math.random() * confettiColors.length)]}`,
      `border-radius:2px`,
      `transform:rotate(${Math.random() * 360}deg)`,
      `animation:confetti-fall ${1.6 + Math.random() * 0.8}s ease-in forwards`, // 1.6–2.4 s fall duration
      `animation-delay:${Math.random() * 0.6}s`,
      `z-index:9999`,
      `pointer-events:none`, // pieces should not block clicks on the UI beneath
    ].join(';');

    container.appendChild(piece);
    setTimeout(() => piece.remove(), 3500); // clean up after animation ends
  }
}

// ── Timer component ───────────────────────────────────────────────────────────
export default function Timer({ profile, isMock, onSessionComplete }: Props) {
  const [isRunning,  setIsRunning]  = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);           // total seconds since the session started
  const [sessionStart, setSessionStart] = useState<Date | null>(null);
  const [statusMessage, setStatusMessage] = useState("Tap to start today's session");
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Restore a session that survived a page refresh ────────────────────────
  // If the student refreshed or accidentally closed the tab while practicing,
  // we pick up from where they left off using the start time in localStorage.
  useEffect(() => {
    const storedStartTime = localStorage.getItem(SESSION_START_KEY);
    if (!storedStartTime) return;

    const restoredStart  = new Date(storedStartTime);
    const secondsElapsed = Math.floor((Date.now() - restoredStart.getTime()) / 1000);

    // Ignore stale data older than 2 hours — the student probably forgot to stop the timer
    if (secondsElapsed > 0 && secondsElapsed < 7_200) {
      setSessionStart(restoredStart);
      setElapsedSec(secondsElapsed);
      setIsRunning(true);
      setStatusMessage('Session in progress — keep playing! 🎶');
    } else {
      localStorage.removeItem(SESSION_START_KEY);
    }
  }, []);

  // ── Tick every second while the timer is running ──────────────────────────
  // We recalculate elapsed time from the stored start rather than incrementing
  // a counter, so the clock stays accurate even if the tab is backgrounded.
  useEffect(() => {
    if (isRunning && sessionStart) {
      tickIntervalRef.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - sessionStart.getTime()) / 1000));
      }, 1_000);
    } else {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    }
    return () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    };
  }, [isRunning, sessionStart]);

  // Format seconds as MM:SS for the large timer display
  function formatTime(totalSeconds: number): string {
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  // ── Start the session ─────────────────────────────────────────────────────
  function startSession() {
    const now = new Date();
    // Persist the start time so we can restore it after a page refresh
    localStorage.setItem(SESSION_START_KEY, now.toISOString());
    setSessionStart(now);
    setElapsedSec(0);
    setIsRunning(true);
    setStatusMessage('Session in progress — keep playing! 🎶');
  }

  // ── Stop and save the session ─────────────────────────────────────────────
  // Called when the student taps "Stop & Save". Saves to the database,
  // awards gems, plays the fanfare, fires confetti, and triggers push notifications.
  const stopSession = useCallback(async () => {
    if (!sessionStart) return;

    setIsRunning(false);
    localStorage.removeItem(SESSION_START_KEY); // clear the persisted start time

    const endTime        = new Date();
    const durationSecs   = Math.floor((endTime.getTime() - sessionStart.getTime()) / 1000);

    // Ignore accidental taps — a session under 10 seconds doesn't count
    if (durationSecs < 10) {
      setStatusMessage('Too short — give it another go! 😊');
      setElapsedSec(0);
      setSessionStart(null);
      return;
    }

    // Award at least 1 gem even for very short sessions
    const gemsEarned = Math.max(1, Math.floor((durationSecs / 60) * GEMS_PER_MINUTE));

    // Build a session object with a temporary local ID (replaced by the DB-assigned ID below)
    const completedSession: PracticeSession = {
      id:               `tmp-${Date.now()}`,
      user_id:          profile.id,
      started_at:       sessionStart.toISOString(),
      ended_at:         endTime.toISOString(),
      duration_seconds: durationSecs,
      notes:            null,
      created_at:       sessionStart.toISOString(),
    };

    if (!isMock) {
      // Save the session record to the database
      const savedSession = await saveSession({
        user_id:          profile.id,
        started_at:       sessionStart.toISOString(),
        ended_at:         endTime.toISOString(),
        duration_seconds: durationSecs,
        notes:            null,
      });
      // Use the server-assigned UUID if the save succeeded
      if (savedSession) completedSession.id = savedSession.id;

      // Update the gem balance in the database
      await updateGems(profile.id, profile.gems + gemsEarned);

      // Send "practice complete" push notification to the student and their parent.
      // fire-and-forget: we don't await this because a push failure shouldn't block the UI.
      fetch('/api/notify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:            'practice-complete',
          studentId:       profile.id,
          durationMinutes: Math.round(durationSecs / 60),
          gemsEarned,
        }),
      }).catch(() => {}); // silently ignore network errors
    }

    playFanfare();
    launchConfetti();
    setStatusMessage(`Well played! +${gemsEarned} gems earned ✨`);
    onSessionComplete(completedSession, gemsEarned);
    setElapsedSec(0);
    setSessionStart(null);
  }, [sessionStart, profile, isMock, onSessionComplete]);

  const minutesElapsed = Math.floor(elapsedSec / 60);

  return (
    <>
      {/* Invisible overlay used as the mount point for confetti pieces.
          Fixed position so the pieces float above all other UI. */}
      <div id="confetti-container" className="fixed inset-0 pointer-events-none z-50 overflow-hidden" />

      <div className="bg-white rounded-3xl p-5 border border-violet-100 shadow-sm text-center">
        {/* Large MM:SS clock — turns indigo while the session is running */}
        <div
          className={`text-6xl font-black mb-1 tabular-nums transition-colors ${isRunning ? 'text-indigo-600' : 'text-indigo-900'}`}
          style={{ fontFamily: 'Nunito, sans-serif', letterSpacing: '-3px' }}
        >
          {formatTime(elapsedSec)}
        </div>

        {/* Status message below the clock */}
        <p className="text-xs font-semibold text-indigo-400 mb-5 min-h-[18px]">
          {isRunning && minutesElapsed > 0
            ? `${minutesElapsed} minute${minutesElapsed !== 1 ? 's' : ''} in — amazing! 🎶`
            : statusMessage}
        </p>

        {/* Start / Stop button — switches between the two states */}
        {!isRunning ? (
          <button
            onClick={startSession}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-2xl font-black text-lg shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
            style={{ fontFamily: 'Nunito, sans-serif' }}
          >
            <Play size={20} fill="white" />
            Start Practice
          </button>
        ) : (
          <button
            onClick={stopSession}
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

      {/* Confetti keyframes — injected into the document once alongside the component */}
      <style>{`
        @keyframes confetti-fall {
          0%   { opacity: 1; transform: translateY(0)     rotate(0deg);   }
          100% { opacity: 0; transform: translateY(650px)  rotate(720deg); }
        }
      `}</style>
    </>
  );
}
