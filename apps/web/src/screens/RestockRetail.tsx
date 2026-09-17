import { useEffect, useState } from 'react';
import { industries as IND, suppliers as SUP } from '@shopflow/data';
import { quoteRetail, pendingAuditCapacity } from '@shopflow/sim';
import { useGame } from '../store';
import { usdCents } from '../format';
import SupplierPicker from '../components/SupplierPicker';

const MAX = SUP.retail.maxPerOrder as number;

export default function RestockRetail() {
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const supplierId = useGame((s) => s.supplierId);
  const grade = useGame((s) => s.grade);
  const [industryId, setIndustryId] = useState<string | null>(null);
  const [carrierId, setCarrierId] = useState('standard');
  const [qty, setQty] = useState<Record<string, number>>({});
  // Đổi ngành hoặc nguồn hàng → xoá giỏ: MOQ có thể đổi theo nguồn, và thanh tổng/nút Đặt hàng
  // vẫn tính các sản phẩm không còn hiển thị nếu giữ lại.
  useEffect(() => setQty({}), [industryId, supplierId]);
  if (!game) return null;

  const owned = IND.industries.filter((i: any) => game.industries.includes(i.id));
  const ind = owned.find((i: any) => i.id === industryId) ?? owned[0];
  if (!ind) return null;

  const quote = (pid: string, q: number) => quoteRetail(game, pid, Math.max(1, q), { carrierId, supplierId, grade });
  const moq = quote(ind.products[0].id, 1).moq;
  const lines = Object.entries(qty).filter(([, q]) => q > 0);
  const goods = lines.reduce((a, [pid, q]) => a + quote(pid, q).goods, 0);
  // buyRetail tính phí ship cho TỪNG đơn hàng → mỗi sản phẩm có qty > 0 là một lần phí.
  const ship = lines.length ? quote(lines[0][0], 1).ship * lines.length : 0;
  const days = quote(ind.products[0].id, 1).days;
  const sameDay = days === 0;
  const units = lines.reduce((a, [, q]) => a + q, 0);
  const overCap = sameDay && units > pendingAuditCapacity(game);

  const bump = (pid: string, d: number) =>
    setQty((q) => ({ ...q, [pid]: Math.max(0, Math.min(MAX, (q[pid] ?? 0) + d * moq)) }));

  const order = () => {
    for (const [pid, q] of lines) dispatch('buyRetail', pid, q, { carrierId, supplierId, grade });
    setQty({});
  };

  return (
    <div className="space-y-3 pb-28">
      <SupplierPicker />

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
                  {' '}Nhập <b className="text-slate-800">{usdCents(quote(p.id, 1).unit)}</b>
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
            <span>{units} món (hạng {grade}) {usdCents(goods)} + ship {usdCents(ship)}</span>
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
              Đặt hàng · {sameDay ? 'giao hôm nay' : `về sau ${days} ngày`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
