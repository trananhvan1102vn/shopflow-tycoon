import { suppliers as SUP } from '@shopflow/data';
import { supplierUnlocked, gradeAllowed, relationshipXp, relationshipDiscount, gradeCostMult } from '@shopflow/sim';
import { useGame } from '../store';

const GRADES = ['A', 'B', 'C'] as const;
const RISK_TEXT: Record<string, string> = {
  regional: '5% trễ 1 ngày',
  overseas: '10% hải quan +2 ngày · 3% mất 10% lô',
};

/** Hàng chip nguồn + hạng dùng chung cho Nhập lẻ và Gói sỉ; lựa chọn nằm trong store. */
export default function SupplierPicker() {
  const game = useGame((s) => s.game);
  const supplierId = useGame((s) => s.supplierId);
  const grade = useGame((s) => s.grade);
  const setSupplier = useGame((s) => s.setSupplier);
  const setGrade = useGame((s) => s.setGrade);
  if (!game) return null;
  const relOpen = game.stage >= 3;
  const tier = (SUP.tiers as any[]).find((t) => t.id === supplierId);

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Nguồn hàng</h2>
      <div className="grid grid-cols-3 gap-2">
        {(SUP.tiers as any[]).map((t) => {
          const locked = !supplierUnlocked(game, t.id);
          const active = t.id === supplierId;
          return (
            <button key={t.id} disabled={locked} onClick={() => { setSupplier(t.id); if (!gradeAllowed(game, t.id, grade)) setGrade('B'); }}
              aria-pressed={active}
              className={`rounded-xl border-2 bg-white p-2 text-left text-xs shadow ${
                locked ? 'border-slate-200 text-slate-400' : active ? 'border-emerald-600' : 'border-slate-200'}`}>
              <div className="font-bold">{locked ? '🔒 ' : ''}{t.name}</div>
              <div className="mt-0.5">{t.costMult < 1 ? `−${Math.round((1 - t.costMult) * 100)}%` : 'giá gốc'} · {t.extraDays === 0 ? 'giao ngay' : `+${t.extraDays} ngày`}</div>
              {locked ? <div className="mt-0.5 font-bold">Màn {t.unlockStage}</div>
                : RISK_TEXT[t.id] && <div className="mt-0.5 text-amber-700">{RISK_TEXT[t.id]}</div>}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl bg-white p-3 text-xs shadow">
        {relOpen ? (() => {
          const rel = relationshipXp(game, supplierId);
          const levels = SUP.relationship.levels as any[];
          const perks = [levels[rel.level]?.exclusiveBundle && 'hạng A giá hạng B', levels[rel.level]?.daysDelta && 'giao sớm 1 ngày'].filter(Boolean);
          const pctToNext = rel.nextXp === null ? 100 : Math.round(((rel.xp - levels[rel.level].xp) / (rel.nextXp - levels[rel.level].xp)) * 100);
          return (
            <>
              <div className="flex items-baseline justify-between">
                <span className="font-bold">Quan hệ · cấp {rel.level + 1}</span>
                <span className="text-emerald-700">giảm {Math.round(relationshipDiscount(game, supplierId) * 100)}%</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-200"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${pctToNext}%` }} /></div>
              <div className="mt-1 text-slate-500">
                {rel.nextXp === null ? 'Cấp tối đa' : `${rel.xp}/${rel.nextXp} XP · $100 chi = 1 XP`}
                {perks.length > 0 && ` · ${perks.join(' · ')}`}
              </div>
            </>
          );
        })() : (
          <div className="text-slate-400">Quan hệ nhà cung cấp mở ở màn 3</div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Hạng · % trả</h2>
        <div className="ml-auto flex gap-1">
          {GRADES.map((g) => {
            const allowed = gradeAllowed(game, supplierId, g);
            const active = g === grade;
            const perk = g === 'A' && gradeCostMult(game, supplierId, 'A') === SUP.grades.B.costMult;
            // Hạng có trong `grades` của nguồn nhưng bị `gradesStage1` chặn ở màn 1 sẽ mở ở màn 2
            // (gradesStage1 chỉ áp dụng khi stage === 1, nên mốc mở luôn là 1 + 1 — không phải hằng số tuỳ ý).
            const opensStage2 = !allowed && game.stage === 1 && tier?.gradesStage1
              && tier.grades.includes(g) && !tier.gradesStage1.includes(g);
            return (
              <button key={g} disabled={!allowed} onClick={() => setGrade(g)} aria-pressed={active}
                className={`rounded-full px-3 py-1 text-xs ${active ? 'bg-slate-900 font-bold text-white' : allowed ? 'bg-slate-100 text-slate-600' : 'bg-slate-100 text-slate-300'}`}>
                {g} · {Math.round(SUP.grades[g].returnRate * 100)}%{perk ? ' ★' : ''}{opensStage2 ? ` · Màn ${1 + 1}` : ''}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
