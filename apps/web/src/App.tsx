import { useGame } from './store';
export default function App() {
  const { game, booted } = useGame();
  if (!booted) return <div className="p-8 text-center">Đang tải…</div>;
  return <div className="p-8 text-center font-bold">Shopflow Tycoon — {game ? 'game đang chạy' : 'chưa có game'}</div>;
}
