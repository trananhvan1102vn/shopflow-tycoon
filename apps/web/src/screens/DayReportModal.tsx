import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store';
import ReportBody from './ReportBody';

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

  const close = () => { setOpen(false); setModalPaused(false); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4"
      role="dialog" aria-modal="true" aria-label="Báo cáo cuối ngày">
      <div className="my-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <ReportBody r={r} game={game} reports={reports} />

        <button onClick={close}
          className="mt-4 w-full rounded-xl bg-emerald-700 p-3 font-bold text-white">
          Tiếp tục · Bắt đầu ngày {game.clock.day}
        </button>
      </div>
    </div>
  );
}
