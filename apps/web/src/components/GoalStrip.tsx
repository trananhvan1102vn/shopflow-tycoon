import { useState } from 'react';
import { useGame } from '../store';
import { usd } from '../format';
import { goalProgress, questProgress } from '../goals';
import QuestSheet from './QuestSheet';

export default function GoalStrip() {
  const game = useGame((s) => s.game);
  const [open, setOpen] = useState(false);
  if (!game) return null;
  const p = goalProgress(game);
  const q = questProgress(game);
  if (!p) return null;
  return (
    <div className="mx-auto flex max-w-md items-center gap-2 px-4 pb-2 text-[11px]">
      <Bar label="💵" text={`${usd(p.money.cur)} / ${usd(p.money.target)}`} pct={p.money.pct} />
      <Bar label="📦" text={`${p.orders.cur} / ${p.orders.target}`} pct={p.orders.pct} />
      <Bar label="⭐" text={`${p.rating.cur.toFixed(1)} / ${p.rating.target}`} pct={p.rating.pct} />
      {q.total > 0 && (
        <button onClick={() => setOpen(true)} aria-label="Nhiệm vụ màn"
          className="shrink-0 rounded-full bg-amber-100 px-2 py-1 font-bold text-amber-800">
          🎯 {q.done}/{q.total}
        </button>
      )}
      {open && <QuestSheet onClose={() => setOpen(false)} />}
    </div>
  );
}

function Bar({ label, text, pct }: { label: string; text: string; pct: number }) {
  return (
    <div className="min-w-0 flex-1" title={`Mục tiêu màn: ${text}`}>
      <div className="flex justify-between gap-1 text-slate-500"><span>{label}</span><span className="truncate">{text}</span></div>
      <div className="mt-0.5 h-1.5 rounded-full bg-slate-200">
        <div className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-emerald-600' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
