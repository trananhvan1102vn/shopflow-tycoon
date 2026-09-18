import { useGame } from '../store';
import { usd } from '../format';
import { goalProgress, questProgress, QUEST_LABEL } from '../goals';

export default function QuestSheet({ onClose }: { onClose: () => void }) {
  const game = useGame((s) => s.game);
  if (!game) return null;
  const p = goalProgress(game);
  const q = questProgress(game);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50" onClick={onClose}
      role="dialog" aria-modal="true" aria-label="Mục tiêu và nhiệm vụ màn">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">Màn {game.stage}</h2>
        {p && (
          <div className="mt-3 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Mục tiêu</h3>
            {[
              { icon: '💵', text: `${usd(p.money.cur)} / ${usd(p.money.target)}`, pct: p.money.pct },
              { icon: '📦', text: `${p.orders.cur} / ${p.orders.target}`, pct: p.orders.pct },
              { icon: '⭐', text: `${p.rating.cur.toFixed(1)} / ${p.rating.target}`, pct: p.rating.pct },
            ].map((g) => (
              <div key={g.icon}>
                <div className="flex justify-between text-sm"><span>{g.icon}</span><span className="font-bold">{g.text}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-200"><div className={`h-1.5 rounded-full ${g.pct >= 100 ? 'bg-emerald-600' : 'bg-emerald-400'}`} style={{ width: `${g.pct}%` }} /></div>
              </div>
            ))}
          </div>
        )}
        {q.total > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Nhiệm vụ · {q.done}/{q.total}</h3>
            <p className="mt-1 text-xs text-slate-500">Không bắt buộc để qua màn — mỗi nhiệm vụ thưởng tiền một lần.</p>
            <ul className="mt-3 space-y-2">
              {q.list.map((x) => (
                <li key={x.id} className={`flex items-center justify-between rounded-xl p-3 ${x.done ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                  <span className={x.done ? 'font-bold text-emerald-700' : 'text-slate-700'}>{x.done ? '✓ ' : '○ '}{QUEST_LABEL[x.id] ?? x.id}</span>
                  <span className="text-sm font-bold text-amber-700">+{usd(x.bonus)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button onClick={onClose} className="mt-4 w-full rounded-xl bg-slate-900 p-3 font-bold text-white">Đóng</button>
      </div>
    </div>
  );
}
