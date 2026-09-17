import { industries as IND, calendar as CAL } from '@shopflow/data';
import { useGame } from '../store';
import { usdCents } from '../format';
import { elapsedText } from '../offline';

const PRODUCT_NAME: Record<string, string> = Object.fromEntries((IND.industries as any[]).flatMap((i) => i.products.map((p: any) => [p.id, p.name])));
const EVENT_NAME = (id: string) => (CAL.events as any[]).find((e) => e.id === id)?.name ?? id;

/** C15 — tóm tắt thời gian vắng mặt; game đang tạm dừng cho tới khi bấm Nhận. */
export default function WelcomeBack() {
  const sum = useGame((s) => s.offlineSummary);
  const dismiss = useGame((s) => s.dismissOffline);
  if (!sum) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-label="Chào mừng trở lại">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Chào mừng trở lại</p>
        <h2 className="text-2xl font-bold">Sếp vắng {elapsedText(sum.ticks)}</h2>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Tile label="Đã giao" value={String(sum.ordersDelivered)} />
          <Tile label="Quá hạn" value={String(sum.ordersCancelled)} tone={sum.ordersCancelled > 0 ? 'rose' : undefined} />
          <Tile label="Hoàn trả" value={String(sum.ordersReturned)} />
        </div>
        <Row label="Doanh thu (đã trừ hoa hồng)" value={`+${usdCents(sum.netRevenue)}`} cls="text-emerald-700" />
        {sum.daysSettled > 0 && (
          <Row label={`Chi phí ${sum.daysSettled} ngày (thuê, bảo trì, phí kênh)`} value={`−${usdCents(sum.feesPaid)}`} cls="text-rose-600" />
        )}
        {sum.eventsStarted.length > 0 && <Row label="Sự kiện bắt đầu" value={sum.eventsStarted.map(EVENT_NAME).join(', ')} />}
        {sum.eventsEnded.length > 0 && <Row label="Sự kiện đã qua" value={sum.eventsEnded.map(EVENT_NAME).join(', ')} />}
        {sum.lowStock.length > 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">⚠️ Tồn thấp: {sum.lowStock.map((id) => PRODUCT_NAME[id] ?? id).join(', ')}</p>
        )}
        {sum.stageCompleted && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">🏆 Đã đạt mục tiêu màn trong lúc sếp vắng!</p>}
        <button onClick={dismiss} className="mt-4 w-full rounded-xl bg-emerald-700 p-3 font-bold text-white">Nhận</button>
      </div>
    </div>
  );
}
function Tile({ label, value, tone }: { label: string; value: string; tone?: 'rose' }) {
  return <div className="rounded-xl bg-slate-100 p-3"><div className="text-xs text-slate-500">{label}</div><div className={`text-lg font-bold ${tone === 'rose' ? 'text-rose-600' : ''}`}>{value}</div></div>;
}
function Row({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return <div className="mt-2 flex justify-between gap-2 text-sm"><span className="text-slate-600">{label}</span><span className={`shrink-0 font-bold ${cls}`}>{value}</span></div>;
}
