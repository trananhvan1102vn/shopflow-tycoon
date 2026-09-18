import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store';
import { usd, usdCents } from '../format';
import { questsForStage } from '@shopflow/sim';
import { QUEST_LABEL } from '../goals';

interface Note { id: number; text: string; cls: string }

/** Toast cho các sự kiện sim không đi qua lastReject: hoàn trả, nhiệm vụ xong. */
export default function EventToasts() {
  const returned = useGame((s) => s.game?.returnedOrders ?? 0);
  const refunds = useGame((s) => s.game?.dayRefunds ?? 0);
  const questsDone = useGame((s) => s.game?.questsDone ?? []);
  const stage = useGame((s) => s.game?.stage ?? 1);
  const [notes, setNotes] = useState<Note[]>([]);
  const prev = useRef<{ returned: number; refunds: number; quests: number } | null>(null);
  const seq = useRef(0);
  const push = (text: string, cls: string) => {
    const id = ++seq.current;
    setNotes((n) => [...n, { id, text, cls }]);
    setTimeout(() => setNotes((n) => n.filter((x) => x.id !== id)), 3000);
  };
  useEffect(() => {
    const p = prev.current;
    prev.current = { returned, refunds, quests: questsDone.length };
    if (!p) return;
    if (returned > p.returned) {
      const n = returned - p.returned;
      // `dayRefunds` về 0 khi ngày vừa kết toán → delta âm/0: không có số tiền đáng tin để hiện.
      const delta = refunds - p.refunds;
      push(delta > 0 ? `↩️ Hoàn trả ${n} đơn · −${usdCents(delta)}` : `↩️ ${n} đơn hoàn trả`, 'bg-amber-600');
    }
    if (questsDone.length > p.quests) {
      const defs = questsForStage(stage);
      for (const id of questsDone.slice(p.quests)) {
        const bonus = defs.find((q) => q.id === id)?.bonus ?? 0;
        push(`✓ Nhiệm vụ: ${QUEST_LABEL[id] ?? id} +${usd(bonus)}`, 'bg-emerald-700');
      }
    }
  }, [returned, refunds, questsDone.length, stage]);
  if (notes.length === 0) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 top-28 z-50 flex -translate-x-1/2 flex-col gap-2">
      {notes.map((n) => (
        <div key={n.id} role="status" className={`rounded-lg px-4 py-2 text-sm font-bold text-white shadow-lg ${n.cls}`}>{n.text}</div>
      ))}
    </div>
  );
}
