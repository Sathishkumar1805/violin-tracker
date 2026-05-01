'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getWeekDetails } from '@/lib/streak';
import type { PracticeSession } from '@/lib/types';

interface Props {
  sessions: PracticeSession[];
  timezone: string;
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  goalMinutes?: number;
}

function fmtMins(mins: number): string {
  if (mins === 0) return '—';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function WeeklyHistory({ sessions, timezone, weekOffset, onWeekChange, goalMinutes = 20 }: Props) {
  const days = getWeekDetails(sessions, timezone, weekOffset);
  const weekTotalMins = days.reduce((sum, d) => sum + d.minutes, 0);
  const daysWithPractice = days.filter(d => d.minutes > 0).length;

  const monday = days[0];
  const sunday = days[6];
  const weekLabel =
    monday.dayDate.split(' ')[0] === sunday.dayDate.split(' ')[0]
      ? `${monday.dayDate} – ${sunday.dayDate.split(' ')[1]}`
      : `${monday.dayDate} – ${sunday.dayDate}`;

  const maxMins = Math.max(goalMinutes, ...days.map(d => d.minutes));

  return (
    <div className="bg-white rounded-3xl p-4 border border-violet-100">
      {/* Header + navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => onWeekChange(weekOffset - 1)}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-violet-50 text-indigo-500 hover:bg-violet-100 active:scale-95 transition-all"
          aria-label="Previous week"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="text-center">
          <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">
            {weekOffset === 0 ? 'This Week' : weekOffset === -1 ? 'Last Week' : `${Math.abs(weekOffset)} Weeks Ago`}
          </p>
          <p className="text-xs font-black text-indigo-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
            {weekLabel}
          </p>
        </div>

        <button
          onClick={() => onWeekChange(weekOffset + 1)}
          disabled={weekOffset >= 0}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-violet-50 text-indigo-500 hover:bg-violet-100 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next week"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Day bars */}
      <div className="flex gap-1.5 items-end justify-between mb-3" style={{ height: 88 }}>
        {days.map(day => {
          const pct = maxMins > 0 ? day.minutes / maxMins : 0;
          const barH = Math.max(pct * 64, day.minutes > 0 ? 6 : 0);
          const isGoalMet = day.minutes >= goalMinutes;

          let barColor = 'bg-violet-100';
          if (day.isFuture) barColor = 'bg-violet-50';
          else if (day.minutes > 0) barColor = isGoalMet ? 'bg-emerald-400' : 'bg-indigo-300';

          let labelColor = 'text-indigo-200';
          if (day.isToday) labelColor = 'text-indigo-500';
          else if (day.minutes > 0) labelColor = isGoalMet ? 'text-emerald-600' : 'text-indigo-400';

          return (
            <div key={day.date} className="flex flex-col items-center gap-1 flex-1">
              {/* minutes label */}
              <span className={`text-[9px] font-bold ${labelColor} leading-none`}>
                {day.isFuture ? '' : fmtMins(day.minutes)}
              </span>
              {/* bar */}
              <div className="w-full flex flex-col justify-end" style={{ height: 64 }}>
                <div
                  className={`w-full rounded-t-lg transition-all duration-500 ${barColor} ${day.isToday && day.minutes === 0 ? 'border-2 border-dashed border-indigo-200' : ''}`}
                  style={{ height: day.isFuture ? 0 : Math.max(barH, day.minutes === 0 && !day.isFuture ? 4 : 0) }}
                />
              </div>
              {/* day label */}
              <span className={`text-[10px] font-bold ${day.isToday ? 'text-indigo-600' : 'text-indigo-300'} leading-none`}>
                {day.dayLabel}
              </span>
            </div>
          );
        })}
      </div>

      {/* Goal line legend */}
      <div className="flex items-center gap-1.5 mb-3">
        <div className="flex gap-2 items-center">
          <span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block" />
          <span className="text-[10px] text-indigo-400 font-semibold">Goal met (≥{goalMinutes}m)</span>
        </div>
        <div className="flex gap-2 items-center ml-3">
          <span className="w-3 h-3 rounded-sm bg-indigo-300 inline-block" />
          <span className="text-[10px] text-indigo-400 font-semibold">Some practice</span>
        </div>
      </div>

      {/* Weekly summary */}
      <div className="bg-violet-50 rounded-2xl px-4 py-3 flex items-center justify-between border border-violet-100">
        <div>
          <p className="text-xs text-indigo-400 font-semibold">Week total</p>
          <p className="text-xl font-black text-indigo-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
            {weekTotalMins === 0 ? 'No practice' : fmtMins(weekTotalMins)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-indigo-400 font-semibold">Days practiced</p>
          <p className="text-xl font-black text-indigo-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
            {daysWithPractice} <span className="text-sm font-semibold text-indigo-400">/ 7</span>
          </p>
        </div>
      </div>
    </div>
  );
}
