// components/ViolinProgress.tsx
// Animated SVG violin that fills with warm amber color as practice accumulates.
// Fill grows from the bottom; a shine overlay fades in above 60%; sparkles at 100%.
'use client';

import { useEffect, useRef } from 'react';

interface Props {
  minutesToday: number;
  goalMinutes: number;
}

export default function ViolinProgress({ minutesToday, goalMinutes }: Props) {
  const pct = Math.min(1, minutesToday / goalMinutes);

  // Violin body occupies y=37 to y=195 (158px tall in SVG coords)
  const BODY_TOP = 37;
  const BODY_BOTTOM = 195;
  const BODY_H = BODY_BOTTOM - BODY_TOP; // 158

  const fillPx = Math.round(BODY_H * pct);          // pixels filled from bottom
  const fillY  = BODY_BOTTOM - fillPx;              // rect's top edge

  const isComplete = pct >= 1;
  const shineOpacity = pct > 0.6 ? Math.min(1, (pct - 0.6) / 0.4) : 0;

  const milestones = [0.25, 0.5, 0.75, 1.0].map((p) => ({
    label: p < 1 ? `${Math.round(p * goalMinutes)}m` : 'Done!',
    hit: pct >= p,
  }));

  // Animate milestone star pop when newly hit
  const prevPct = useRef(pct);
  useEffect(() => {
    prevPct.current = pct;
  }, [pct]);

  return (
    <div className="bg-white rounded-3xl p-4 border border-violet-100 shadow-sm">
      {/* Header row */}
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-black text-sm text-indigo-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Today&apos;s Practice
        </h2>
        <span className="text-xs font-bold bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full">
          {minutesToday} / {goalMinutes} min
        </span>
      </div>

      {/* SVG violin */}
      <div className="flex justify-center relative my-2">
        {/* Goal-complete glow ring */}
        {isComplete && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-36 h-36 rounded-full bg-amber-300/30 animate-glow-pulse" />
          </div>
        )}

        <svg width="110" height="200" viewBox="0 0 130 210" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <clipPath id="violin-body-clip">
              <path d="M65,37 C84,37 100,50 100,68 C100,81 90,87 90,102 C90,117 105,130 105,156 C105,179 87,195 65,195 C43,195 25,179 25,156 C25,130 40,117 40,102 C40,87 30,81 30,68 C30,50 46,37 65,37 Z" />
            </clipPath>
            <linearGradient id="wood-dark" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7A4A10" />
              <stop offset="100%" stopColor="#5A3208" />
            </linearGradient>
            <linearGradient id="wood-amber" x1="0" y1="0" x2="0.8" y2="1">
              <stop offset="0%" stopColor="#F5C872" />
              <stop offset="100%" stopColor="#C17B2F" />
            </linearGradient>
            <linearGradient id="shine-grad" x1="0.3" y1="0" x2="0.7" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
          </defs>

          {/* Dark base body */}
          <path
            d="M65,37 C84,37 100,50 100,68 C100,81 90,87 90,102 C90,117 105,130 105,156 C105,179 87,195 65,195 C43,195 25,179 25,156 C25,130 40,117 40,102 C40,87 30,81 30,68 C30,50 46,37 65,37 Z"
            fill="url(#wood-dark)" stroke="#4A2008" strokeWidth="1.5"
          />

          {/* Amber fill — grows from the bottom */}
          <g clipPath="url(#violin-body-clip)">
            <rect x="0" y={fillY} width="130" height={fillPx} fill="url(#wood-amber)" />
          </g>

          {/* Shine overlay — fades in when >60% full */}
          {shineOpacity > 0 && (
            <g clipPath="url(#violin-body-clip)">
              <rect x="30" y="42" width="40" height="110" fill="url(#shine-grad)" rx="18" opacity={shineOpacity} />
            </g>
          )}

          {/* Body outline */}
          <path
            d="M65,37 C84,37 100,50 100,68 C100,81 90,87 90,102 C90,117 105,130 105,156 C105,179 87,195 65,195 C43,195 25,179 25,156 C25,130 40,117 40,102 C40,87 30,81 30,68 C30,50 46,37 65,37 Z"
            fill="none" stroke="#3A1A08" strokeWidth="2"
          />

          {/* F-holes — S-curve with terminal dots */}
          <path d="M49,94 C49,89 53,86 53,91 C53,98 49,104 49,109 C49,114 53,117 53,117" fill="none" stroke="#2A1008" strokeWidth="2" strokeLinecap="round" />
          <circle cx="51" cy="88" r="3" fill="#2A1008" />
          <circle cx="51" cy="119" r="2.5" fill="#2A1008" />

          <path d="M81,94 C81,89 77,86 77,91 C77,98 81,104 81,109 C81,114 77,117 77,117" fill="none" stroke="#2A1008" strokeWidth="2" strokeLinecap="round" />
          <circle cx="79" cy="88" r="3" fill="#2A1008" />
          <circle cx="79" cy="119" r="2.5" fill="#2A1008" />

          {/* Neck — trapezoid, slightly wider at the body */}
          <path d="M58,37 L56,20 L74,20 L72,37 Z" fill="#8B6914" stroke="#5A3208" strokeWidth="1.2" />

          {/* Pegbox */}
          <rect x="57" y="11" width="16" height="10" rx="1.5" fill="#6B4A10" stroke="#5A3208" strokeWidth="1" />

          {/* Nut */}
          <rect x="57" y="19" width="16" height="2" fill="#C8A856" />

          {/* Scroll — arch with volute curl, fully within viewBox */}
          <path d="M56,11 C54,8 55,4 58,2 C61,0.5 65,0 65,2 C65,0 69,0.5 72,2 C75,4 76,8 74,11 Z"
                fill="#8B6914" stroke="#5A3208" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M62,6 C62,4 68,4 68,6 C68,8 63,8 63,7"
                fill="none" stroke="#5A3208" strokeWidth="0.9" strokeLinecap="round" />

          {/* Tailpiece */}
          <path d="M55,190 L75,190 L71,205 L59,205 Z" fill="#5A3208" stroke="#3A2008" strokeWidth="1" />

          {/* Strings */}
          {[59, 63, 67, 71].map((x) => (
            <line key={x} x1={x} y1="13" x2={x} y2="196" stroke="#D4C4A0" strokeWidth="0.9" opacity="0.75" />
          ))}

          {/* Bridge */}
          <rect x="56" y="109" width="18" height="4" rx="1" fill="#D4A853" stroke="#8B6914" strokeWidth="0.8" />

          {/* Tuning pegs — sticking out from each side of the pegbox */}
          <line x1="57" y1="14" x2="47" y2="13" stroke="#C89A4A" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="57" y1="18" x2="47" y2="17" stroke="#C89A4A" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="73" y1="14" x2="83" y2="13" stroke="#C89A4A" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="73" y1="18" x2="83" y2="17" stroke="#C89A4A" strokeWidth="2.5" strokeLinecap="round" />

          {/* Sparkles at 100% */}
          {isComplete && (
            <>
              <text x="13" y="58" fontSize="14" textAnchor="middle">✦</text>
              <text x="117" y="68" fontSize="11" textAnchor="middle">✦</text>
              <text x="11" y="158" fontSize="10" textAnchor="middle">✦</text>
              <text x="119" y="163" fontSize="14" textAnchor="middle">✦</text>
            </>
          )}
        </svg>
      </div>

      {/* Progress label */}
      <p className="text-center text-sm font-bold text-indigo-400 mt-1">
        {isComplete
          ? '🎉 Goal smashed! Amazing work!'
          : `Keep going! ${minutesToday} of ${goalMinutes} min`}
      </p>

      {/* Milestone stars */}
      <div className="flex justify-around mt-3">
        {milestones.map(({ label, hit }) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <span className={`text-xl transition-all duration-300 ${hit ? 'opacity-100' : 'opacity-20'}`}>
              ⭐
            </span>
            <span className="text-[10px] font-bold text-indigo-300">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
