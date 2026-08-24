import { useState } from 'react';
import { industries as IND } from '@shopflow/data';
import { useGame } from '../store';
import { usd } from '../format';

const ICONS: Record<string, string> = { electronics: '📱', fashion: '👗', home: '🏠', books: '📚', toys: '🎮', beauty: '💄', sports: '⚽', pets: '🐾' };

/**
 * `mode='start'` — màn chọn ngành đầu game (mặc định, hành vi cũ): xác nhận → `start(id)`.
 * `mode='next'` — mở ngành thứ N sau khi qua màn: loại ngành đã sở hữu,
 * xác nhận → `dispatch('chooseIndustry', id)` rồi gọi `onDone`.
 */
export default function IndustrySelect({ mode = 'start', onDone }: {
  mode?: 'start' | 'next';
  onDone?: () => void;
} = {}) {
  const start = useGame((s) => s.start);
  const dispatch = useGame((s) => s.dispatch);
  const owned = useGame((s) => s.game?.industries) ?? [];
  const [sel, setSel] = useState<string | null>(null);
  const next = mode === 'next';
  const pickable = IND.industries.filter(
    (i: any) => i.unlock === 'start-option' && (!next || !owned.includes(i.id)),
  );
  const locked = IND.industries.filter((i: any) => i.unlock !== 'start-option');
  const confirm = () => {
    if (!sel) return;
    if (next) { dispatch('chooseIndustry', sel); onDone?.(); } else start(sel);
  };
  const body = (
    <div className="mx-auto max-w-md p-4 pb-28">
      {next && <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Mở rộng</p>}
      <h1 className="mb-1 text-xl font-bold">
        {next ? 'Sếp muốn mở thêm ngành nào?' : 'Sếp có $1,000. Sếp muốn bán gì trước?'}
      </h1>
      <p className="mb-4 text-sm text-slate-500">
        {next
          ? 'Ngành mới chưa có tồn kho — dùng Nhập lẻ để thử trước khi gom sỉ.'
          : 'Đổi được trong 5 phút đầu.'}
      </p>
      <div className="space-y-3">
        {pickable.map((i: any) => (
          <button key={i.id} onClick={() => setSel(i.id)}
            className={`w-full rounded-xl bg-white p-4 text-left shadow ${sel === i.id ? 'ring-2 ring-emerald-500' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="font-bold">{ICONS[i.id]} {i.name}</span>
              <span className="text-emerald-600" title="Tốc độ có đơn">
                {'▮'.repeat(Math.min(5, Math.round(i.V * 3)))}<span className="text-slate-200">{'▮'.repeat(Math.max(0, 5 - Math.round(i.V * 3)))}</span>
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {i.products.slice(0, 3).map((p: any) => (
                <span key={p.id} className="rounded bg-slate-100 px-2 py-0.5 text-xs">{p.name} {usd(p.retail)}</span>
              ))}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {locked.map((i: any) => (
          <span key={i.id} className="rounded-lg bg-slate-200 px-3 py-1 text-sm text-slate-500">🔒 {ICONS[i.id]} {i.name}</span>
        ))}
      </div>
      <button disabled={!sel} onClick={confirm}
        className="fixed inset-x-4 bottom-4 z-10 mx-auto max-w-md rounded-xl bg-emerald-600 p-3 font-bold text-white disabled:bg-slate-300">
        {sel
          ? `${next ? 'Mở ngành' : 'Bắt đầu với'} ${pickable.find((i: any) => i.id === sel)!.name}`
          : 'Chọn một ngành'}
      </button>
    </div>
  );

  // `mode='next'` chạy đè lên màn chơi (App vẫn render Hud/TabBar bên dưới), nên
  // phải là overlay toàn màn hình. `z-50` > `z-40` của TabBar; container fixed +
  // z-index tạo stacking context riêng nên nút xác nhận (cũng `fixed`, neo theo
  // viewport vì không có ancestor nào transform) luôn nằm trên TabBar.
  if (!next) return body;
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50">{body}</div>;
}
