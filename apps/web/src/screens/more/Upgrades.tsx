import { upgrades as UP } from '@shopflow/data';
import { useGame } from '../../store';
import { usd } from '../../format';
import { upgradeEffectText } from '../../report';

const ICON: Record<string, string> = { routing: '🚚', seo_pro: '🔍', robot_fast: '🤖', cs: '🎧', wholesale: '📜', negotiator: '🤝' };

/** C12 — 6 nâng cấp vĩnh viễn, mở ở màn 3. */
export default function Upgrades() {
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  if (!game) return null;
  const locked = game.stage < 3;
  return (
    <div className="space-y-2">
      <h1 className="text-lg font-bold">Nâng cấp vĩnh viễn</h1>
      {locked && <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-600">🔒 Mở ở màn 3.</p>}
      {(UP.upgrades as any[]).map((u) => {
        const owned = game.upgrades.includes(u.id);
        return (
          <div key={u.id} className={`flex items-center gap-3 rounded-xl bg-white p-3 shadow ${locked ? 'opacity-60' : ''}`}>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-50 text-2xl">{ICON[u.id] ?? '⭐'}</span>
            <div className="min-w-0 flex-1">
              <div className="font-bold">{u.name}</div>
              <div className="text-xs text-slate-500">{upgradeEffectText(u.effect)}</div>
            </div>
            {owned ? <span className="shrink-0 font-bold text-emerald-700">✓ Đã mua</span> : (
              <button disabled={locked} onClick={() => dispatch('buyUpgrade', u.id)}
                className="shrink-0 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:bg-slate-200 disabled:text-slate-500">
                {usd(u.cost)}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
