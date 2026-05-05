'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { MASCOT_LIST, type MascotType } from './Mascot';

interface Props {
  current: MascotType;
  onChange: (type: MascotType) => void;
}

export default function MascotPicker({ current, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-center gap-1 text-[11px] font-bold text-indigo-400 hover:text-indigo-600 py-1 transition-colors"
      >
        Change buddy {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {open && (
        <div className="flex justify-center gap-2 mt-2 pb-1 flex-wrap">
          {MASCOT_LIST.map(m => (
            <button
              key={m.type}
              onClick={() => { onChange(m.type); setOpen(false); }}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-2xl transition-all active:scale-95 ${
                current === m.type
                  ? 'bg-indigo-100 ring-2 ring-indigo-400 scale-110'
                  : 'bg-white border border-violet-100 hover:bg-violet-50'
              }`}
            >
              <span className="text-2xl leading-none">{m.emoji}</span>
              <span className="text-[9px] font-black text-indigo-400">{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
