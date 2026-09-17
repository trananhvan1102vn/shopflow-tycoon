import { useState } from 'react';
import { useGame } from '../../store';

/** C11 — cài đặt: chơi lại hướng dẫn, chơi mới (xoá bản lưu). */
export default function Settings() {
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const newGame = useGame((s) => s.newGame);
  const [confirm, setConfirm] = useState(false);
  if (!game) return null;
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">Cài đặt</h1>
      <div className="rounded-xl bg-white p-3 shadow">
        <div className="font-bold">Hướng dẫn</div>
        <p className="text-xs text-slate-500">Chơi lại 8 bước hướng dẫn. {game.tutorial.rewarded ? 'Thưởng $200 đã nhận, không nhận lại.' : 'Hoàn thành để nhận $200.'}</p>
        <button onClick={() => dispatch('tutorialReset')} className="mt-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">Chơi lại hướng dẫn</button>
      </div>
      <div className="rounded-xl bg-white p-3 shadow">
        <div className="font-bold text-rose-700">Chơi mới</div>
        <p className="text-xs text-slate-500">Xoá bản lưu hiện tại (màn {game.stage}, {game.completedOrders} đơn) và bắt đầu lại từ chọn ngành.</p>
        {!confirm ? (
          <button onClick={() => setConfirm(true)} className="mt-2 rounded-xl bg-rose-600 px-3 py-2 text-sm font-bold text-white">Chơi mới…</button>
        ) : (
          <div className="mt-2 flex gap-2">
            <button onClick={newGame} className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-bold text-white">Xoá và chơi mới</button>
            <button onClick={() => setConfirm(false)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">Huỷ</button>
          </div>
        )}
      </div>
      <p className="text-center text-xs text-slate-400">Shopflow Tycoon · M2a · lưu tự động mỗi 60 giây</p>
    </div>
  );
}
