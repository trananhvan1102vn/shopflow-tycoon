# M2b-prep — Pacing, Skip Day, Header B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make stages 2 and 3 take 15–30 and 25–45 real minutes (data-only goal changes tuned by the harness), add a "Qua ngày" (skip to next midnight) action on the Thêm page, and rebuild the HUD as the approved "B on green" layout.

**Architecture:** No new sim mechanics. Pacing is `stages.json` goals + harness windows + docs. Skip day reuses the existing pure `fastForward` through a new worker message. The header is a rewrite of `Hud.tsx` (tiles on emerald) with the goal detail moved into the existing quest sheet; pure helpers stay in `goals.ts` with tests.

**Tech Stack:** TypeScript, vitest, Vite, React 18, Zustand 5, Tailwind CSS v3, Web Worker.

**Spec:** Approved design in chat (2026-09-18) — summarized in each task's Requirements block. Game rules of record: `docs/Kich-Ban-Game-Shopflow-Tycoon-Full.md`; M2a spec for background: `docs/superpowers/specs/2026-09-17-m2a-stage3-and-core-ux-design.md`.

## Global Constraints

- Money integer cents; durations game minutes; 1 real second = 4 game minutes (1 tick).
- Sim never calls `Date.now()`/`Math.random()`/`performance.now()`; randomness only via the injected `Rng`.
- Every balance number comes from `@shopflow/data` JSON; UI never hard-codes a number that exists in data.
- UI copy is Vietnamese. Primary green = Tailwind `emerald-700` (`#047857`), already used for buttons and the stage-complete screen.
- `pnpm test` and `pnpm typecheck` pass before every commit. The stage-1 harness assertions (900–1500 ticks, commission 5–12%, profit from day 2) never change.
- Commits on branch `m2b-prep` (created in Task 1). Every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Implementers do not start dev servers or browsers; the controller verifies in the browser after each task.
- Windows; run from the repo root; Git Bash works.

## Existing code you will touch (read first)

`packages/data/stages.json`, `packages/sim/test/harness.test.ts` (bots `botAct`/`botAct2`, `runStage`, constants `S2`/`S3`), `packages/sim/src/fastForward.ts` (`fastForward(s, ticks, rng)`, `MAX_OFFLINE_TICKS`), `apps/web/src/worker/simWorker.ts` (messages `init/start/setPaused/setSpeed/resume/action`), `apps/web/src/store.ts` (Zustand store; `dispatch`, `pause.ts` helpers), `apps/web/src/screens/More.tsx` + `screens/more/*.tsx`, `apps/web/src/components/{Hud,GoalStrip,QuestSheet,Toast,EventToasts}.tsx`, `apps/web/src/goals.ts` + `goals.test.ts`, `apps/web/src/format.ts` (`usd`, `usdCents`, `gameTime`, `dateStr`).

---

### Task 1: Pacing — stage goals tuned by the harness

**Files:**
- Modify: `packages/data/stages.json`, `packages/sim/test/harness.test.ts`, `docs/Kich-Ban-Game-Shopflow-Tycoon-Full.md` (B9 table + "Thưởng qua màn" line), `docs/superpowers/specs/2026-09-17-m2a-stage3-and-core-ux-design.md` (§1.9 note), `README-SETUP.md` (harness bullet)

**Requirements:**
- Only `goal.money`, `goal.orders`, and `reward` change for stages 2–5. `goal.rating`, stage 1, SLA, queue caps, unlocks, quests stay as they are. `reward` = 20% of the stage's money goal, rounded to a whole dollar (100 cents).
- Harness windows: `S2 = { min: 900, max: 1800 }` (15–30 real min after stage 1), `S3 = { min: 1500, max: 2700 }` (25–45 min after stage 2). Seed and bots unchanged unless the bot is *unable* to reach a goal (see Step 3).
- Stages 4 and 5 are scaled by the same factor as stage 3 (the bot cannot play them yet) and rounded to round numbers ($ thousands / tens of orders).

- [ ] **Step 1: Branch**

```bash
git checkout -b m2b-prep
```

- [ ] **Step 2: Set the new windows (failing test first)**

In `packages/sim/test/harness.test.ts` change the constants and their comments:

```ts
  const S2 = { min: 900, max: 1800 };  // 15–30 phút thực sau màn 1 (quyết định 2026-09-18)
  const S3 = { min: 1500, max: 2700 }; // 25–45 phút thực sau màn 2
```

Run: `pnpm --filter @shopflow/sim exec vitest run test/harness.test.ts` → the stage-2/3 test FAILS on the `toBeGreaterThanOrEqual(S2.min)` assertion (current goals complete in ~323 ticks).

- [ ] **Step 3: Tune the goals**

Procedure (repeat until both windows hold; keep the seed `20260917`):
1. Start by multiplying stage 2 `goal.money` and `goal.orders` by 4 (→ `2400000` / `600`) and stage 3 by 5 (→ `10000000` / `2000`). Set `reward` = 20% of money.
2. Run the harness. Read the failure message's `money/orders/rating` and tick count for the stage that missed.
3. If the stage finished too early, raise that stage's money and orders proportionally (keep money:orders ratio roughly 4000 cents per order at stage 2 and 5000 at stage 3 — i.e. close to today's ratios); if too late (or the bot stalls — `stageComplete` never flips within `max`), lower them. Bisect in steps of ~20%.
4. If the bot stalls for a reason other than the goal (e.g. runs out of stock or money), fix the bot's strategy minimally in `botAct2` and note it in the report; never touch stage-1 `botAct`.
5. When both windows hold, round the goals to clean numbers (money to the nearest $500, orders to the nearest 25) and re-run to confirm they still hold.
6. Stages 4–5: multiply their current money and orders by the same factor stage 3 ended up with; round money to the nearest $1,000 and orders to the nearest 100; reward 20% of money.

Time-box: if after ~10 harness runs a window still cannot be satisfied with a sensible bot, report BLOCKED with the last three (goal, ticks) pairs.

- [ ] **Step 4: Docs**

- `docs/Kich-Ban-Game-Shopflow-Tycoon-Full.md` §B9: rewrite the `Tiền` and `Đơn` cells of rows 2–5 with the new values (USD, e.g. `$24,000`), and the line `Thưởng qua màn: $400 / … / …` with the new rewards. Add one sentence under the table: "Mục tiêu màn 2–5 được hiệu chỉnh ngày 2026-09-18 theo harness: màn 2 ≈ 15–30 phút thực, màn 3 ≈ 25–45 phút."
- M2a spec §1.9: replace the 2026-09-17 window note with the new windows and the final goals.
- `README-SETUP.md` harness bullet: "màn 2 ≈ 15–30 phút, màn 3 ≈ 25–45 phút".

- [ ] **Step 5: Gate and commit**

`pnpm test` (data validate passes — no validate rule depends on goal values; if one does, fix the data, not the rule) and `pnpm typecheck`.

```bash
git add -A
git commit -m "balance(data): stage 2–5 goals retuned for 15–30 / 25–45 min stages

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: Skip day ("Qua ngày") on the Thêm page

**Files:**
- Create: `apps/web/src/skipDay.ts`, `apps/web/src/skipDay.test.ts`, `apps/web/src/screens/more/SkipDay.tsx`
- Modify: `apps/web/src/worker/simWorker.ts`, `apps/web/src/store.ts`, `apps/web/src/screens/More.tsx`

**Interfaces:**
- `skipDayInfo(game: Pick<GameState, 'clock' | 'orders'>): { minutesLeft: number; ticks: number; atRisk: number }` — `minutesLeft = 1440 − clock.minute` (game minutes until 00:00), `ticks = Math.ceil(minutesLeft / 4)`, `atRisk` = orders whose `slaLeft <= minutesLeft`.
- Worker message `{ type: 'skipDay' }`: `state = fastForward(state, skipDayInfo(state).ticks, rng).state; post();` — no `offline` summary. The day report modal opens on its own because `reports.length` grows; `fastForward`'s early stop on stage completion is fine.
- Store: `skipDay: () => void` posts the message.

- [ ] **Step 1: Failing test**

```ts
// apps/web/src/skipDay.test.ts
import { describe, it, expect } from 'vitest';
import { skipDayInfo } from './skipDay';

const g = (minute: number, slas: number[] = []) => ({
  clock: { minute, day: 6, month: 1, year: 1 },
  orders: slas.map((slaLeft, i) => ({ id: `o${i}`, productId: 'p', industryId: 'e', channelId: 'flea', value: 1, slaLeft, state: 'queued' as const })),
});

describe('skipDayInfo', () => {
  it('ticks to midnight, rounded up', () => {
    expect(skipDayInfo(g(8 * 60))).toMatchObject({ minutesLeft: 960, ticks: 240 });
    expect(skipDayInfo(g(1439))).toMatchObject({ minutesLeft: 1, ticks: 1 });
    expect(skipDayInfo(g(0))).toMatchObject({ minutesLeft: 1440, ticks: 360 });
  });
  it('counts orders that expire before midnight', () => {
    expect(skipDayInfo(g(20 * 60, [100, 240, 241, 1000])).atRisk).toBe(2);
  });
});
```

Run: `pnpm --filter @shopflow/web exec vitest run src/skipDay.test.ts` → FAIL.

- [ ] **Step 2: `skipDay.ts`**

```ts
// apps/web/src/skipDay.ts — thuần; dùng chung cho worker và màn Thêm ▸ Qua ngày.
import type { GameState } from '@shopflow/sim';

const DAY = 24 * 60;      // phút game / ngày (khớp tick.ts)
const TICK = 4;           // phút game / tick (spec A3)

export function skipDayInfo(game: Pick<GameState, 'clock' | 'orders'>) {
  const minutesLeft = DAY - game.clock.minute;
  return {
    minutesLeft,
    ticks: Math.ceil(minutesLeft / TICK),
    atRisk: game.orders.filter((o) => o.slaLeft <= minutesLeft).length,
  };
}
```

- [ ] **Step 3: Worker + store**

`simWorker.ts`: import `skipDayInfo`; add

```ts
  if (msg.type === 'skipDay' && state && rng) {
    state = fastForward(state, skipDayInfo(state).ticks, rng).state;
    post();
  }
```

`store.ts`: add `skipDay: () => void` to the interface and `skipDay: () => w.postMessage({ type: 'skipDay' })` to the returned object.

- [ ] **Step 4: Thêm entry + screen**

`More.tsx`: add `{ id: 'quangay', icon: '⏭', title: 'Qua ngày', hint: 'Tua tới 00:00 · đơn, SLA và chi phí vẫn tính' }` as the FIRST item and route it to `SkipDay`.

```tsx
// apps/web/src/screens/more/SkipDay.tsx
import { useState } from 'react';
import { useGame } from '../../store';
import { gameTime } from '../../format';
import { skipDayInfo } from '../../skipDay';

export default function SkipDay() {
  const game = useGame((s) => s.game);
  const skipDay = useGame((s) => s.skipDay);
  const [done, setDone] = useState(false);
  if (!game) return null;
  const info = skipDayInfo(game);
  const h = Math.floor(info.minutesLeft / 60), m = info.minutesLeft % 60;
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">Qua ngày</h1>
      <div className="rounded-xl bg-white p-4 shadow">
        <p className="text-sm text-slate-700">Bây giờ là <b>{gameTime(game.clock.minute)}</b> · còn <b>{h} giờ {String(m).padStart(2, '0')} phút</b> tới 00:00.</p>
        <p className="mt-1 text-xs text-slate-500">Mô phỏng chạy thật tới nửa đêm: khách vẫn đặt, đơn quá hạn vẫn hủy, phí ngày vẫn trừ. Sau đó hiện Báo cáo cuối ngày.</p>
        {info.atRisk > 0 && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-800">⚠️ {info.atRisk} đơn đang chờ có thể quá hạn trước 00:00.</p>
        )}
        <button onClick={() => { skipDay(); setDone(true); }} disabled={done}
          className="mt-3 w-full rounded-xl bg-emerald-700 p-3 font-bold text-white disabled:bg-slate-300">
          {done ? 'Đang tua…' : '⏭ Qua ngày'}
        </button>
      </div>
    </div>
  );
}
```

`done` resets naturally because the day-report modal opens and the user navigates; if `game.clock.day` changes, allow another skip: `useEffect(() => setDone(false), [game?.clock.day])` (add the import).

- [ ] **Step 5: Gate and commit**

`pnpm test`, `pnpm typecheck`. Commit `feat(web): Qua ngày — skip to next midnight from Thêm`.

### Task 3: Header B on green

**Files:**
- Modify: `apps/web/src/components/Hud.tsx`, `apps/web/src/components/QuestSheet.tsx`, `apps/web/src/goals.ts`, `apps/web/src/goals.test.ts`, `apps/web/src/components/Toast.tsx`, `apps/web/src/components/EventToasts.tsx`
- Delete: `apps/web/src/components/GoalStrip.tsx`

**Requirements (approved mockup B):**
- Header background `bg-emerald-700`, text white; secondary labels `text-white/75`; shadow.
- Row 1: money (`text-xl font-extrabold text-white`), clock (`gameTime` bold white) over date (`text-white/75`), control cluster ⏸ · 1x · 2x (cluster `bg-white/15`; active = `bg-white text-emerald-700`; inactive `text-white/80`; locked `text-white/45`). No skip-day control here.
- Row 2: four equal tiles (`grid grid-cols-4 gap-1.5`, `bg-white/15 rounded-xl py-1.5 text-center`): big value (`text-sm font-bold text-white`) over a label (`text-[10px] text-white/75`): `⭐ 4.0` / Uy tín · `{stock}/{cap}` / Kệ · `{unchecked}` / Chờ kiểm · `{orders.length}` / Đơn chờ.
- Row 3: a 4px bar (`bg-white/20`, fill `bg-amber-300`) whose width is `overallGoalPct`, then a line with `Màn {stage} · mục tiêu {pct}%` (left, `text-[11px] text-white/85`) and the quest chip (`bg-amber-400 text-emerald-950 font-extrabold`) on the right showing `🎯 done/total` when the stage has quests. The whole row is a button (`aria-label="Mục tiêu màn"`) that opens `QuestSheet`. At stage 6 (no goal) row 3 is omitted.
- `QuestSheet` gains a "Mục tiêu" section above the quests: three rows (💵 money, 📦 orders, ⭐ rating) with `cur / target` and a small progress bar each, using `goalProgress`. Title becomes `Màn {stage}`.
- `goals.ts`: `overallGoalPct(game): number | null` = `Math.min` of the three pcts (null when no goal). Test: `{money 50%, orders 8%, rating 100%}` → 8; stage 6 → null.
- Toast offsets: `Toast.tsx` `top-16` → `top-32`; `EventToasts.tsx` `top-28` → `top-32` (header is ~124px tall now).
- Remove `GoalStrip.tsx` and its import.

- [ ] **Step 1: Failing test** — append to `goals.test.ts`:

```ts
import { overallGoalPct } from './goals';
describe('overallGoalPct', () => {
  it('is the weakest goal', () => { expect(overallGoalPct(g({ money: 80000, completedOrders: 4, rating: 4.2 }))).toBe(8); });
  it('null without a goal', () => { expect(overallGoalPct(g({ stage: 6 }))).toBeNull(); });
});
```

(`g()` is the existing fixture in that file.) Run → FAIL.

- [ ] **Step 2: `goals.ts`**

```ts
export function overallGoalPct(game: Parameters<typeof goalProgress>[0]): number | null {
  const p = goalProgress(game);
  return p ? Math.min(p.money.pct, p.orders.pct, p.rating.pct) : null;
}
```

- [ ] **Step 3: `Hud.tsx` rewrite**

```tsx
import { useState } from 'react';
import { shelfCapacity } from '@shopflow/sim';
import { useGame } from '../store';
import { usd, gameTime, dateStr } from '../format';
import { overallGoalPct, questProgress } from '../goals';
import QuestSheet from './QuestSheet';

export default function Hud() {
  const game = useGame((s) => s.game);
  const paused = useGame((s) => s.paused);
  const setPaused = useGame((s) => s.setPaused);
  const speed = useGame((s) => s.speed);
  const setSpeed = useGame((s) => s.setSpeed);
  const [sheet, setSheet] = useState(false);
  if (!game) return null;

  const stock = Object.values(game.inventory).reduce((a: number, b: number) => a + b, 0);
  const cap = shelfCapacity(game);
  const speedUnlocked = game.stage >= 3; // stages.json: 'speed-2x' trong unlocks màn 3
  const pct = overallGoalPct(game);
  const q = questProgress(game);

  return (
    <header className="sticky top-0 z-40 bg-emerald-700 text-white shadow-md">
      <div className="mx-auto max-w-md px-4 pb-2.5 pt-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xl font-extrabold tracking-tight">{usd(game.money)}</span>
          <div className="text-right text-[11px] leading-tight text-white/75">
            <div className="text-sm font-bold text-white">{gameTime(game.clock.minute)}</div>
            <div>{dateStr(game.clock)}</div>
          </div>
          <div className="flex gap-0.5 rounded-lg bg-white/15 p-0.5 text-sm">
            <SpeedBtn active={paused} onClick={() => setPaused(true)} label="⏸" aria="Tạm dừng" />
            <SpeedBtn active={!paused && speed === 1} onClick={() => { setSpeed(1); setPaused(false); }} label="1x" aria="Chạy 1x" />
            <SpeedBtn active={!paused && speed === 2} disabled={!speedUnlocked} onClick={() => { setSpeed(2); setPaused(false); }}
              label={speedUnlocked ? '2x' : '🔒2x'} aria={speedUnlocked ? 'Chạy 2x' : 'Tua nhanh mở ở màn 3'} />
          </div>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <Tile value={`⭐ ${game.rating.toFixed(1)}`} label="Uy tín" title="Điểm uy tín" />
          <Tile value={`${stock}/${cap}`} label="Kệ" title="Hàng trên kệ / sức chứa" />
          <Tile value={String(game.unchecked)} label="Chờ kiểm" title="Hàng chờ kiểm" />
          <Tile value={String(game.orders.length)} label="Đơn chờ" title="Đơn đang chờ" />
        </div>

        {pct !== null && (
          <button onClick={() => setSheet(true)} aria-label="Mục tiêu màn" className="mt-2 block w-full text-left">
            <div className="h-1 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-amber-300" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-white/85">
              <span><span className="rounded-full bg-white/15 px-2 py-0.5 font-extrabold text-white">Màn {game.stage}</span> · mục tiêu {pct}%</span>
              {q.total > 0 && <span className="rounded-full bg-amber-400 px-2 py-0.5 font-extrabold text-emerald-950">🎯 {q.done}/{q.total}</span>}
            </div>
          </button>
        )}
      </div>
      {sheet && <QuestSheet onClose={() => setSheet(false)} />}
    </header>
  );
}

function Tile({ value, label, title }: { value: string; label: string; title: string }) {
  return (
    <div title={title} className="rounded-xl bg-white/15 py-1.5 text-center">
      <div className="text-sm font-bold leading-tight text-white">{value}</div>
      <div className="text-[10px] text-white/75">{label}</div>
    </div>
  );
}

function SpeedBtn({ active, disabled, onClick, label, aria }: { active: boolean; disabled?: boolean; onClick: () => void; label: string; aria: string }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={aria} aria-pressed={active}
      className={`rounded-md px-2 py-1 font-bold ${active ? 'bg-white text-emerald-700 shadow' : 'text-white/80'} disabled:text-white/45`}>
      {label}
    </button>
  );
}
```

- [ ] **Step 4: `QuestSheet.tsx` goals section**

Above the quest list, using `goalProgress(game)`:

```tsx
        {p && (
          <div className="mt-3 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Mục tiêu</h3>
            {[
              { icon: '💵', text: `${usd(p.money.cur)} / ${usd(p.money.target)}`, pct: p.money.pct },
              { icon: '📦', text: `${p.orders.cur} / ${p.orders.target}`, pct: p.orders.pct },
              { icon: '⭐', text: `${p.rating.cur.toFixed(1)} / ${p.rating.target}`, pct: p.rating.pct },
            ].map((g) => (
              <div key={g.icon}>
                <div className="flex justify-between text-sm"><span>{g.icon}</span><span className="font-bold">{g.text}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-200"><div className={`h-1.5 rounded-full ${g.pct >= 100 ? 'bg-emerald-600' : 'bg-emerald-400'}`} style={{ width: `${g.pct}%` }} /></div>
              </div>
            ))}
          </div>
        )}
```

with `const p = goalProgress(game);` (import from `../goals`), title `Màn {game.stage}`, and the quests block headed `Nhiệm vụ · done/total` (render it only when `q.total > 0`).

- [ ] **Step 5: Toast offsets, delete GoalStrip, gate, commit**

`Toast.tsx` → `top-32`; `EventToasts.tsx` → `top-32`. `git rm apps/web/src/components/GoalStrip.tsx`. `pnpm test`, `pnpm typecheck`. Commit `feat(web): header B on emerald — status tiles, goal bar, goals in the stage sheet`.

### Task 4: Playthrough, merge, deploy (controller)

- [ ] Full gate: `pnpm test`, `pnpm typecheck`, `MSYS_NO_PATHCONV=1 BASE_PATH=/shopflow-tycoon/ pnpm --filter @shopflow/web build`.
- [ ] Browser: fresh game → header B renders (tiles, amber bar, quest chip at stage 2); stage sheet shows goals + quests; Thêm ▸ Qua ngày shows time left and at-risk count, skipping lands at 00:00 with the day report; toasts sit below the header.
- [ ] Merge `m2b-prep` into `master` (`--no-ff`), re-run tests, delete branch, push after the user's go-ahead; watch the Pages run; verify live.

## Self-review

- Coverage: pacing (T1), skip day (T2), header B (T3), integration (T4). Skip-day control is on Thêm (T2), not in the header (T3 explicitly omits it).
- Placeholders: none. Types: `skipDayInfo` consumed by worker and screen with the same signature; `overallGoalPct` consumed by `Hud`; `goalProgress` reused by `QuestSheet`.
- Constraints: no new sim mechanics; harness stage-1 untouched; numbers from data; Vietnamese copy.
