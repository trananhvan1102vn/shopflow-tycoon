import { useEffect, useState } from 'react';
import { useGame } from './store';
import IndustrySelect from './screens/IndustrySelect';
import DayReportModal from './screens/DayReportModal';
import WelcomeBack from './screens/WelcomeBack';
import StageComplete from './screens/StageComplete';
import Warehouse from './screens/Warehouse';
import Restock from './screens/Restock';
import Sales from './screens/Sales';
import Promo from './screens/Promo';
import More from './screens/More';
import Hud from './components/Hud';
import TabBar, { type Tab } from './components/TabBar';
import Toast from './components/Toast';
import EventToasts from './components/EventToasts';
import TutorialCard from './components/TutorialCard';

export default function App() {
  const game = useGame((s) => s.game);
  const booted = useGame((s) => s.booted);
  const markVisited = useGame((s) => s.markVisited);
  const [tab, setTab] = useState<Tab>('kho');
  // `stageComplete` tắt ngay khi `advanceStage` chạy, nhưng overlay còn bước chọn
  // ngành phía sau → chốt cờ riêng ở đây, StageComplete tự gọi onClose khi xong.
  const [stageOverlay, setStageOverlay] = useState(false);
  const stageComplete = game?.stageComplete ?? false;
  useEffect(() => { if (stageComplete) setStageOverlay(true); }, [stageComplete]);
  useEffect(() => { markVisited(tab); }, [tab, markVisited]);

  if (!booted) return <div className="p-8 text-center">Đang tải…</div>;
  if (!game) return <IndustrySelect />;

  return (
    <div className="min-h-screen bg-slate-50">
      <Hud />
      <main className={`mx-auto max-w-md p-4 ${game.tutorial.done ? 'pb-24' : 'pb-36'}`}>
        {tab === 'kho' ? (
          <Warehouse />
        ) : tab === 'nhap' ? (
          <Restock />
        ) : tab === 'ban' ? (
          <Sales />
        ) : tab === 'quangba' ? (
          <Promo />
        ) : (
          <More />
        )}
      </main>
      <TabBar tab={tab} setTab={setTab} />
      <TutorialCard tab={tab} setTab={setTab} />
      <DayReportModal />
      <WelcomeBack />
      {stageOverlay && <StageComplete onClose={() => setStageOverlay(false)} />}
      <Toast />
      <EventToasts />
    </div>
  );
}
