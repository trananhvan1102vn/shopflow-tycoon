import { useState } from 'react';
import { useGame } from '../store';
import RestockRetail from './RestockRetail';
import RestockBundles from './RestockBundles';
import RestockInbound from './RestockInbound';

type Sub = 'le' | 'si' | 've';

const SUBS: { id: Sub; label: string }[] = [
  { id: 'le', label: 'Nhập lẻ' },
  { id: 'si', label: 'Gói sỉ' },
  { id: 've', label: 'Đang về' },
];

export default function Restock() {
  const game = useGame((s) => s.game);
  const [sub, setSub] = useState<Sub>('le');
  if (!game) return null;

  const inbound = game.deliveries.length;

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl bg-slate-200 p-1">
        {SUBS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSub(s.id)}
            aria-current={sub === s.id ? 'page' : undefined}
            className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-sm ${
              sub === s.id ? 'bg-white font-bold text-slate-900 shadow' : 'text-slate-500'
            }`}
          >
            {s.label}
            {s.id === 've' && inbound > 0 && (
              <span className="rounded-full bg-orange-500 px-1.5 text-[11px] font-bold text-white">{inbound}</span>
            )}
          </button>
        ))}
      </div>

      {sub === 'le' ? <RestockRetail /> : sub === 'si' ? <RestockBundles /> : <RestockInbound />}
    </div>
  );
}
