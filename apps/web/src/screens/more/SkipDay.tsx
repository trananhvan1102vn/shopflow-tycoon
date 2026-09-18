import { useEffect, useState } from 'react';
import { useGame } from '../../store';
import { gameTime } from '../../format';
import { skipDayInfo } from '../../skipDay';

export default function SkipDay() {
  const game = useGame((s) => s.game);
  const skipDay = useGame((s) => s.skipDay);
  const [done, setDone] = useState(false);
  useEffect(() => setDone(false), [game?.clock.day, game?.stageComplete]);
  if (!game) return null;
  const info = skipDayInfo(game);
  const h = Math.floor(info.minutesLeft / 60), m = info.minutesLeft % 60;
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">Qua ngày</h1>
      <div className="rounded-xl bg-white p-4 shadow">
        <p className="text-sm text-slate-700">Bây giờ là <b>{gameTime(game.clock.minute)}</b> · còn <b>{h} giờ {String(m).padStart(2, '0')} phút</b> tới 00:00.</p>
        <p className="mt-1 text-xs text-slate-500">Mô phỏng chạy thật tới nửa đêm: khách vẫn đặt, đơn quá hạn vẫn hủy, phí ngày vẫn trừ. Sau đó hiện Báo cáo cuối ngày.</p>
        {info.atRisk > 0 && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-800">⚠️ {info.atRisk} đơn đang chờ có thể quá hạn trước 00:00.</p>
        )}
        <button onClick={() => { skipDay(); setDone(true); }} disabled={done}
          className="mt-3 w-full rounded-xl bg-emerald-700 p-3 font-bold text-white disabled:bg-slate-300">
          {done ? 'Đang tua…' : '⏭ Qua ngày'}
        </button>
      </div>
    </div>
  );
}
