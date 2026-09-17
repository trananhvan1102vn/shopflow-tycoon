import { useEffect, useRef, useState } from 'react';
import { channels as CH } from '@shopflow/data';
import type { DayReport } from '@shopflow/sim';
import { useGame } from '../store';
import { usdCents } from '../format';
import { sparklinePoints, sparklineZeroY } from '../report';

const CH_ICON: Record<string, string> = { flea: '🛍️', mall: '🏬', social: '📣', website: '🌐' };

/**
 * C10 — Báo cáo cuối ngày.
 * App gọi component này không điều kiện; nó tự theo dõi `reports.length` tăng
 * để bật modal và tạm dừng game.
 */
export default function DayReportModal() {
  const game = useGame((s) => s.game);
  const setModalPaused = useGame((s) => s.setModalPaused);
  const reports = game?.reports;
  const prevLen = useRef<number | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const len = reports?.length ?? 0;
    // Lần chạy đầu (kể cả khi load save đã có sẵn báo cáo) chỉ ghi mốc, không bật modal.
    if (prevLen.current === null) { prevLen.current = len; return; }
    if (len > prevLen.current) { setOpen(true); setModalPaused(true); }
    prevLen.current = len;
  }, [reports?.length, setModalPaused]);

  if (!open || !game || !reports || reports.length === 0) return null;
  const r = reports[reports.length - 1];

  const revenue = Object.values(r.revenueByChannel).reduce((a: number, b: number) => a + b, 0);
  const ordersTotal = Object.values(r.ordersByChannel).reduce((a: number, b: number) => a + b, 0);
  const spend = r.commission + r.channelFees + r.rent + r.maintenance + r.purchases + r.other;
  const suspended = game.channels.filter((c) => c.suspended);
  const last7 = reports.slice(-7).map((x: DayReport) => x.net);
  const points = sparklinePoints(last7);
  const zeroY = sparklineZeroY(last7);

  const rows = (CH.channels as any[])
    .map((d) => ({ id: d.id, name: d.name, rev: r.revenueByChannel[d.id] ?? 0, n: r.ordersByChannel[d.id] ?? 0 }))
    .filter((x) => x.rev !== 0 || x.n !== 0);

  const close = () => { setOpen(false); setModalPaused(false); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4"
      role="dialog" aria-modal="true" aria-label="Báo cáo cuối ngày">
      <div className="my-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Báo cáo cuối ngày</p>
            <h2 className="text-2xl font-bold">Ngày {r.day} · Tháng {r.month}</h2>
          </div>
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl ${
            r.net >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>{r.net >= 0 ? '📈' : '📉'}</span>
        </div>

        {/* ---- Thu ---- */}
        <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-emerald-700">
          Thu · {ordersTotal} đơn
        </h3>
        {rows.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">Hôm nay chưa có đơn nào.</p>
        ) : (
          rows.map((x) => (
            <div key={x.id} className="mt-1 flex justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-slate-700">{CH_ICON[x.id]} {x.name} · {x.n} đơn</span>
              <span className="shrink-0 font-bold">{usdCents(x.rev)}</span>
            </div>
          ))
        )}
        <div className="mt-2 flex justify-between gap-2 border-t border-slate-200 pt-2 text-sm">
          <span className="font-bold">Tổng doanh thu</span>
          <span className="font-bold text-emerald-600">{usdCents(revenue)}</span>
        </div>

        {/* ---- Chi ---- */}
        <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-rose-700">Chi</h3>
        <SpendRow label="Hoa hồng kênh" value={r.commission} />
        <SpendRow label="Phí kênh" value={r.channelFees} />
        <SpendRow label={`Thuê kho ${game.grid.size}×${game.grid.size}`} value={r.rent} />
        <SpendRow label="Bảo trì thiết bị" value={r.maintenance} />
        <SpendRow label="Nhập hàng" value={r.purchases} />
        {r.other !== 0 && <SpendRow label="Khác" value={r.other} />}
        <div className="mt-2 flex justify-between gap-2 border-t border-slate-200 pt-2 text-sm">
          <span className="font-bold">Tổng chi</span>
          <span className="font-bold text-rose-600">−{usdCents(spend)}</span>
        </div>

        {/* ---- Lãi ròng ---- */}
        <div className={`mt-4 flex items-center justify-between gap-2 rounded-xl p-4 ${
          r.net >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
          <span className="font-bold uppercase tracking-wide">Lãi ròng</span>
          <span className={`text-2xl font-bold ${r.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {r.net >= 0 ? '+' : ''}{usdCents(r.net)}
          </span>
        </div>

        {/* ---- Sparkline 7 ngày ---- */}
        <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">Lãi ròng 7 ngày</h3>
        {last7.length < 2 ? (
          <p className="mt-1 text-xs text-slate-400">Cần thêm một ngày nữa mới vẽ được biểu đồ.</p>
        ) : (
          <>
            <svg viewBox="0 0 320 48" preserveAspectRatio="none" className="mt-1 h-12 w-full"
              role="img" aria-label={`Lãi ròng ${last7.length} ngày gần nhất`}>
              {zeroY !== null && (
                <line x1="0" y1={zeroY} x2="320" y2={zeroY} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />
              )}
              <polyline points={points} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
                stroke={r.net >= 0 ? '#059669' : '#e11d48'} vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Ngày {reports[reports.length - last7.length].day}</span>
              <span>Hôm nay</span>
            </div>
          </>
        )}

        {/* ---- Cảnh báo kênh tạm ngưng ---- */}
        {suspended.map((c) => {
          const def = (CH.channels as any[]).find((d) => d.id === c.id);
          return (
            <p key={c.id} className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              <span aria-hidden>⚠️</span>
              <span>Kênh {def?.name ?? c.id} tạm ngưng vì thiếu phí — nạp thêm tiền để bán tiếp.</span>
            </p>
          );
        })}

        <button onClick={close}
          className="mt-4 w-full rounded-xl bg-emerald-700 p-3 font-bold text-white">
          Tiếp tục · Bắt đầu ngày {game.clock.day}
        </button>
      </div>
    </div>
  );
}

function SpendRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="mt-1 flex justify-between gap-2 text-sm">
      <span className="min-w-0 truncate text-slate-700">{label}</span>
      <span className="shrink-0 font-bold">{value === 0 ? '—' : `−${usdCents(value)}`}</span>
    </div>
  );
}
