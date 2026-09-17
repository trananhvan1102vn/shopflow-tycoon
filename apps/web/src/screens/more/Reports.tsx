import { useState } from 'react';
import { useGame } from '../../store';
import { usdCents } from '../../format';
import ReportBody from '../ReportBody';

/** C12 — lịch sử báo cáo cuối ngày, tối đa 30 ngày gần nhất trong danh sách. */
export default function Reports() {
  const game = useGame((s) => s.game);
  const [idx, setIdx] = useState<number | null>(null);
  if (!game) return null;
  const reports = game.reports;
  const last30 = reports.slice(-30);
  const total = last30.reduce((a, r) => a + r.net, 0);
  if (idx !== null) {
    return (
      <div className="space-y-3">
        <button onClick={() => setIdx(null)} className="text-sm font-bold text-emerald-700">← Danh sách</button>
        <div className="rounded-2xl bg-white p-5 shadow"><ReportBody r={reports[idx]} game={game} reports={reports} /></div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between"><h1 className="text-lg font-bold">Báo cáo cuối ngày</h1>
        <span className={`text-sm font-bold ${total >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>30 ngày: {total >= 0 ? '+' : ''}{usdCents(total)}</span></div>
      {reports.length === 0 && <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-500 shadow">Chưa có báo cáo nào — hết ngày đầu tiên sẽ có.</p>}
      {reports.map((r, i) => ({ r, i })).reverse().map(({ r, i }) => (
        <button key={i} onClick={() => setIdx(i)} className="flex w-full items-center justify-between rounded-xl bg-white p-3 text-left shadow">
          <span className="font-bold">Ngày {r.day} · Tháng {r.month}</span>
          <span className={`font-bold ${r.net >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{r.net >= 0 ? '+' : ''}{usdCents(r.net)}</span>
        </button>
      ))}
    </div>
  );
}
