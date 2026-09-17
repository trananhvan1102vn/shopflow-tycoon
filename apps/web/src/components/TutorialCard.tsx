import { useEffect } from 'react';
import { TUTORIAL_STEPS } from '@shopflow/sim';
import { stages as ST } from '@shopflow/data';
import { useGame } from '../store';
import { usd } from '../format';
import { TUTORIAL, completedSteps } from '../tutorial';
import { TABS, type Tab } from './TabBar';

export default function TutorialCard({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const game = useGame((s) => s.game);
  const visited = useGame((s) => s.visited);
  const dispatch = useGame((s) => s.dispatch);
  const step = game?.tutorial.step ?? 0;
  const done = game?.tutorial.done ?? true;
  // Đồng bộ tiến độ: sim chỉ nhận "advance", web quyết định bước nào đã xong.
  const reached = game ? completedSteps({ game, visited }) : 0;
  useEffect(() => { if (game && !done && reached > step) dispatch('tutorialAdvance'); }, [reached, step, done, game, dispatch]);
  if (!game || done) return null;
  const finished = step >= TUTORIAL_STEPS;
  const cur = TUTORIAL[Math.min(step, TUTORIAL_STEPS - 1)];
  const tabDef = TABS.find((t) => t.id === cur.tab)!;
  return (
    <div className={`fixed inset-x-0 ${tab === 'nhap' ? 'bottom-40' : 'bottom-14'} z-30 px-3 pb-2`}>
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 shadow-lg" role="status">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500 text-sm font-bold text-white">
          {finished ? '🎉' : `${step + 1}/${TUTORIAL_STEPS}`}
        </span>
        <div className="min-w-0 flex-1 text-sm">
          {finished ? <span className="font-bold text-amber-900">Xong hướng dẫn! Nhận thưởng {usd(ST.tutorialReward)}.</span>
            : <><span className="font-bold text-amber-900">Bước {step + 1}:</span> {cur.text}</>}
        </div>
        {finished ? (
          <button onClick={() => dispatch('tutorialClaim')} className="shrink-0 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white">Nhận +{usd(ST.tutorialReward)}</button>
        ) : (
          <div className="flex shrink-0 flex-col gap-1">
            <button onClick={() => setTab(cur.tab)} className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-white">{tabDef.icon} {tabDef.label}</button>
            <button onClick={() => dispatch('tutorialSkip')} className="text-xs text-amber-800 underline">Bỏ qua</button>
          </div>
        )}
      </div>
    </div>
  );
}
