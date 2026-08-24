import { useEffect, useState } from 'react';
import { industries as IND, suppliers as SUP } from '@shopflow/data';
import { retailUnitPrice, pendingAuditCapacity } from '@shopflow/sim';
import { useGame } from '../store';
import { usdCents } from '../format';

const STEP = SUP.retail.moqLocal as number; // 5 — bậc nhảy đúng bằng MOQ nên mọi đơn đều hợp lệ
const MAX = SUP.retail.maxPerOrder as number;
const GRADES = ['A', 'B', 'C'] as const;

export default function RestockRetail() {
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const [industryId, setIndustryId] = useState<string | null>(null);
  const [carrierId, setCarrierId] = useState('standard');
  const [qty, setQty] = useState<Record<string, number>>({});
  // Đổi ngành → xoá giỏ: nếu giữ lại, thanh tổng và nút Đặt hàng vẫn tính các sản phẩm không còn hiển thị.
  useEffect(() => setQty({}), [industryId]);
  if (!game) return null;

  const owned = IND.industries.filter((i: any) => game.industries.includes(i.id));
  const ind = owned.find((i: any) => i.id === industryId) ?? owned[0];
  if (!ind) return null;

  const carrier = SUP.carriers.find((c: any) => c.id === carrierId)!;
  const lines = Object.entries(qty).filter(([, q]) => q > 0);
  const goods = lines.reduce((a, [pid, q]) => a + retailUnitPrice(game, pid) * q, 0);
  // buyRetail tính phí ship cho TỪNG đơn hàng → mỗi sản phẩm có qty > 0 là một lần phí.
  const ship = carrier.fee * lines.length;
  const sameDay = carrier.daysDelta <= 0;
  const units = lines.reduce((a, [, q]) => a + q, 0);
  const overCap = sameDay && units > pendingAuditCapacity(game);

  const bump = (pid: string, d: number) =>
    setQty((q) => ({ ...q, [pid]: Math.max(0, Math.min(MAX, (q[pid] ?? 0) + d * STEP)) }));

  const order = () => {
    for (const [pid, q] of lines) dispatch('buyRetail', pid, q, carrierId);
    setQty({});
  };

  return (
    <div className="space-y-3 pb-28">
      <Section title="Nguồn hàng" />
      <div className="grid grid-cols-3 gap-2">
        {SUP.tiers.map((t: any) => {
          const locked = t.unlockStage > game.stage;
          return (
            <div
              key={t.id}
              className={`rounded-xl border-2 bg-white p-2 text-xs shadow ${
                locked ? 'border-slate-200 text-slate-400' : 'border-emerald-600'
              }`}
            >
              <div className="font-bold">{locked ? '🔒 ' : ''}{t.name}</div>
              <div className="mt-0.5">
                {t.costMult < 1 ? `−${Math.round((1 - t.costMult) * 100)}%` : 'giá gốc'} ·{' '}
                {t.extraDays === 0 ? 'giao ngay' : `+${t.extraDays} ngày`}
              </div>
              {locked && <div className="mt-0.5 font-bold">Màn {t.unlockStage}</div>}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <Section title="Hạng · % trả" />
        <div className="ml-auto flex gap-1">
          {GRADES.map((g) => {
            const active = g === 'B'; // M1: chỉ hạng B ở màn 1, A/C mở ở màn 2
            return (
              <span
                key={g}
                className={`rounded-full px-3 py-1 text-xs ${
                  active ? 'bg-slate-900 font-bold text-white' : 'bg-slate-100 text-slate-400'
                }`}
              >
                {g} · {Math.round(SUP.grades[g].returnRate * 100)}%{active ? '' : ' · Màn 2'}
              </span>
            );
          })}
        </div>
      </div>

      {owned.length >= 2 && (
        <select
          value={ind.id}
          onChange={(e) => setIndustryId(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm font-bold shadow"
        >
          {owned.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      )}

      <div className="space-y-2">
        {ind.products.map((p: any) => {
          const locked = (p.unlockStage ?? 1) > game.stage;
          const stock = game.inventory[p.id] ?? 0;
          const q = qty[p.id] ?? 0;
          return (
            <div key={p.id} className={`flex items-center gap-2 rounded-xl bg-white p-3 shadow ${locked ? 'opacity-50' : ''}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{locked ? '🔒 ' : ''}{p.name}</div>
                <div className="text-xs text-slate-500">
                  Tồn <b className={stock < 10 ? 'text-red-600' : 'text-slate-700'}>{stock}</b> · Bán {usdCents(p.retail)} ·
                  {' '}Nhập lẻ <b className="text-slate-800">{usdCents(retailUnitPrice(game, p.id))}</b>
                  {locked && ` · Màn ${p.unlockStage}`}
                </div>
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 px-1">
                <button disabled={locked || q === 0} onClick={() => bump(p.id, -1)}
                  aria-label={`Bớt ${p.name}`} className="px-2 py-1 text-lg font-bold text-slate-400 disabled:text-slate-200">−</button>
                <span className="w-8 text-center font-bold">{q}</span>
                <button disabled={locked || q >= MAX} onClick={() => bump(p.id, 1)}
                  aria-label={`Thêm ${p.name}`} className="px-2 py-1 text-lg font-bold text-emerald-600 disabled:text-slate-200">＋</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-14 z-30 border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-md space-y-2 p-3">
          <div className="flex items-baseline justify-between text-xs text-slate-500">
            <span>{units} món (hạng B) {usdCents(goods)} + ship {usdCents(ship)}</span>
            <span className="text-base font-bold text-slate-900">{usdCents(goods + ship)}</span>
          </div>
          {overCap && <p className="text-xs font-bold text-red-600">Khu chờ kiểm sắp đầy — cần thêm ô trống trong kho.</p>}
          <div className="flex gap-2">
            <select value={carrierId} onChange={(e) => setCarrierId(e.target.value)}
              aria-label="Hãng vận chuyển"
              className="rounded-xl border border-slate-200 p-2 text-sm font-bold">
              {SUP.carriers.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name} {usdCents(c.fee)} · {c.daysDelta > 0 ? `+${c.daysDelta} ngày` : c.daysDelta < 0 ? `${c.daysDelta} ngày` : 'đúng hẹn'}
                </option>
              ))}
            </select>
            <button disabled={lines.length === 0} onClick={order}
              className="flex-1 rounded-xl bg-emerald-700 p-2 font-bold text-white disabled:bg-slate-300">
              Đặt hàng{sameDay ? ' · giao hôm nay' : ` · về sau ${carrier.daysDelta} ngày`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title }: { title: string }) {
  return <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h2>;
}
