import { useState } from 'react';
import { shelfCapacity } from '@shopflow/sim';
import { useGame } from '../store';
import { usd, gameTime, dateStr } from '../format';
import { overallGoalPct, questProgress } from '../goals';
import QuestSheet from './QuestSheet';

export default function Hud() {
  const game = useGame((s) => s.game);
  const paused = useGame((s) => s.paused);
  const setPaused = useGame((s) => s.setPaused);
  const speed = useGame((s) => s.speed);
  const setSpeed = useGame((s) => s.setSpeed);
  const [sheet, setSheet] = useState(false);
  if (!game) return null;

  const stock = Object.values(game.inventory).reduce((a: number, b: number) => a + b, 0);
  const cap = shelfCapacity(game);
  const speedUnlocked = game.stage >= 3; // stages.json: 'speed-2x' trong unlocks màn 3
  const pct = overallGoalPct(game);
  const q = questProgress(game);

  return (
    <header className="sticky top-0 z-40 bg-emerald-700 text-white shadow-md">
      <div className="mx-auto max-w-md px-4 pb-2.5 pt-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xl font-extrabold tracking-tight">{usd(game.money)}</span>
          <div className="text-right text-[11px] leading-tight text-white/90">
            <div className="text-sm font-bold text-white">{gameTime(game.clock.minute)}</div>
            <div>{dateStr(game.clock)}</div>
          </div>
          <div className="flex gap-0.5 rounded-lg bg-white/15 p-0.5 text-sm">
            <SpeedBtn active={paused} onClick={() => setPaused(true)} label="⏸" aria="Tạm dừng" />
            <SpeedBtn active={!paused && speed === 1} onClick={() => { setSpeed(1); setPaused(false); }} label="1x" aria="Chạy 1x" />
            <SpeedBtn active={!paused && speed === 2} disabled={!speedUnlocked} onClick={() => { setSpeed(2); setPaused(false); }}
              label={speedUnlocked ? '2x' : '🔒2x'} aria={speedUnlocked ? 'Chạy 2x' : 'Tua nhanh mở ở màn 3'} />
          </div>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <Tile value={`⭐ ${game.rating.toFixed(1)}`} label="Uy tín" title="Điểm uy tín" />
          <Tile value={`${stock}/${cap}`} label="Kệ" title="Hàng trên kệ / sức chứa" />
          <Tile value={String(game.unchecked)} label="Chờ kiểm" title="Hàng chờ kiểm" />
          <Tile value={String(game.orders.length)} label="Đơn chờ" title="Đơn đang chờ" />
        </div>

        {pct !== null && (
          <button onClick={() => setSheet(true)} aria-label="Mục tiêu màn" className="mt-2 block w-full text-left">
            <div className="h-1 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-amber-300" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-white/90">
              <span><span className="rounded-full bg-white/15 px-2 py-0.5 font-extrabold text-white">Màn {game.stage}</span> · mục tiêu {pct}%</span>
              {q.total > 0 && <span className="rounded-full bg-amber-400 px-2 py-0.5 font-extrabold text-emerald-950">🎯 {q.done}/{q.total}</span>}
            </div>
          </button>
        )}
      </div>
      {sheet && <QuestSheet onClose={() => setSheet(false)} />}
    </header>
  );
}

function Tile({ value, label, title }: { value: string; label: string; title: string }) {
  return (
    <div title={title} className="rounded-xl bg-white/15 py-1.5 text-center">
      <div className="text-sm font-bold leading-tight text-white">{value}</div>
      <div className="text-[10px] text-white/90">{label}</div>
    </div>
  );
}

function SpeedBtn({ active, disabled, onClick, label, aria }: { active: boolean; disabled?: boolean; onClick: () => void; label: string; aria: string }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={aria} aria-pressed={active}
      className={`rounded-md px-2 py-1 font-bold ${active ? 'bg-white text-emerald-700 shadow' : 'text-white/80'} disabled:text-white/45`}>
      {label}
    </button>
  );
}
