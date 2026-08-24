import { useState } from 'react';
import { stages as ST } from '@shopflow/data';
import { packCapacityPerSecond, shelfCapacity } from '@shopflow/sim';
import { useGame } from '../store';
import { usd } from '../format';

type EquipType = 'shelf' | 'packer' | 'robot';
const WH = ST.warehouse;

const EQUIP: { type: EquipType; icon: string; name: string }[] = [
  { type: 'shelf', icon: '🗄️', name: 'Kệ hàng' },
  { type: 'packer', icon: '📦', name: 'Bàn đóng gói' },
  { type: 'robot', icon: '🤖', name: 'Robot' },
];

const TILE: Record<EquipType, string> = {
  shelf: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  packer: 'border-sky-300 bg-sky-50 text-sky-700',
  robot: 'border-violet-300 bg-violet-50 text-violet-700',
};

export default function Warehouse() {
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const [placing, setPlacing] = useState<EquipType | null>(null);
  const [popup, setPopup] = useState<number | null>(null);
  if (!game) return null;

  const { size, cells } = game.grid;
  const stock = Object.values(game.inventory).reduce((a: number, b: number) => a + b, 0);
  const cap = shelfCapacity(game);
  const shipping = game.deliveries.filter((d) => d.state === 'shipping').length;
  const nextGrid = WH.grids.find((g: { size: number }) => g.size === size + 1);

  const tap = (i: number) => {
    const cell = cells[i];
    if (cell === null && placing) {
      dispatch('placeEquipment', i, placing);
      setPlacing(null);
      setPopup(null);
      return;
    }
    if (cell && cell.type !== 'pile') setPopup(popup === i ? null : i);
    else setPopup(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Kho hàng {size}×{size}</h1>
        {nextGrid && (nextGrid.unlockStage ?? 1) <= game.stage ? (
          <button
            onClick={() => dispatch('expandGrid')}
            className="rounded-lg bg-emerald-600 px-3 py-1 text-sm font-bold text-white"
          >
            Mở rộng kho {usd(nextGrid.cost)}
          </button>
        ) : nextGrid ? (
          <span className="rounded-lg bg-emerald-50 px-3 py-1 text-sm text-emerald-700">
            Mở {nextGrid.size}×{nextGrid.size} ở màn {nextGrid.unlockStage}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-4 gap-1 rounded-xl bg-white p-2 text-center text-xs shadow">
        <Step icon="🚚" label="1. Xe về" value={shipping} />
        <Step icon="🔍" label="2. Chờ kiểm" value={game.unchecked} />
        <Step icon="📚" label="3. Lên kệ" value={`${stock}/${cap}`} />
        <Step icon="📦" label="4. Đóng gói" value={game.orders.length} />
      </div>

      <div
        className="relative grid gap-2 rounded-xl bg-white p-2 shadow"
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
      >
        {cells.map((cell, i) => (
          <div key={i} className="relative">
            <button
              onClick={() => tap(i)}
              aria-label={`Ô ${i + 1}`}
              className={`flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border-2 text-xs font-bold ${
                cell === null
                  ? `border-dashed border-slate-300 text-slate-400 ${placing ? 'bg-emerald-50' : ''}`
                  : cell.type === 'pile'
                    ? 'border-orange-300 bg-orange-50 text-orange-700'
                    : TILE[cell.type]
              } ${popup === i ? 'ring-2 ring-slate-400' : ''}`}
            >
              {cell === null ? (
                <span className="text-xl leading-none">{placing ? '＋' : ''}</span>
              ) : cell.type === 'pile' ? (
                <>
                  <span className="text-xl leading-none">🔍</span>
                  <span>Chờ kiểm</span>
                </>
              ) : (
                <>
                  <span className="text-xl leading-none">{EQUIP.find((e) => e.type === cell.type)!.icon}</span>
                  <span>{cellLabel(cell.type, cell.level, stock, cap)}</span>
                  {cell.level > 1 && <span className="text-[10px] font-normal">Cấp {cell.level}</span>}
                </>
              )}
            </button>
            {popup === i && cell && cell.type !== 'pile' && (
              <Popup
                type={cell.type}
                level={cell.level}
                stage={game.stage}
                onUpgrade={() => { dispatch('upgradeEquipment', i); setPopup(null); }}
                onRemove={() => { dispatch('removeEquipment', i); setPopup(null); }}
              />
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        <b>Bàn đóng gói</b> lấy hàng từ kệ và giao cho khách — {packCapacityPerSecond(game).toFixed(1)} đơn/giây.{' '}
        <b>Kệ</b> chứa hàng đã kiểm. Chọn thiết bị rồi chạm ô trống.
      </p>

      <div className="grid grid-cols-3 gap-2">
        {EQUIP.map((e) => {
          const def = WH[e.type];
          const locked = (def.unlockStage ?? 1) > game.stage;
          return (
            <button
              key={e.type}
              disabled={locked}
              onClick={() => { setPlacing(placing === e.type ? null : e.type); setPopup(null); }}
              className={`rounded-xl border-2 bg-white p-2 text-center text-xs shadow ${
                locked ? 'border-slate-200 text-slate-400' : placing === e.type ? 'border-emerald-600' : 'border-transparent'
              }`}
            >
              <div className="text-2xl leading-none">{e.icon}</div>
              <div className="mt-1 font-bold">{e.name}</div>
              <div className={locked ? '' : 'font-bold text-emerald-600'}>
                {locked ? `🔒 Màn ${def.unlockStage}` : usd(def.place)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function cellLabel(type: EquipType, level: 1 | 2 | 3, stock: number, cap: number): string {
  if (type === 'shelf') {
    const own = WH.shelf.levels[level - 1].cap;
    const share = cap > 0 ? Math.round((stock * own) / cap) : 0;
    return `${share}/${own}`;
  }
  if (type === 'packer') return `${WH.packer.levels[level - 1].speed}/giây`;
  return `${WH.robot.levels[level - 1].speed}/giây`;
}

function Step({ icon, label, value }: { icon: string; label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-slate-50 py-1">
      <div className="text-lg leading-none">{icon}</div>
      <div className="mt-0.5 text-slate-500">{label}</div>
      <div className="font-bold text-slate-800">{value}</div>
    </div>
  );
}

function Popup({ type, level, stage, onUpgrade, onRemove }: {
  type: EquipType; level: 1 | 2 | 3; stage: number;
  onUpgrade: () => void; onRemove: () => void;
}) {
  const next = WH[type].levels[level] as { cost?: number; unlockStage?: number } | undefined;
  const lockedAt = next && (next.unlockStage ?? 1) > stage ? next.unlockStage : null;
  return (
    <div className="absolute left-1/2 top-full z-30 mt-1 w-36 -translate-x-1/2 space-y-1 rounded-xl bg-white p-2 text-xs shadow-lg ring-1 ring-slate-200">
      <button
        disabled={!next || lockedAt !== null}
        onClick={onUpgrade}
        className="w-full rounded-lg bg-emerald-600 px-2 py-1 font-bold text-white disabled:bg-slate-200 disabled:text-slate-500"
      >
        {!next ? 'Đã cấp tối đa' : lockedAt !== null ? `Mở ở màn ${lockedAt}` : `Nâng cấp ${usd(next.cost ?? 0)}`}
      </button>
      <button onClick={onRemove} className="w-full rounded-lg bg-slate-100 px-2 py-1 font-bold text-slate-700">
        Gỡ {usd(WH.demolish)}
      </button>
    </div>
  );
}
