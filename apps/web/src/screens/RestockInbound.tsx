import { useRef } from 'react';
import { industries as IND, suppliers as SUP } from '@shopflow/data';
import type { Delivery } from '@shopflow/sim';
import { useGame } from '../store';
import { usdCents } from '../format';

const PRODUCT_NAME: Record<string, string> = Object.fromEntries(
  IND.industries.flatMap((i: any) => i.products.map((p: any) => [p.id, p.name] as const)),
);

const carrierName = (id: string) => SUP.carriers.find((c: any) => c.id === id)?.name ?? id;
const SUPPLIER_NAME = (id: string) => (SUP.tiers as any[]).find((t) => t.id === id)?.name ?? id;
const RISK_TAG: Record<string, string> = { delay: '⏳ Trễ +1 ngày', customs: '🛃 Hải quan +2 ngày', loss: '📉 Mất 10% lô' };

export default function RestockInbound() {
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  // Delivery không lưu tổng số ngày ban đầu, nên ghi nhớ daysLeft lớn nhất từng thấy để vẽ thanh tiến độ.
  const maxDays = useRef<Record<string, number>>({});
  if (!game) return null;

  const shipping = game.deliveries.filter((d) => d.state === 'shipping');
  const auditing = game.deliveries.filter((d) => d.state === 'auditing');
  const packers = game.grid.cells.filter((c) => c && c.type === 'packer').length;
  const stock = Object.values(game.inventory).reduce((a: number, b: number) => a + b, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-white p-2 text-center text-xs shadow">
        <Step icon="🚚" label="1. Vận chuyển" value={shipping.length} />
        <Step icon="🔍" label="2. Kiểm hàng" value={game.unchecked} />
        <Step icon="📚" label="3. Lên kệ" value={stock} />
        <Step icon="📦" label="4. Bán ra" value={game.orders.length} />
      </div>

      {game.deliveries.length === 0 && (
        <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-500 shadow">
          Chưa có lô hàng nào đang về. Đặt hàng ở tab <b>Nhập lẻ</b> hoặc <b>Gói sỉ</b>.
        </p>
      )}

      {shipping.map((d) => {
        const total = (maxDays.current[d.id] = Math.max(maxDays.current[d.id] ?? 0, d.daysLeft));
        const pct = Math.round((1 - d.daysLeft / Math.max(1, total)) * 100);
        const express = SUP.carriers.find((c: any) => c.id === 'express')!;
        const current = SUP.carriers.find((c: any) => c.id === d.carrierId)!;
        return (
          <div key={d.id} className="rounded-xl border-2 border-blue-200 bg-white p-3 shadow">
            <div className="flex items-center justify-between text-xs">
              <span className="rounded-full bg-blue-100 px-2 py-0.5 font-bold text-blue-700">ĐANG VẬN CHUYỂN</span>
              <span className="font-bold text-blue-700">Về sau {d.daysLeft} ngày</span>
            </div>
            <div className="mt-1 font-bold">#{d.id} · {summary(d)}</div>
            <div className="text-xs text-slate-500">
              {SUPPLIER_NAME(d.supplierId)} · {carrierName(d.carrierId)} · hạng {d.grade} · {usdCents(d.cost)}
            </div>
            {d.risk && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">{RISK_TAG[d.risk]}</span>}
            <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
              <div className="h-2 rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
            </div>
            {d.carrierId !== 'express' && (
              <button onClick={() => dispatch('expediteDelivery', d.id)}
                className="mt-2 w-full rounded-xl border border-slate-200 p-2 text-sm font-bold">
                ⚡ Nâng lên Hỏa tốc · +{usdCents(express.fee - current.fee)} · về sớm 1 ngày
              </button>
            )}
          </div>
        );
      })}

      {auditing.map((d) => {
        const pct = Math.round((d.itemsChecked / Math.max(1, d.itemsTotal)) * 100);
        return (
          <div key={d.id} className="rounded-xl border-2 border-orange-200 bg-white p-3 shadow">
            <div className="flex items-center justify-between text-xs">
              <span className="rounded-full bg-orange-100 px-2 py-0.5 font-bold text-orange-700">ĐANG KIỂM HÀNG</span>
              <span className="font-bold text-orange-700">Đã về kho</span>
            </div>
            <div className="mt-1 font-bold">#{d.id} · {summary(d)}</div>
            <div className="text-xs text-slate-500">
              {SUPPLIER_NAME(d.supplierId)} · {carrierName(d.carrierId)} · hạng {d.grade} · {usdCents(d.cost)}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-slate-200">
                <div className="h-2 rounded-full bg-orange-500" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs font-bold text-orange-600">{d.itemsChecked} / {d.itemsTotal}</span>
            </div>
            {packers <= 1 && (
              <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
                Thêm bàn đóng gói để kiểm nhanh hơn.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function summary(d: Delivery): string {
  const parts = Object.entries(d.items).map(([pid, n]) => `${n} ${PRODUCT_NAME[pid] ?? pid}`);
  return `${parts.slice(0, 2).join(' · ')}${parts.length > 2 ? ` +${parts.length - 2} loại` : ''} · ${d.itemsTotal} món`;
}

function Step({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 py-1">
      <div className="text-lg leading-none">{icon}</div>
      <div className="mt-0.5 text-slate-500">{label}</div>
      <div className="font-bold text-slate-800">{value}</div>
    </div>
  );
}
