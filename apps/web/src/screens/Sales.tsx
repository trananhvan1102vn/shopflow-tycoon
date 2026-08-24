import { useState } from 'react';
import { useGame } from '../store';
import SalesChannels from './SalesChannels';
import SalesOrders from './SalesOrders';

type Sub = 'kenh' | 'don';

const SUBS: { id: Sub; label: string }[] = [
  { id: 'kenh', label: 'Kênh bán' },
  { id: 'don', label: 'Đơn hàng' },
];

export default function Sales() {
  const game = useGame((s) => s.game);
  const [sub, setSub] = useState<Sub>('kenh');
  if (!game) return null;

  const queued = game.orders.length;

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
            {s.id === 'don' && queued > 0 && (
              <span className="rounded-full bg-orange-500 px-1.5 text-[11px] font-bold text-white">{queued}</span>
            )}
          </button>
        ))}
      </div>

      {sub === 'kenh' ? <SalesChannels /> : <SalesOrders />}
    </div>
  );
}
