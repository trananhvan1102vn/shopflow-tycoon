import { useState } from 'react';
import { industries as IND } from '@shopflow/data';
import { useGame } from '../store';
import { usd } from '../format';

const ICONS: Record<string, string> = { electronics: '📱', fashion: '👗', home: '🏠', books: '📚', toys: '🎮', beauty: '💄', sports: '⚽', pets: '🐾' };

export default function IndustrySelect() {
  const start = useGame((s) => s.start);
  const [sel, setSel] = useState<string | null>(null);
  const starters = IND.industries.filter((i) => i.unlock === 'start-option');
  const locked = IND.industries.filter((i) => i.unlock !== 'start-option');
  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <h1 className="mb-1 text-xl font-bold">Sếp có $1,000. Sếp muốn bán gì trước?</h1>
      <p className="mb-4 text-sm text-slate-500">Đổi được trong 5 phút đầu.</p>
      <div className="space-y-3">
        {starters.map((i) => (
          <button key={i.id} onClick={() => setSel(i.id)}
            className={`w-full rounded-xl bg-white p-4 text-left shadow ${sel === i.id ? 'ring-2 ring-emerald-500' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="font-bold">{ICONS[i.id]} {i.name}</span>
              <span className="text-emerald-600" title="Tốc độ có đơn">
                {'▮'.repeat(Math.min(5, Math.round(i.V * 3)))}<span className="text-slate-200">{'▮'.repeat(Math.max(0, 5 - Math.round(i.V * 3)))}</span>
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {i.products.slice(0, 3).map((p) => (
                <span key={p.id} className="rounded bg-slate-100 px-2 py-0.5 text-xs">{p.name} {usd(p.retail)}</span>
              ))}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {locked.map((i) => (
          <span key={i.id} className="rounded-lg bg-slate-200 px-3 py-1 text-sm text-slate-500">🔒 {ICONS[i.id]} {i.name}</span>
        ))}
      </div>
      <button disabled={!sel} onClick={() => sel && start(sel)}
        className="fixed inset-x-4 bottom-4 mx-auto max-w-md rounded-xl bg-emerald-600 p-3 font-bold text-white disabled:bg-slate-300">
        {sel ? `Bắt đầu với ${starters.find((i) => i.id === sel)!.name}` : 'Chọn một ngành'}
      </button>
    </div>
  );
}
