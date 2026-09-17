import type { ReactNode } from 'react';
import { shelfCapacity } from '@shopflow/sim';
import { useGame } from '../store';
import { usd, gameTime, dateStr } from '../format';
import GoalStrip from './GoalStrip';

export default function Hud() {
  const game = useGame((s) => s.game);
  const paused = useGame((s) => s.paused);
  const setPaused = useGame((s) => s.setPaused);
  const speed = useGame((s) => s.speed);
  const setSpeed = useGame((s) => s.setSpeed);
  if (!game) return null;

  const stock = Object.values(game.inventory).reduce((a: number, b: number) => a + b, 0);
  const cap = shelfCapacity(game);
  const speedUnlocked = game.stage >= 3; // stages.json: 'speed-2x' trong unlocks màn 3

  return (
    <header className="sticky top-0 z-40 bg-white shadow">
      <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-2">
        <span className="text-lg font-bold text-emerald-600">{usd(game.money)}</span>
        <div className="text-right text-xs leading-tight text-slate-500">
          <div className="text-sm font-bold text-slate-800">{gameTime(game.clock.minute)}</div>
          <div>{dateStr(game.clock)}</div>
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 text-sm">
          <SpeedBtn active={paused} onClick={() => setPaused(true)} label="⏸" aria="Tạm dừng" />
          <SpeedBtn active={!paused && speed === 1} onClick={() => { setSpeed(1); setPaused(false); }} label="1x" aria="Chạy 1x" />
          <SpeedBtn active={!paused && speed === 2} disabled={!speedUnlocked} onClick={() => { setSpeed(2); setPaused(false); }}
            label={speedUnlocked ? '2x' : '🔒2x'} aria={speedUnlocked ? 'Chạy 2x' : 'Tua nhanh mở ở màn 3'} />
        </div>
      </div>
      <div className="mx-auto flex max-w-md flex-wrap gap-2 px-4 pb-2 text-xs">
        <Chip title="Điểm uy tín">⭐ {game.rating.toFixed(1)}</Chip>
        <Chip title="Hàng trên kệ / sức chứa">📚 {stock}/{cap}</Chip>
        <Chip title="Hàng chờ kiểm">🔍 {game.unchecked} chờ kiểm</Chip>
        <Chip title="Đơn đang chờ">⏳ {game.orders.length} đơn chờ</Chip>
      </div>
      <GoalStrip />
    </header>
  );
}

function Chip({ title, children }: { title: string; children: ReactNode }) {
  return <span title={title} className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{children}</span>;
}

function SpeedBtn({ active, disabled, onClick, label, aria }: { active: boolean; disabled?: boolean; onClick: () => void; label: string; aria: string }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={aria} aria-pressed={active}
      className={`rounded-md px-2 py-1 font-bold ${active ? 'bg-white text-emerald-700 shadow' : 'text-slate-500'} disabled:text-slate-300`}>
      {label}
    </button>
  );
}
