import { useState } from 'react';
import { useGame } from './store';
import IndustrySelect from './screens/IndustrySelect';
import Warehouse from './screens/Warehouse';
import Restock from './screens/Restock';
import Hud from './components/Hud';
import TabBar, { type Tab } from './components/TabBar';
import Toast from './components/Toast';

/** Placeholder cho các màn sẽ làm ở task sau. */
const PLACEHOLDERS: Record<Exclude<Tab, 'kho' | 'nhap'>, string> = {
  ban: '🛍️ Bán hàng — sắp có',
  quangba: '🔍 Quảng bá — sắp có',
  them: '🔒 Mở ở màn 3',
};

export default function App() {
  const game = useGame((s) => s.game);
  const booted = useGame((s) => s.booted);
  const [tab, setTab] = useState<Tab>('kho');

  if (!booted) return <div className="p-8 text-center">Đang tải…</div>;
  if (!game) return <IndustrySelect />;

  return (
    <div className="min-h-screen bg-slate-50">
      <Hud />
      <main className="mx-auto max-w-md p-4 pb-24">
        {tab === 'kho' ? (
          <Warehouse />
        ) : tab === 'nhap' ? (
          <Restock />
        ) : (
          <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow">{PLACEHOLDERS[tab]}</div>
        )}
      </main>
      <TabBar tab={tab} setTab={setTab} />
      <Toast />
    </div>
  );
}
