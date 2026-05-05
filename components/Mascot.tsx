'use client';

export type MascotType = 'bird' | 'dog' | 'cat' | 'rabbit' | 'bear' | 'fox';
export type MascotMood = 'celebrating' | 'happy' | 'encouraging' | 'worried' | 'sad';

export const MASCOT_LIST: { type: MascotType; emoji: string; name: string }[] = [
  { type: 'bird',   emoji: '🐦', name: 'Chirpy'   },
  { type: 'dog',    emoji: '🐶', name: 'Buddy'    },
  { type: 'cat',    emoji: '🐱', name: 'Whiskers' },
  { type: 'rabbit', emoji: '🐰', name: 'Hoppy'    },
  { type: 'bear',   emoji: '🐻', name: 'Bruno'    },
  { type: 'fox',    emoji: '🦊', name: 'Rusty'    },
];

const MOOD_CONFIG: Record<MascotMood, {
  face: string;
  bg: string;
  border: string;
  animation: string;
  label: string;
  labelColor: string;
  message: (name: string, streak: number) => string;
}> = {
  celebrating: {
    face: '🎉',
    bg: 'from-amber-50 to-yellow-50',
    border: 'border-amber-200',
    animation: 'animate-bounce',
    label: 'Woohoo!',
    labelColor: 'text-amber-600',
    message: (name) => `${name} is SO proud of you! Goal crushed today! 🌟`,
  },
  happy: {
    face: '😊',
    bg: 'from-emerald-50 to-green-50',
    border: 'border-emerald-200',
    animation: 'animate-pulse',
    label: 'Great job!',
    labelColor: 'text-emerald-600',
    message: (name) => `${name} is happy you practiced today! Keep it up!`,
  },
  encouraging: {
    face: '🎵',
    bg: 'from-indigo-50 to-violet-50',
    border: 'border-indigo-100',
    animation: '',
    label: "Let's go!",
    labelColor: 'text-indigo-500',
    message: (name) => `${name} is cheering for you! Time to pick up that violin! 🎻`,
  },
  worried: {
    face: '😟',
    bg: 'from-orange-50 to-amber-50',
    border: 'border-orange-200',
    animation: 'animate-mascot-wobble',
    label: 'Uh oh!',
    labelColor: 'text-orange-500',
    message: (name, streak) =>
      streak > 0
        ? `${name} is worried... don't break your ${streak}-day streak!`
        : `${name} is worried... practice today to start a new streak!`,
  },
  sad: {
    face: '😢',
    bg: 'from-rose-50 to-pink-50',
    border: 'border-rose-200',
    animation: '',
    label: 'Oh no...',
    labelColor: 'text-rose-500',
    message: (name) => `${name} is sad the streak broke... but today is a fresh start! 💪`,
  },
};

export function getMascotMood(
  minutesToday: number,
  goalMinutes: number,
  streak: number,
  hasPastSessions: boolean,
): MascotMood {
  if (minutesToday >= goalMinutes) return 'celebrating';
  if (minutesToday > 0) return 'happy';
  const hour = new Date().getHours();
  if (streak > 0 && hour >= 15) return 'worried';
  if (streak === 0 && hasPastSessions) return 'sad';
  return 'encouraging';
}

interface Props {
  mascotType: MascotType;
  mood: MascotMood;
  streak: number;
}

export default function Mascot({ mascotType, mood, streak }: Props) {
  const mascot = MASCOT_LIST.find(m => m.type === mascotType) ?? MASCOT_LIST[0];
  const config = MOOD_CONFIG[mood];

  return (
    <div className={`rounded-3xl border-2 ${config.border} bg-gradient-to-br ${config.bg} px-4 pt-4 pb-5 flex flex-col items-center gap-2`}>
      {/* Mood label */}
      <p className={`text-[11px] font-black uppercase tracking-widest ${config.labelColor}`}>
        {config.label}
      </p>

      {/* Animal + mood face */}
      <div className="relative flex items-center justify-center h-20">
        <span className={`text-7xl leading-none select-none ${config.animation}`}>
          {mascot.emoji}
        </span>
        <span className="absolute -bottom-1 -right-2 text-2xl leading-none drop-shadow-sm">
          {config.face}
        </span>
      </div>

      {/* Speech bubble */}
      <div className="relative w-full mt-2">
        {/* upward triangle notch */}
        <div
          className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0"
          style={{
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderBottom: '8px solid white',
          }}
        />
        <div className="bg-white rounded-2xl px-4 py-3 shadow-sm text-center">
          <p className="text-sm font-bold text-indigo-900 leading-snug" style={{ fontFamily: 'Nunito, sans-serif' }}>
            {config.message(mascot.name, streak)}
          </p>
        </div>
      </div>
    </div>
  );
}
