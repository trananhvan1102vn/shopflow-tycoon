import { useEffect, useRef, useState } from 'react';
import { channels as CH, industries as IND, stages as ST } from '@shopflow/data';
import { useGame } from '../store';
import { usdCents } from '../format';

const CH_ICON: Record<string, string> = { flea: '🛍️', mall: '🏬', social: '📣', website: '🌐' };
const CH_SHORT: Record<string, string> = { flea: 'Chợ Trời', mall: 'MegaMall', social: 'Social', website: 'Website' };

const PRODUCT_NAME: Record<string, string> = Object.fromEntries(
  (IND.industries as any[]).flatMap((i) => i.products.map((p: any) => [p.id, p.name])),
);

export default function SalesOrders() {
  const game = useGame((s) => s.game);
  const [filter, setFilter] = useState<string | null>(null);
  // `n` chỉ để ép effect hẹn giờ chạy lại khi cùng một thông báo lặp lại.
  const [expired, setExpired] = useState<{ msg: string; n: number } | null>(null);

  // Đơn quá hạn bị sim xoá thẳng khỏi `orders` (expireSla) — không đi qua `lastReject`,
  // nên Toast toàn cục không thấy. Phát hiện tại chỗ: hàng đợi tụt nhiều hơn số đơn
  // vừa giao xong ⇒ phần chênh là đơn quá hạn. Đơn mới sinh chỉ làm chênh lệch NHỎ đi,
  // nên phép so này không bao giờ báo nhầm (chỉ có thể đếm thiếu).
  const prev = useRef<{ len: number; done: number } | null>(null);
  const len = game?.orders.length ?? 0;
  const done = game?.completedOrders ?? 0;
  useEffect(() => {
    const p = prev.current;
    prev.current = { len, done };
    if (!p) return;
    const n = (p.len - len) - (done - p.done);
    if (n <= 0) return;
    setExpired((e) => ({
      msg: n === 1 ? 'Đơn quá hạn −0.1 ⭐' : `${n} đơn quá hạn −${(n * 0.1).toFixed(1)} ⭐`,
      n: (e?.n ?? 0) + 1,
    }));
  }, [len, done]);

  // Hẹn giờ tách riêng: nếu đặt chung effect trên, cleanup của nó sẽ huỷ timeout ngay
  // ở tick kế tiếp (mỗi giây) và thông báo không bao giờ tự tắt.
  const expiredN = expired?.n;
  useEffect(() => {
    if (expiredN === undefined) return;
    const t = setTimeout(() => setExpired(null), 2500);
    return () => clearTimeout(t);
  }, [expiredN]);

  if (!game) return null;

  const stage = (ST.stages as any[])[game.stage - 1] ?? {};
  const sla: number = stage.sla ?? 1440;
  const queueCap: number = stage.queueCap ?? 20;
  const combo = game.combo;
  const step = ST.combo.ordersPerStep as number;
  const maxBonus = ST.combo.maxBonus as number;
  const toNext = step - (game.onTimeStreak % step);
  const nextBonus = Math.min(maxBonus, combo + (ST.combo.bonusPerStep as number));
  const atMax = combo >= maxBonus;

  const counts = game.orders.reduce<Record<string, number>>((a, o) => {
    a[o.channelId] = (a[o.channelId] ?? 0) + 1;
    return a;
  }, {});
  const chips = (CH.channels as any[]).filter((d) => game.channels.some((c) => c.id === d.id));
  // Sắp xếp toàn bộ hàng đợi trước rồi mới lọc — số thứ tự phải là vị trí thật
  // trong hàng đợi, không phải vị trí trong danh sách đã lọc theo kênh.
  const sorted = [...game.orders].sort((a, b) => a.slaLeft - b.slaLeft);
  const rank = new Map(sorted.map((o, i) => [o.id, i + 1]));
  const rows = sorted.filter((o) => filter === null || o.channelId === filter);

  return (
    <div className="space-y-3">
      {expired && (
        <div
          role="status"
          className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-lg"
        >
          {expired.msg}
        </div>
      )}

      {/* ---- Băng combo ---- */}
      <div className="flex items-center gap-3 rounded-xl bg-white p-3 shadow">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-100 text-xl">⚡</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <h2 className="font-bold">Chuỗi giao đúng hạn: {game.onTimeStreak} đơn</h2>
            <span className="text-sm font-bold text-amber-600">Combo +{Math.round(combo * 100)}% doanh thu</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${atMax ? 100 : ((game.onTimeStreak % step) / step) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {atMax
              ? 'Đã đạt mức cộng tối đa · hủy 1 đơn về 0'
              : `Còn ${toNext} đơn nữa lên +${Math.round(nextBonus * 100)}% · hủy 1 đơn về 0`}
          </p>
        </div>
      </div>

      {/* ---- Lọc theo kênh ---- */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Chip active={filter === null} onClick={() => setFilter(null)} label={`Tất cả · ${game.orders.length}`} />
          {chips.map((d) => (
            <Chip
              key={d.id}
              active={filter === d.id}
              onClick={() => setFilter(filter === d.id ? null : d.id)}
              label={`${CH_SHORT[d.id]} · ${counts[d.id] ?? 0}`}
            />
          ))}
        </div>
      )}

      {/* ---- Hàng đợi ---- */}
      {rows.length === 0 ? (
        <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-500 shadow">
          {game.orders.length === 0 ? 'Chưa có đơn nào — mở kênh và nhập hàng để khách đặt.' : 'Không có đơn ở kênh này.'}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((o) => {
            const pct = Math.max(0, Math.min(100, (o.slaLeft / sla) * 100));
            const bar = pct > 50 ? 'bg-emerald-600' : pct > 20 ? 'bg-amber-500' : 'bg-red-600';
            const hours = Math.max(0, Math.floor(o.slaLeft / 60));
            const oos = (game.inventory[o.productId] ?? 0) <= 0;
            return (
              <div
                key={o.id}
                className={`flex items-center gap-3 rounded-xl bg-white p-3 shadow ${pct <= 20 ? 'ring-1 ring-red-300' : ''}`}
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-xl">
                  {CH_ICON[o.channelId] ?? '🛍️'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate font-bold">
                      {PRODUCT_NAME[o.productId] ?? o.productId} · {usdCents(o.value)}
                    </h3>
                    <span className={`shrink-0 text-xs font-bold ${
                      pct > 50 ? 'text-emerald-700' : pct > 20 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      còn {hours} giờ
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {CH_SHORT[o.channelId] ?? o.channelId} ·{' '}
                    {oos ? (
                      <>chờ hàng lên kệ — <b className="text-red-600">hết tồn!</b></>
                    ) : (
                      `trong hàng đợi (${rank.get(o.id)}/${queueCap})`
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-slate-400">Đơn quá hạn tự hủy: Rating −0.1 và mất chuỗi combo.</p>
    </div>
  );
}

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-sm ${
        active ? 'bg-slate-900 font-bold text-white' : 'bg-white text-slate-600 shadow'
      }`}
    >
      {label}
    </button>
  );
}
