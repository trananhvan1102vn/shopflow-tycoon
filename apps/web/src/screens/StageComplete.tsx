import { useRef, useState } from 'react';
import { stages as ST } from '@shopflow/data';
import { useGame } from '../store';
import { usd } from '../format';
import { UNLOCK_LABEL, unlocksAfterStage } from '../report';
import { questProgress, QUEST_LABEL } from '../goals';
import { pickableIndustries } from '../industries';
import IndustrySelect from './IndustrySelect';

/** C13/C14 — overlay hoàn thành màn. `onClose` do App gọi để gỡ overlay. */
export default function StageComplete({ onClose }: { onClose: () => void }) {
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const [step, setStep] = useState<'summary' | 'industry'>('summary');
  // `game.stage` tăng ngay sau `advanceStage`; giữ lại số màn vừa xong để hiển thị.
  const stageRef = useRef<number | null>(null);
  if (stageRef.current === null && game) stageRef.current = game.stage;
  const stage = stageRef.current;

  if (!game || stage === null) return null;

  if (step === 'industry') return <IndustrySelect mode="next" onDone={onClose} />;

  const entry = (ST.stages as any[])[stage - 1] ?? {};
  const goal = entry.goal ?? null;
  const reward: number = entry.reward ?? 0;
  const unlocks = unlocksAfterStage(stage);
  // Ngành mở được ở màn SẮP vào (stage + 1, vì `advanceStage` chưa chạy tới khi bấm nút dưới) và
  // còn dưới trần số ngành sở hữu của màn đó (khớp điều kiện reject trong `chooseIndustry` sim).
  const nextStage = stage + 1;
  const canPickIndustry =
    pickableIndustries(game.industries, nextStage).length > 0 && game.industries.length < nextStage;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-emerald-700 text-white"
      role="dialog" aria-modal="true" aria-label={`Màn ${stage} hoàn thành`}>
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <div className="grid h-24 w-24 place-items-center rounded-full bg-white text-5xl">🏆</div>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.3em] text-emerald-100">
          Màn {stage} hoàn thành
        </p>
        <h1 className="mt-2 text-3xl font-bold">Chúc mừng sếp!</h1>
      </div>

      <div className="mx-auto w-full max-w-md rounded-t-3xl bg-white p-5 text-slate-800">
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Tiền mặt" value={usd(game.money)} goal={goal && `mục tiêu ${usd(goal.money)}`} tone="emerald" />
          <Tile label="Đơn giao" value={String(game.completedOrders)} goal={goal && `mục tiêu ${goal.orders}`} />
          <Tile label="Rating" value={`⭐ ${game.rating.toFixed(1)}`} goal={goal && `mục tiêu ${goal.rating}`} tone="amber" />
        </div>

        <div className="mt-3 rounded-xl bg-amber-50 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-amber-800">Thưởng qua màn</span>
            {unlocks.length > 0 && <span className="text-xs text-amber-700">Mở khoá</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-2xl font-bold text-amber-700">+{usd(reward)}</span>
            <div className="flex flex-wrap justify-end gap-1">
              {unlocks.map((id) => (
                <span key={id} className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-slate-700 shadow-sm">
                  {UNLOCK_LABEL[id]}
                </span>
              ))}
            </div>
          </div>
        </div>

        {(() => {
          const q = questProgress({ stage, questsDone: game.questsDone });
          return q.total > 0 ? (
            <ul className="mt-3 space-y-1 text-sm">
              {q.list.map((x) => <li key={x.id} className={x.done ? 'text-emerald-700' : 'text-slate-400'}>{x.done ? '✓' : '○'} {QUEST_LABEL[x.id] ?? x.id}</li>)}
            </ul>
          ) : null;
        })()}

        <div className="mt-4 space-y-2">
          {canPickIndustry && (
            <button
              onClick={() => { dispatch('advanceStage'); setStep('industry'); }}
              className="w-full rounded-xl bg-slate-900 p-3 font-bold text-white"
            >
              Nhận thưởng &amp; chọn ngành tiếp theo
            </button>
          )}
          <button
            onClick={() => { dispatch('advanceStage'); onClose(); }}
            className={`w-full rounded-xl p-3 font-bold ${
              canPickIndustry ? 'bg-slate-100 text-slate-700' : 'bg-emerald-700 text-white'}`}
          >
            Tiếp tục
          </button>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, goal, tone }: {
  label: string; value: string; goal?: string | null; tone?: 'emerald' | 'amber';
}) {
  const color = tone === 'emerald' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-600' : 'text-slate-800';
  return (
    <div className="rounded-xl bg-slate-100 p-3 text-center">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      {goal && <div className="text-[11px] text-slate-400">{goal}</div>}
    </div>
  );
}
