import { useState } from 'react';
import Upgrades from './more/Upgrades';
import Reports from './more/Reports';
import Settings from './more/Settings';
import SkipDay from './more/SkipDay';

type Sub = null | 'quangay' | 'nangcap' | 'baocao' | 'caidat';
const ITEMS: { id: Exclude<Sub, null>; icon: string; title: string; hint: string }[] = [
  { id: 'quangay', icon: '⏭', title: 'Qua ngày', hint: 'Tua tới 00:00 · đơn, SLA và chi phí vẫn tính' },
  { id: 'nangcap', icon: '🧰', title: 'Nâng cấp', hint: '6 nâng cấp vĩnh viễn · mở ở màn 3' },
  { id: 'baocao', icon: '📊', title: 'Báo cáo', hint: 'Xem lại báo cáo cuối ngày' },
  { id: 'caidat', icon: '⚙️', title: 'Cài đặt', hint: 'Chơi mới · chơi lại hướng dẫn' },
];

/** C12/C10/C11 gộp — "Thêm" là danh sách các mục, mỗi mục mở một màn con. */
export default function More() {
  const [sub, setSub] = useState<Sub>(null);
  if (sub) {
    const Screen = sub === 'quangay' ? SkipDay : sub === 'nangcap' ? Upgrades : sub === 'baocao' ? Reports : Settings;
    return (
      <div className="space-y-3">
        <button onClick={() => setSub(null)} className="text-sm font-bold text-emerald-700">← Thêm</button>
        <Screen />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {ITEMS.map((it) => (
        <button key={it.id} onClick={() => setSub(it.id)} className="flex w-full items-center gap-3 rounded-xl bg-white p-4 text-left shadow">
          <span className="text-2xl">{it.icon}</span>
          <span className="min-w-0 flex-1"><span className="block font-bold">{it.title}</span><span className="block text-xs text-slate-500">{it.hint}</span></span>
          <span className="text-slate-300">›</span>
        </button>
      ))}
    </div>
  );
}
