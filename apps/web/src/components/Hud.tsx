import type { ReactNode } from 'react';
import { shelfCapacity } from '@shopflow/sim';
import { useGame } from '../store';
import { usd, gameTime, dateStr } from '../format';

export default function Hud() {
  const game = useGame((s) => s.game);
  const paused = useGame((s) => s.paused);
  const setPaused = useGame((s) => s.setPaused);
  if (!game) return null;

  const stock = Object.values(game.inventory).reduce((a: number, b: number) => a + b, 0);
  const cap = shelfCapacity(game);

  return (
    <header className="sticky top-0 z-40 bg-white shadow">
      <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-2">
        <span className="text-lg font-bold text-emerald-600">{usd(game.money)}</span>
        <div className="text-right text-xs leading-tight text-slate-500">
          <div className="text-sm font-bold text-slate-800">{gameTime(game.clock.minute)}</div>
          <div>{dateStr(game.clock)}</div>
        </div>
        <button
          onClick={() => setPaused(!paused)}
          aria-label={paused ? 'Chạy tiếp' : 'Tạm dừng'}
          className="rounded-lg bg-slate-100 px-3 py-1 text-lg"
        >
          {paused ? '▶' : '⏸'}
        </button>
      </div>
      <div className="mx-auto flex max-w-md flex-wrap gap-2 px-4 pb-2 text-xs">
        <Chip title="Điểm uy tín">⭐ {game.rating.toFixed(1)}</Chip>
        <Chip title="Hàng trên kệ / sức chứa">📚 {stock}/{cap}</Chip>
        <Chip title="Hàng chờ kiểm">🔍 {game.unchecked} chờ kiểm</Chip>
        <Chip title="Đơn đang chờ">⏳ {game.orders.length} đơn chờ</Chip>
      </div>
    </header>
  );
}

function Chip({ title, children }: { title: string; children: ReactNode }) {
  return <span title={title} className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{children}</span>;
}
