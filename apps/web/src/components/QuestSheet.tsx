import { useGame } from '../store';
import { usd } from '../format';
import { questProgress, QUEST_LABEL } from '../goals';

export default function QuestSheet({ onClose }: { onClose: () => void }) {
  const game = useGame((s) => s.game);
  if (!game) return null;
  const q = questProgress(game);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50" onClick={onClose}
      role="dialog" aria-modal="true" aria-label="Nhiệm vụ màn">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Nhiệm vụ màn {game.stage}</h2>
          <span className="text-sm text-slate-500">{q.done}/{q.total}</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">Không bắt buộc để qua màn — mỗi nhiệm vụ thưởng tiền một lần.</p>
        <ul className="mt-3 space-y-2">
          {q.list.map((x) => (
            <li key={x.id} className={`flex items-center justify-between rounded-xl p-3 ${x.done ? 'bg-emerald-50' : 'bg-slate-50'}`}>
              <span className={x.done ? 'font-bold text-emerald-700' : 'text-slate-700'}>{x.done ? '✓ ' : '○ '}{QUEST_LABEL[x.id] ?? x.id}</span>
              <span className="text-sm font-bold text-amber-700">+{usd(x.bonus)}</span>
            </li>
          ))}
        </ul>
        <button onClick={onClose} className="mt-4 w-full rounded-xl bg-slate-900 p-3 font-bold text-white">Đóng</button>
      </div>
    </div>
  );
}
