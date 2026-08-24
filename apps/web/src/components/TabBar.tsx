export type Tab = 'kho' | 'nhap' | 'ban' | 'quangba' | 'them';

export const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'kho', icon: '📦', label: 'Kho' },
  { id: 'nhap', icon: '🚚', label: 'Nhập' },
  { id: 'ban', icon: '🛍️', label: 'Bán' },
  { id: 'quangba', icon: '🔍', label: 'Quảng bá' },
  { id: 'them', icon: '⋯', label: 'Thêm' },
];

export default function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-md">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${tab === t.id ? 'font-bold text-emerald-600' : 'text-slate-500'}`}
          >
            <span className="text-xl leading-none">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
