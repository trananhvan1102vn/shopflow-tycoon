import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store';
import { usd, usdCents } from '../format';
import { questsForStage, randomEventDef } from '@shopflow/sim';
import { QUEST_LABEL } from '../goals';
import { diffEventKeys, RANDOM_EVENT_NAME } from '../eventText';

interface Note { id: number; text: string; cls: string }

/** Toast cho các sự kiện sim không đi qua lastReject: hoàn trả, nhiệm vụ xong, sự kiện ngẫu nhiên. */
export default function EventToasts() {
  const returned = useGame((s) => s.game?.returnedOrders ?? 0);
  const refunds = useGame((s) => s.game?.dayRefunds ?? 0);
  const questsDone = useGame((s) => s.game?.questsDone ?? []);
  const stage = useGame((s) => s.game?.stage ?? 1);
  const activeRandomEvents = useGame((s) => s.game?.activeRandomEvents ?? []);
  const priceWarsWon = useGame((s) => s.game?.priceWarsWon ?? 0);
  // Khoá theo INSTANCE (`id@endsDay`), không phải theo id trần: một sự kiện cùng id khởi động lại
  // ngay trong cùng lần settle (cái cũ vừa hết, cái mới bắt đầu) có `endsDay` khác nên vẫn tạo ra
  // hai khoá khác nhau — nếu chỉ nối id, chuỗi trước/sau trùng nhau và cả hai toast sẽ biến mất.
  const eventKeys = activeRandomEvents.map((e) => `${e.id}@${e.endsDay}`).join(',');
  const [notes, setNotes] = useState<Note[]>([]);
  const prev = useRef<{ returned: number; refunds: number; quests: number; eventKeys: string; priceWarsWon: number } | null>(null);
  const seq = useRef(0);
  const push = (text: string, cls: string) => {
    const id = ++seq.current;
    setNotes((n) => [...n, { id, text, cls }]);
    setTimeout(() => setNotes((n) => n.filter((x) => x.id !== id)), 3000);
  };
  useEffect(() => {
    const p = prev.current;
    prev.current = { returned, refunds, quests: questsDone.length, eventKeys, priceWarsWon };
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
    if (eventKeys !== p.eventKeys) {
      const before = p.eventKeys ? p.eventKeys.split(',') : [];
      const after = eventKeys ? eventKeys.split(',') : [];
      const { started, ended } = diffEventKeys(before, after);
      for (const key of started) push(`⚡ ${RANDOM_EVENT_NAME(key.split('@')[0])} bắt đầu`, 'bg-violet-700');
      for (const key of ended) {
        const id = key.split('@')[0];
        const def = randomEventDef(id);
        if (def?.effects.rivalPriceMult != null) {
          const won = priceWarsWon > p.priceWarsWon;
          push(won ? '🏆 Thắng chiến giá!' : 'Thua chiến giá', won ? 'bg-emerald-700' : 'bg-rose-600');
        } else {
          push(`${RANDOM_EVENT_NAME(id)} kết thúc`, 'bg-violet-700');
        }
      }
    }
  }, [returned, refunds, questsDone.length, stage, eventKeys, priceWarsWon]);
  if (notes.length === 0) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 top-40 z-50 flex -translate-x-1/2 flex-col gap-2">
      {notes.map((n) => (
        <div key={n.id} role="status" className={`rounded-lg px-4 py-2 text-sm font-bold text-white shadow-lg ${n.cls}`}>{n.text}</div>
      ))}
    </div>
  );
}
