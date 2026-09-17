# M2a — Màn 3 + Core UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make stage 3 playable (suppliers/grades/relationships, overseas risk, returns, upgrades, market cycle, SEO decay, SocialShop) and close the four core UX gaps (tutorial, goal strip, Thêm menu with Chơi mới, pause-on-hide with offline catch-up), plus 2x speed.

**Architecture:** The sim (`packages/sim`) stays pure and deterministic. A new `modifiers.ts` computes every upgrade/market multiplier in one place and the existing formulas consume it. `settleDay` and `fulfilOrders` gain an `rng` parameter so supplier risk, market cycle, and returns roll inside `tick`. New pure modules: `suppliers.ts`, `modifiers.ts`, `quests.ts`, `tutorial.ts`, `fastForward.ts`. The web app (`apps/web`) keeps its worker/Zustand shape; the worker learns `setSpeed` and offline `resume`, the store learns visibility pause, and new screens (Thêm, tutorial card, welcome-back modal, goal strip) only render state and dispatch actions.

**Tech Stack:** TypeScript, vitest, Vite 5, React 18, Zustand 5, Tailwind CSS v3, Web Worker, localStorage, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-09-17-m2a-stage3-and-core-ux-design.md` (scope + decisions) + `docs/Kich-Ban-Game-Shopflow-Tycoon-Full.md` (game rules — wins on rule conflicts).

## Global Constraints

- Money is **integer cents** ($1 = 100). Durations in **game minutes**. 1 real second = 4 game minutes (2x = two 4-minute ticks per second).
- Sim code never calls `Date.now()`, `Math.random()`, `new Date()`, `performance.now()` — randomness only through the injected `Rng` (`{ next(): number }` in `[0, 1)`).
- Every balance number comes from `@shopflow/data` JSON. Never hard-code a number that exists in data.
- All sim state stays plain JSON (worker `postMessage` + localStorage).
- Actions that fail return the state unchanged except `lastReject: string` (Vietnamese message); on success `lastReject` is `null`.
- UI copy is Vietnamese. Existing screen terminology is the reference.
- `pnpm test` (repo root) must pass after every task. Run `pnpm typecheck` before each commit in Phase 2.
- `SAVE_VERSION` becomes `2` in Task 11. Old saves are discarded (approved in spec).
- Commit after every task on branch `m2a` (created in Task 1). Commit messages end with the attribution line already used in this repo: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Windows: forward slashes in imports; commands run in Git Bash or PowerShell from the repo root unless a step says otherwise.
- Existing tests stay green. When a task changes a signature, that task updates every call site listed in it.

## Data cheat-sheet (already in `@shopflow/data`, do not re-declare)

- `stages.stages[n-1]` → `{ n, goal, reward, sla, queueCap, unlocks }`. Stage 3: `sla: 1080`, `queueCap: 40`, `goal: { money: 2000000, orders: 400, rating: 4.2 }`, `reward: 400000`. `stages.tutorialReward = 20000`. `stages.rating = { start: 4, perDelivered: 0.02, perCancelled: -0.1, perCancelledWithCS: -0.05, min: 1, max: 5 }`. `stages.warehouse.robot.levels[i].speed`, `.adjacentShelfBonus = 0.25`.
- `suppliers.tiers[]` → `{ id: 'local'|'regional'|'overseas', costMult, extraDays, grades: string[], gradesStage1?: string[], risk: null | { delayChance, delayDays } | { customsChance, customsDays, lossChance, lossPct }, unlockStage }`. `suppliers.grades = { A: { costMult: 1.1, returnRate: 0.01 }, B: { 1.0, 0.04 }, C: { 0.85, 0.10 } }`. `suppliers.relationship = { xpPerCents: 10000, levels: [{xp:0},{xp:10,discount:.03},{xp:30,discount:.06,exclusiveBundle:true},{xp:80,discount:.10,daysDelta:-1},{xp:200,discount:.15,crisisImmune:true}], decayAfterIdleDays: 30 }`. `suppliers.carriers[]` → `{ id, name, fee, daysDelta }`. `suppliers.retail = { priceMult: 1.2, moqLocal: 5, moqImport: 20, maxPerOrder: 100 }`.
- `upgrades.upgrades[]` → `{ id: 'routing'|'seo_pro'|'robot_fast'|'cs'|'wholesale'|'negotiator', name, cost, effect: {...} }`. `upgrades.seoCampaigns[]` (level 3 has `unlockStage: 3`), `upgrades.seoStart = 40`.
- `calendar.marketCycle = { fromStage: 3, periodDays: 5, states: [{ id, p, traffic, retail, wholesale, shipping }] }`. `calendar.hourly = { peakHours[], nightHours[], nightMult: 0.5 }`.
- `channels.channels[]` → `{ id, name, openCost, upgradeCostBase?, dailyFee, commission, trafficK, unlockStage, peakHourMult, minRating? }`. `social` has `peakHourMult: 3`, `unlockStage: 3`.
- `costs = { warehouseRentPerCellPerDay: 200, maintenancePerEquipmentLevelPerDay: 100, seoDecayPerDay: 1, seoDecayFromStage: 3, seoFloor: 40, ... }`.
- `industries.industries[]` → `{ id, name, V, unlock, traits: { returnRateBonus?, bundleShipMult? , ... }, products: [{ id, name, retail, wholesale, unlockStage? }], bundles: [{ id, name, cost, days, items, unlockStage }] }`. `home.traits.bundleShipMult = 1.5` already exists.

## Existing code you will touch (read these first)

`packages/sim/src/{types,create,actions,formulas,env,orders,logistics,fulfil,settleDay,tick,index}.ts`, `packages/sim/test/{purchase,logistics,fulfil,env,harness,channels,settle-stage}.test.ts`, `packages/data/{stages.json,industries.json,validate.mjs}`, `apps/web/src/{store,save,App,format,report}.ts(x)`, `apps/web/src/worker/simWorker.ts`, `apps/web/src/components/{Hud,TabBar,Toast}.tsx`, `apps/web/src/screens/{Restock,RestockRetail,RestockBundles,RestockInbound,SalesChannels,SalesOrders,Promo,DayReportModal,StageComplete,IndustrySelect}.tsx`.

---

# Phase 1 — Sim (`packages/sim`)

### Task 1: Branch, data additions, state shape v2

**Files:**
- Modify: `packages/data/stages.json`, `packages/data/industries.json`, `packages/data/validate.mjs`
- Modify: `packages/sim/src/types.ts`, `packages/sim/src/create.ts`
- Create: `packages/sim/src/suppliers.ts`
- Test: `packages/sim/test/create.test.ts` (new), `packages/data` validate run

**Interfaces:**
- Produces: `GameState` fields `inventoryGrades`, `marketCycleDaysLeft`, `cancelledOrders`, `returnedOrders`, `profitStreakDays`, `recessionClean`, `survivedRecession`, `retailLotsBought`, `bundleLotsBought`, `tutorial`, `questsDone`, `dayRefunds`, `dayQuestBonus`; `Delivery.riskResolved`, `Delivery.risk?`, `Delivery.bundleId?` (already declared, now always set for bundles in Task 3); `DayReport.refunds`, `DayReport.questBonus`. `type Grade = 'A'|'B'|'C'`. `absDay(clock)`.
- Note: `survivedRecession`, `retailLotsBought`, `bundleLotsBought` are small additions beyond spec 1.1 (needed by quest/tutorial predicates); record them in the spec's 1.1 list in this task.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b m2a
```

- [ ] **Step 2: Add quests to `stages.json` and the sports ship multiplier**

In `packages/data/stages.json`, after the `"combo"` entry add:

```json
  "quests": {
    "2": [
      { "id": "open_mall",     "bonus": 5000 },
      { "id": "buy_seasonal",  "bonus": 5000 },
      { "id": "place_robot",   "bonus": 5000 },
      { "id": "run_seo",       "bonus": 5000 }
    ],
    "3": [
      { "id": "relationship_3",    "bonus": 20000 },
      { "id": "survive_recession", "bonus": 20000 },
      { "id": "profit_5_days",     "bonus": 20000 }
    ]
  },
```

In `packages/data/industries.json`, in the `sports` industry's `traits` object add `"bundleShipMult": 1.5` (home already has it).

- [ ] **Step 3: Extend `validate.mjs`**

Append before the final `console.log`:

```js
// Quests: id duy nhất toàn cục, bonus > 0, stage key hợp lệ.
const qids = new Set();
for (const [st, list] of Object.entries(d.stages.quests ?? {})) {
  if (!(Number(st) >= 2 && Number(st) <= 6)) die('quests: stage key không hợp lệ ' + st);
  for (const q of list) {
    if (qids.has(q.id)) die('trùng quest id ' + q.id); qids.add(q.id);
    if (!(q.bonus > 0)) die(`quest ${q.id} cần bonus > 0`);
  }
}
if (!(d.stages.tutorialReward > 0)) die('tutorialReward phải > 0');
```

Run: `pnpm --filter @shopflow/data test` → expect `data ok: …`.

- [ ] **Step 4: Write the failing test for the new state fields**

```ts
// packages/sim/test/create.test.ts
import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { absDay } from '../src/suppliers.js';

describe('createGame v2 fields', () => {
  it('initialises M2a state', () => {
    const s = createGame(42, 'electronics');
    expect(s.inventoryGrades).toEqual({});
    expect(s.marketCycle).toBe('stable');
    expect(s.marketCycleDaysLeft).toBe(0);
    expect(s.cancelledOrders).toBe(0);
    expect(s.returnedOrders).toBe(0);
    expect(s.profitStreakDays).toBe(0);
    expect(s.recessionClean).toBe(true);
    expect(s.survivedRecession).toBe(false);
    expect(s.retailLotsBought).toBe(0);
    expect(s.bundleLotsBought).toBe(0);
    expect(s.tutorial).toEqual({ step: 0, done: false, rewarded: false });
    expect(s.questsDone).toEqual([]);
    expect(s.dayRefunds).toBe(0);
    expect(s.dayQuestBonus).toBe(0);
  });
  it('absDay: 12 tháng × 30 ngày', () => {
    expect(absDay({ day: 6, month: 1, year: 1 })).toBe(6);
    expect(absDay({ day: 1, month: 2, year: 1 })).toBe(31);
    expect(absDay({ day: 1, month: 1, year: 2 })).toBe(361);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `pnpm --filter @shopflow/sim exec vitest run test/create.test.ts`
Expected: FAIL (`absDay` module missing / fields undefined).

- [ ] **Step 6: Extend `types.ts`**

Replace the `Delivery`, `DayReport`, and `GameState` interfaces with:

```ts
export type Grade = 'A' | 'B' | 'C';

export interface Delivery {
  id: string; bundleId?: string; items: Record<string, number>; grade: Grade;
  supplierId: string; carrierId: string; cost: Cents;
  state: 'shipping' | 'auditing'; daysLeft: number; itemsTotal: number; itemsChecked: number;
  riskResolved: boolean; risk?: 'delay' | 'customs' | 'loss';
}

export interface DayReport {
  day: number; month: number;
  revenueByChannel: Record<string, Cents>; ordersByChannel: Record<string, number>;
  commission: Cents; channelFees: Cents; rent: Cents; maintenance: Cents;
  purchases: Cents; other: Cents; refunds: Cents; questBonus: Cents; net: Cents;
}

export interface TutorialState { step: number; done: boolean; rewarded: boolean }

export interface GameState {
  seed: number; clock: { minute: number; day: number; month: number; year: number };
  money: Cents; rating: number; stage: number; combo: number; bestCombo: number;
  industries: string[]; seo: Record<string, number>;
  grid: { size: number; cells: ({ type: 'shelf' | 'packer' | 'robot'; level: 1 | 2 | 3 } | { type: 'pile' } | null)[] };
  inventory: Record<string, number>; unchecked: number;
  inventoryGrades: Record<string, { A: number; B: number; C: number }>;
  orders: Order[]; deliveries: Delivery[]; channels: ChannelState[];
  relationships: Record<string, { xp: number; lastPurchaseDay: number }>;
  upgrades: string[]; marketCycle: string; marketCycleDaysLeft: number; activeEvents: string[];
  reports: DayReport[]; completedOrders: number; cancelledOrders: number; returnedOrders: number;
  orderGenAccum: GameMinutes; packAccum: number;
  orderSeq: number; deliverySeq: number;
  dayRevenue: Record<string, Cents>; dayOrders: Record<string, number>;
  dayCommission: Cents; dayPurchases: Cents; dayRefunds: Cents; dayQuestBonus: Cents;
  onTimeStreak: number; stageComplete: boolean;
  seasonalBought: Record<string, number>;
  profitStreakDays: number; recessionClean: boolean; survivedRecession: boolean;
  retailLotsBought: number; bundleLotsBought: number;
  tutorial: TutorialState; questsDone: string[];
  lastReject: string | null;
}
```

- [ ] **Step 7: Create `suppliers.ts` with `absDay` (more helpers arrive in Task 3)**

```ts
// packages/sim/src/suppliers.ts
// Nhà cung cấp, hạng hàng, quan hệ (spec B2). Thuần, không RNG.
import type { GameState } from './types.js';

/** Ngày tuyệt đối: 12 tháng × 30 ngày (khớp tick.ts). */
export const absDay = (c: { day: number; month: number; year: number }): number =>
  (c.year - 1) * 360 + (c.month - 1) * 30 + c.day;
```

- [ ] **Step 8: Update `create.ts`**

Replace the returned object so it includes the new fields:

```ts
export function createGame(seed: number, startIndustry: string): GameState {
  const size = 3;
  const cells = Array(size * size).fill(null);
  cells[4] = { type: 'packer', level: 1 }; // bàn đóng gói có sẵn ở giữa
  return {
    seed, clock: { minute: 8 * 60, day: 6, month: 1, year: 1 },
    money: ST.startingMoney, rating: ST.rating.start, stage: 1, combo: 0, bestCombo: 0,
    industries: [startIndustry], seo: { [startIndustry]: UP.seoStart }, grid: { size, cells },
    inventory: {}, unchecked: 0, inventoryGrades: {}, orders: [], deliveries: [],
    channels: [{ id: 'flea', open: true, suspended: false, ratingLocked: false, level: 1, ordersDelivered: 0 }],
    relationships: {}, upgrades: [], marketCycle: 'stable', marketCycleDaysLeft: 0, activeEvents: [],
    reports: [], completedOrders: 0, cancelledOrders: 0, returnedOrders: 0,
    orderGenAccum: 0, packAccum: 0, orderSeq: 0, deliverySeq: 0,
    dayRevenue: {}, dayOrders: {}, dayCommission: 0, dayPurchases: 0, dayRefunds: 0, dayQuestBonus: 0,
    onTimeStreak: 0, stageComplete: false, seasonalBought: {},
    profitStreakDays: 0, recessionClean: true, survivedRecession: false,
    retailLotsBought: 0, bundleLotsBought: 0,
    tutorial: { step: 0, done: false, rewarded: false }, questsDone: [],
    lastReject: null,
  };
}
```

Also in `actions.ts` `makeDelivery`, add `riskResolved: daysLeft === 0` to the `Delivery` literal (full rewrite of that function comes in Task 3; this keeps typecheck green now). In `settleDay.ts` add `refunds: s.dayRefunds, questBonus: s.dayQuestBonus` to the `DayReport` literal and add `dayRefunds: 0, dayQuestBonus: 0` to the reset at the end (full rewrite in Task 6).

- [ ] **Step 9: Export and run all tests**

Add to `packages/sim/src/index.ts`: `export * from './suppliers.js';`

Run: `pnpm test` → all green (existing tests do not assert absence of new fields). Run `pnpm typecheck` → clean.

- [ ] **Step 10: Record the spec addition and commit**

In `docs/superpowers/specs/2026-09-17-m2a-stage3-and-core-ux-design.md` section 1.1, append to the code block: `survivedRecession: boolean; retailLotsBought: number; bundleLotsBought: number; // added in plan Task 1 for quest/tutorial predicates`.

```bash
git add -A
git commit -m "feat(sim): M2a state shape v2, quests data, validate rules

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: Modifier pipeline + `buyUpgrade`

**Files:**
- Create: `packages/sim/src/modifiers.ts`
- Modify: `packages/sim/src/actions.ts` (add `buyUpgrade`), `packages/sim/src/formulas.ts`, `packages/sim/src/orders.ts`, `packages/sim/src/fulfil.ts`, `packages/sim/src/tick.ts`, `packages/sim/src/index.ts`
- Test: `packages/sim/test/upgrades.test.ts` (new)

**Interfaces:**
- Produces: `interface Modifiers { traffic; retail; wholesale; shipping; deliveryDays; robotSpeed; commissionDelta; cancelPenaltyMult; ratingRegenPerHour }`, `modifiers(s: GameState): Modifiers`, `buyUpgrade(s, id: string): GameState`. `orderRate` now multiplies by `modifiers(s).traffic`; order value by `.retail`; `commissionOf` adds `.commissionDelta`; robot capacity × `.robotSpeed`; `expireSla` penalty × `.cancelPenaltyMult` and increments `cancelledOrders`; `tick` regenerates rating.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/sim/test/upgrades.test.ts
import { describe, it, expect } from 'vitest';
import { createGame, tick, makeRng, orderRate } from '../src/index.js';
import { buyUpgrade } from '../src/actions.js';
import { modifiers } from '../src/modifiers.js';
import { commissionOf, packCapacityPerSecond, expireSla } from '../src/fulfil.js';
import { upgrades as UP } from '@shopflow/data';

const rng = makeRng(1);
const atStage3 = () => { const s = createGame(42, 'electronics'); s.stage = 3; s.money = 10_000_000; return s; };

describe('modifiers', () => {
  it('neutral by default', () => {
    const m = modifiers(createGame(42, 'electronics'));
    expect(m).toEqual({ traffic: 1, retail: 1, wholesale: 1, shipping: 1, deliveryDays: 1, robotSpeed: 1,
      commissionDelta: 0, cancelPenaltyMult: 1, ratingRegenPerHour: 0 });
  });
  it('market cycle boom applies four multipliers', () => {
    const s = createGame(42, 'electronics'); s.marketCycle = 'boom';
    const boom = UP && (require('@shopflow/data') as any).calendar.marketCycle.states.find((x: any) => x.id === 'boom');
    const m = modifiers(s);
    expect(m.traffic).toBe(boom.traffic); expect(m.retail).toBe(boom.retail);
    expect(m.wholesale).toBe(boom.wholesale); expect(m.shipping).toBe(boom.shipping);
  });
});

describe('buyUpgrade', () => {
  it('stage-gated, once, charges cost', () => {
    const s1 = createGame(42, 'electronics'); s1.money = 10_000_000;
    expect(buyUpgrade(s1, 'routing').lastReject).toBeTruthy();
    let s = buyUpgrade(atStage3(), 'routing');
    expect(s.lastReject).toBeNull();
    expect(s.upgrades).toEqual(['routing']);
    expect(s.money).toBe(10_000_000 - 16000);
    expect(buyUpgrade(s, 'routing').lastReject).toBeTruthy();
    expect(buyUpgrade(s, 'nope').lastReject).toBeTruthy();
  });
  it('seo_pro ×1.3 traffic through orderRate', () => {
    const s0 = atStage3(); s0.inventory = { phone_case: 5 };
    const base = orderRate(s0, 'electronics', 40, 1);
    const s = buyUpgrade(s0, 'seo_pro');
    expect(orderRate(s, 'electronics', 40, 1)).toBeCloseTo(base * 1.3);
  });
  it('negotiator −2 điểm hoa hồng, floor 0', () => {
    const s = buyUpgrade(atStage3(), 'negotiator');
    expect(commissionOf(s, 'flea')).toBeCloseTo(0.10);
  });
  it('robot_fast ×1.5 robot capacity', () => {
    const s0 = atStage3();
    s0.grid.cells[0] = { type: 'shelf', level: 1 }; s0.grid.cells[1] = { type: 'robot', level: 1 };
    const base = packCapacityPerSecond(s0);
    const s = buyUpgrade(s0, 'robot_fast');
    // bàn 1.0 không đổi; robot 0.5×1.25 (cạnh kệ) ×1.5
    expect(packCapacityPerSecond(s)).toBeCloseTo(base + 0.5 * 1.25 * 0.5);
  });
  it('cs halves cancel penalty and regenerates rating', () => {
    let s = buyUpgrade(atStage3(), 'cs');
    s.rating = 4; s.orders = [{ id: 'o1', productId: 'phone_case', industryId: 'electronics', channelId: 'flea', value: 800, slaLeft: 1, state: 'queued' }];
    s = expireSla(s, 4);
    expect(s.rating).toBeCloseTo(3.95);
    expect(s.cancelledOrders).toBe(1);
    s.orders = []; s.rating = 4;
    s = tick(s, 60, rng); // 1 giờ game → +0.01
    expect(s.rating).toBeCloseTo(4.01, 3);
  });
});
```

Replace the awkward `require` line in the market-cycle test with a top-level import: `import { calendar as CAL } from '@shopflow/data';` and `const boom = CAL.marketCycle.states.find((x: any) => x.id === 'boom');`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @shopflow/sim exec vitest run test/upgrades.test.ts` → FAIL (module not found).

- [ ] **Step 3: Create `modifiers.ts`**

```ts
// packages/sim/src/modifiers.ts
// Một nơi duy nhất gom mọi hệ số từ nâng cấp vĩnh viễn (B8) và chu kỳ thị trường (B7).
// M2b: sự kiện ngẫu nhiên thêm dòng vào đây.
import { upgrades as UP, calendar as CAL } from '@shopflow/data';
import type { GameState } from './types.js';

export interface Modifiers {
  traffic: number; retail: number; wholesale: number; shipping: number;
  deliveryDays: number; robotSpeed: number; commissionDelta: number;
  cancelPenaltyMult: number; ratingRegenPerHour: number;
}

export function modifiers(s: GameState): Modifiers {
  const m: Modifiers = { traffic: 1, retail: 1, wholesale: 1, shipping: 1, deliveryDays: 1, robotSpeed: 1,
    commissionDelta: 0, cancelPenaltyMult: 1, ratingRegenPerHour: 0 };
  const cyc = (CAL.marketCycle.states as any[]).find((x) => x.id === s.marketCycle);
  if (cyc) { m.traffic *= cyc.traffic; m.retail *= cyc.retail; m.wholesale *= cyc.wholesale; m.shipping *= cyc.shipping; }
  for (const id of s.upgrades) {
    const e = (UP.upgrades as any[]).find((u) => u.id === id)?.effect ?? {};
    if (e.deliveryDaysMult) m.deliveryDays *= e.deliveryDaysMult;
    if (e.trafficMult) m.traffic *= e.trafficMult;
    if (e.robotSpeedMult) m.robotSpeed *= e.robotSpeedMult;
    if (e.cancelPenaltyHalf) m.cancelPenaltyMult *= 0.5;
    if (e.ratingRegenPerHour) m.ratingRegenPerHour += e.ratingRegenPerHour;
    if (e.wholesaleMult) m.wholesale *= e.wholesaleMult;
    if (e.commissionDelta) m.commissionDelta += e.commissionDelta;
  }
  return m;
}
```

- [ ] **Step 4: Add `buyUpgrade` to `actions.ts`** (after `buySeo`)

```ts
export function buyUpgrade(s: GameState, id: string): GameState {
  const def = (UP.upgrades as any[]).find((u) => u.id === id);
  if (!def) return reject(s, 'Không có nâng cấp này');
  if (s.stage < 3) return reject(s, 'Nâng cấp mở ở màn 3');
  if (s.upgrades.includes(id)) return reject(s, 'Đã mua nâng cấp này');
  if (s.money < def.cost) return reject(s, 'Không đủ tiền');
  return ok({ ...s, money: s.money - def.cost, dayPurchases: s.dayPurchases + def.cost, upgrades: [...s.upgrades, id] });
}
```

- [ ] **Step 5: Wire consumers**

`formulas.ts` — import `modifiers` and multiply at the end of `orderRate`:

```ts
import { modifiers } from './modifiers.js';
// ...
  return (seoScore / 5) * ind.V * channelSum * ratingMult * envMult * modifiers(s).traffic;
```

`orders.ts` — order value: `value: Math.round(p.retail * retailM * mod.retail)` where `const mod = modifiers(s);` is computed once at the top of `genOrders`.

`fulfil.ts`:

```ts
import { modifiers } from './modifiers.js';
// packCapacityPerSecond: robot line becomes
      cap += ST.warehouse.robot.levels[e.level - 1].speed * (adj ? 1 + ST.warehouse.robot.adjacentShelfBonus : 1) * mod.robotSpeed;
// with `const mod = modifiers(s);` at the top of the function.

// commissionOf: after the level-3 delta
  com += modifiers(s).commissionDelta;
  return Math.max(0, com);

// expireSla: penalty and counter
export function expireSla(s: GameState, dtGameMinutes: number): GameState {
  const penalty = ST.rating.perCancelled * modifiers(s).cancelPenaltyMult;
  let rating = s.rating, streak = s.onTimeStreak, expired = 0;
  const orders = s.orders.flatMap((o) => {
    const slaLeft = o.slaLeft - dtGameMinutes;
    if (slaLeft <= 0) { expired++; rating = Math.max(ST.rating.min, rating + penalty); streak = 0; return []; }
    return [{ ...o, slaLeft }];
  });
  if (!expired) return { ...s, orders };
  return { ...s, orders, rating, onTimeStreak: streak, combo: comboBonus(streak), cancelledOrders: s.cancelledOrders + expired };
}
```

`tick.ts` — after `expireSla`:

```ts
  const regen = modifiers(next).ratingRegenPerHour;
  if (regen > 0) next.rating = Math.min(ST.rating.max, next.rating + regen * (dtGameMinutes / 60));
```

(import `stages as ST` from `@shopflow/data` and `modifiers`.)

`index.ts` — add `export * from './modifiers.js';`

- [ ] **Step 6: Run tests**

Run: `pnpm test` → all green (the new `modifiers` are neutral for existing tests). Fix the `require` line if you left it.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(sim): modifier pipeline + permanent upgrades (buyUpgrade)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: Purchases with supplier + grade, `quote()`, relationship XP

**Files:**
- Modify: `packages/sim/src/suppliers.ts`, `packages/sim/src/actions.ts`, `packages/sim/src/index.ts`
- Modify (call sites): `packages/sim/test/purchase.test.ts`, `packages/sim/test/logistics.test.ts`, `packages/sim/test/harness.test.ts`, `apps/web/src/worker/simWorker.ts`, `apps/web/src/screens/RestockRetail.tsx`, `apps/web/src/screens/RestockBundles.tsx`
- Test: `packages/sim/test/suppliers.test.ts` (new)

**Interfaces:**
- Produces:
  - `interface PurchaseOpts { carrierId: string; supplierId?: string; grade?: Grade; seasonalId?: string }` (defaults `supplierId = 'local'`, `grade = 'B'`).
  - `buyRetail(s, productId, qty, opts: PurchaseOpts)`, `buyBundle(s, industryId, bundleId, opts: PurchaseOpts)`.
  - `quoteRetail(s, productId, qty, opts): { unit: Cents; goods: Cents; ship: Cents; days: number; moq: number }` and `quoteBundle(s, industryId, bundleId, opts): { goods: Cents; ship: Cents; days: number; discountPct: number }` (goods already includes seasonal discount when `seasonalId` given; `ship` includes `bundleShipMult`).
  - `retailUnitPrice(s, productId)` kept (= `quoteRetail(..., { carrierId: 'standard' }).unit`, local/B).
  - `suppliers.ts`: `relationshipLevel(s, supplierId): number` (0-based index into `relationship.levels`), `relationshipDiscount(s, supplierId): number`, `relationshipXp(s, supplierId): { xp: number; level: number; nextXp: number | null }`, `gradeCostMult(s, supplierId, grade): number`, `gradeAllowed(s, supplierId, grade): boolean`, `supplierUnlocked(s, supplierId): boolean`.
  - `makeDelivery` records `bundleId` for bundles; `retailLotsBought` / `bundleLotsBought` increment.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/sim/test/suppliers.test.ts
import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { buyRetail, buyBundle, quoteRetail, quoteBundle, retailUnitPrice } from '../src/actions.js';
import { relationshipLevel, relationshipDiscount, gradeCostMult, gradeAllowed } from '../src/suppliers.js';

const rich = (stage = 3) => { const s = createGame(42, 'electronics'); s.stage = stage; s.money = 10_000_000; s.clock.day = 8; return s; };

describe('supplier & grade gating', () => {
  it('stage 1: local only, grade B only', () => {
    const s = createGame(42, 'electronics');
    expect(gradeAllowed(s, 'local', 'A')).toBe(false);
    expect(gradeAllowed(s, 'local', 'B')).toBe(true);
    expect(buyRetail(s, 'phone_case', 10, { carrierId: 'standard', grade: 'A' }).lastReject).toBeTruthy();
    expect(buyRetail(s, 'phone_case', 20, { carrierId: 'standard', supplierId: 'regional' }).lastReject).toBeTruthy();
  });
  it('stage 2: local A ok, regional MOQ 20, +2 days, −20%', () => {
    const s0 = rich(2);
    expect(buyRetail(s0, 'phone_case', 10, { carrierId: 'standard', supplierId: 'regional' }).lastReject).toBeTruthy(); // MOQ 20
    const q = quoteRetail(s0, 'phone_case', 20, { carrierId: 'standard', supplierId: 'regional', grade: 'C' });
    // 200 × 1.2 × 0.8 × 0.85 = 163.2 → 163
    expect(q.unit).toBe(163); expect(q.days).toBe(2); expect(q.moq).toBe(20);
    const s = buyRetail(s0, 'phone_case', 20, { carrierId: 'standard', supplierId: 'regional', grade: 'C' });
    expect(s.lastReject).toBeNull();
    expect(s.deliveries[0]).toMatchObject({ supplierId: 'regional', grade: 'C', daysLeft: 2, state: 'shipping', riskResolved: false });
    expect(s.retailLotsBought).toBe(1);
  });
  it('overseas locked until stage 3; grade A not offered there', () => {
    expect(buyRetail(rich(2), 'phone_case', 20, { carrierId: 'standard', supplierId: 'overseas' }).lastReject).toBeTruthy();
    expect(gradeAllowed(rich(3), 'overseas', 'A')).toBe(false);
    const s = buyBundle(rich(3), 'electronics', 'starter', { carrierId: 'standard', supplierId: 'overseas', grade: 'C' });
    expect(s.lastReject).toBeNull();
    // 6000 × 0.65 × 0.85 = 3315 ; days 1 + 4 + 0 = 5
    expect(s.deliveries[0].cost).toBe(3315 + 2000);
    expect(s.deliveries[0].daysLeft).toBe(5);
    expect(s.deliveries[0].bundleId).toBe('starter');
    expect(s.bundleLotsBought).toBe(1);
  });
  it('bundleShipMult: home bundles ship ×1.5', () => {
    const s = rich(1); s.industries = ['home'];
    const q = quoteBundle(s, 'home', 'kitchen', { carrierId: 'standard' });
    expect(q.ship).toBe(3000);
  });
});

describe('relationship', () => {
  it('xp = floor(cost / $100); level thresholds; discount applies', () => {
    let s = rich(3);
    // 30 lượt Power Bundle nội địa ≈ $120 mỗi lượt ⇒ ≥ 30 XP ⇒ cấp 2 (index 2, −6%)
    for (let i = 0; i < 30; i++) s = buyBundle(s, 'electronics', 'power', { carrierId: 'standard' });
    expect(s.relationships.local.xp).toBeGreaterThanOrEqual(30);
    expect(relationshipLevel(s, 'local')).toBe(2);
    expect(relationshipDiscount(s, 'local')).toBe(0.06);
    const q = quoteBundle(s, 'electronics', 'starter', { carrierId: 'standard' });
    expect(q.goods).toBe(Math.round(6000 * (1 - 0.06)));
  });
  it('level ≥ 2 (index): grade A at grade-B price', () => {
    const s = rich(3); s.relationships = { local: { xp: 30, lastPurchaseDay: 8 } };
    expect(gradeCostMult(s, 'local', 'A')).toBe(1.0);
    const s2 = rich(3);
    expect(gradeCostMult(s2, 'local', 'A')).toBe(1.1);
  });
  it('level index 3: −1 day delivery', () => {
    const s = rich(3); s.relationships = { regional: { xp: 80, lastPurchaseDay: 8 } };
    const q = quoteBundle(s, 'electronics', 'starter', { carrierId: 'standard', supplierId: 'regional' });
    expect(q.days).toBe(1 + 2 - 1);
  });
  it('retailUnitPrice unchanged for local/B', () => {
    expect(retailUnitPrice(createGame(42, 'electronics'), 'phone_case')).toBe(240);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @shopflow/sim exec vitest run test/suppliers.test.ts` → FAIL.

- [ ] **Step 3: Complete `suppliers.ts`**

```ts
// packages/sim/src/suppliers.ts
import { suppliers as SUP } from '@shopflow/data';
import type { GameState, Grade } from './types.js';

export const absDay = (c: { day: number; month: number; year: number }): number =>
  (c.year - 1) * 360 + (c.month - 1) * 30 + c.day;

export const supplierDef = (id: string): any => (SUP.tiers as any[]).find((t) => t.id === id);

export const supplierUnlocked = (s: GameState, supplierId: string): boolean =>
  (supplierDef(supplierId)?.unlockStage ?? 99) <= s.stage;

/** Hạng được phép ở nhà cung cấp này theo màn (spec B2: nội địa màn 1 chỉ B). */
export function gradeAllowed(s: GameState, supplierId: string, grade: Grade): boolean {
  const def = supplierDef(supplierId);
  if (!def) return false;
  const list: string[] = s.stage === 1 && def.gradesStage1 ? def.gradesStage1 : def.grades;
  return list.includes(grade);
}

/** Cấp quan hệ = chỉ số (0-based) của mốc XP cao nhất đã đạt. */
export function relationshipLevel(s: GameState, supplierId: string): number {
  const xp = s.relationships[supplierId]?.xp ?? 0;
  const levels = SUP.relationship.levels as { xp: number }[];
  let lv = 0;
  levels.forEach((l, i) => { if (xp >= l.xp) lv = i; });
  return lv;
}

export const relationshipDiscount = (s: GameState, supplierId: string): number =>
  (SUP.relationship.levels as any[])[relationshipLevel(s, supplierId)].discount ?? 0;

export function relationshipXp(s: GameState, supplierId: string): { xp: number; level: number; nextXp: number | null } {
  const xp = s.relationships[supplierId]?.xp ?? 0;
  const level = relationshipLevel(s, supplierId);
  const next = (SUP.relationship.levels as any[])[level + 1];
  return { xp, level, nextXp: next ? next.xp : null };
}

/** Hệ số giá theo hạng; đặc quyền cấp có `exclusiveBundle`: hạng A giá hạng B. */
export function gradeCostMult(s: GameState, supplierId: string, grade: Grade): number {
  const lv = (SUP.relationship.levels as any[])[relationshipLevel(s, supplierId)];
  if (grade === 'A' && lv.exclusiveBundle) return SUP.grades.B.costMult;
  return (SUP.grades as any)[grade].costMult;
}

/** Cộng XP sau khi mua: $100 = 1 XP (spec B2). */
export function addRelationshipXp(s: GameState, supplierId: string, cost: number): GameState {
  const cur = s.relationships[supplierId] ?? { xp: 0, lastPurchaseDay: absDay(s.clock) };
  return { ...s, relationships: { ...s.relationships, [supplierId]: {
    xp: cur.xp + Math.floor(cost / SUP.relationship.xpPerCents), lastPurchaseDay: absDay(s.clock) } } };
}
```

- [ ] **Step 4: Rewrite purchase pricing in `actions.ts`**

Replace `retailUnitPrice`, `makeDelivery`, `buyRetail`, `buyBundle` with:

```ts
import type { Cents, Delivery, GameState, Grade } from './types.js';
import { wholesaleEnvMult } from './env.js';
import { shelfCapacity } from './logistics.js';
import { modifiers } from './modifiers.js';
import { supplierDef, supplierUnlocked, gradeAllowed, gradeCostMult, relationshipDiscount, relationshipLevel, addRelationshipXp } from './suppliers.js';

export interface PurchaseOpts { carrierId: string; supplierId?: string; grade?: Grade; seasonalId?: string }

const norm = (o: PurchaseOpts) => ({ carrierId: o.carrierId, supplierId: o.supplierId ?? 'local', grade: (o.grade ?? 'B') as Grade, seasonalId: o.seasonalId });

/** Ngày giao (spec B3): gói + nguồn + hãng − 1 (quan hệ có daysDelta) × Định Tuyến. */
function deliveryDays(s: GameState, baseDays: number, supplierId: string, carrierId: string): number {
  const sup = supplierDef(supplierId); const carrier = (SUP.carriers as any[]).find((c) => c.id === carrierId);
  const rel = (SUP.relationship.levels as any[])[relationshipLevel(s, supplierId)];
  const raw = baseDays + (sup?.extraDays ?? 0) + (carrier?.daysDelta ?? 0) + (rel.daysDelta ?? 0);
  return Math.max(0, Math.round(raw * modifiers(s).deliveryDays));
}

function shipFee(s: GameState, carrierId: string, industryId: string | null, bundle: boolean): Cents {
  const carrier = (SUP.carriers as any[]).find((c) => c.id === carrierId);
  const ind = industryId ? (IND.industries as any[]).find((i) => i.id === industryId) : null;
  const mult = bundle ? (ind?.traits?.bundleShipMult ?? 1) : 1;
  return Math.round((carrier?.fee ?? 0) * modifiers(s).shipping * mult);
}

export function quoteRetail(s: GameState, productId: string, qty: number, o: PurchaseOpts) {
  const { carrierId, supplierId, grade } = norm(o);
  const f = findProduct(productId)!;
  const sup = supplierDef(supplierId);
  const unit = Math.round(f.p.wholesale * SUP.retail.priceMult * (sup?.costMult ?? 1)
    * gradeCostMult(s, supplierId, grade) * (1 - relationshipDiscount(s, supplierId)));
  const moq = supplierId === 'local' ? SUP.retail.moqLocal : SUP.retail.moqImport;
  return { unit, goods: unit * qty, ship: shipFee(s, carrierId, f.ind.id, false), days: deliveryDays(s, 0, supplierId, carrierId), moq };
}

export const retailUnitPrice = (s: GameState, productId: string): Cents =>
  quoteRetail(s, productId, 1, { carrierId: 'standard' }).unit;

export function quoteBundle(s: GameState, industryId: string, bundleId: string, o: PurchaseOpts) {
  const { carrierId, supplierId, grade, seasonalId } = norm(o);
  const ind = (IND.industries as any[]).find((i) => i.id === industryId);
  const bundle = ind?.bundles.find((b: any) => b.id === bundleId);
  if (!ind || !bundle) return { goods: 0, ship: 0, days: 0, discountPct: 0 };
  const sup = supplierDef(supplierId);
  let goods = bundle.cost * (sup?.costMult ?? 1) * gradeCostMult(s, supplierId, grade) * (1 - relationshipDiscount(s, supplierId))
    * wholesaleEnvMult(s.clock, industryId) * modifiers(s).wholesale;
  let discountPct = 0;
  if (seasonalId) {
    const sb = (CAL.seasonalBundles as any[]).find((x) => x.id === seasonalId);
    if (sb) { goods *= 1 - sb.discount; discountPct = sb.discount; }
  }
  return { goods: Math.round(goods), ship: shipFee(s, carrierId, industryId, true), days: deliveryDays(s, bundle.days, supplierId, carrierId), discountPct };
}

function makeDelivery(s: GameState, items: Record<string, number>, cost: Cents, o: ReturnType<typeof norm>, daysLeft: number, bundleId?: string): GameState {
  const itemsTotal = Object.values(items).reduce((a, b) => a + b, 0);
  const d: Delivery = {
    id: `d${s.deliverySeq + 1}`, bundleId, items, grade: o.grade, supplierId: o.supplierId, carrierId: o.carrierId,
    cost, state: daysLeft === 0 ? 'auditing' : 'shipping', daysLeft, itemsTotal, itemsChecked: 0,
    riskResolved: daysLeft === 0,
  };
  const next: GameState = {
    ...s, deliverySeq: s.deliverySeq + 1,
    money: s.money - cost, dayPurchases: s.dayPurchases + cost,
    deliveries: [...s.deliveries, d],
    unchecked: d.state === 'auditing' ? s.unchecked + itemsTotal : s.unchecked,
    retailLotsBought: s.retailLotsBought + (bundleId ? 0 : 1),
    bundleLotsBought: s.bundleLotsBought + (bundleId ? 1 : 0),
  };
  return addRelationshipXp(next, o.supplierId, cost);
}

/** Kiểm tra chung nguồn/hạng/hãng — trả thông báo lỗi hoặc null. */
function purchaseGate(s: GameState, o: ReturnType<typeof norm>): string | null {
  if (!supplierDef(o.supplierId)) return 'Không có nguồn này';
  if (!supplierUnlocked(s, o.supplierId)) return `Nguồn mở ở màn ${supplierDef(o.supplierId).unlockStage}`;
  if (!gradeAllowed(s, o.supplierId, o.grade)) return `Nguồn này chưa có hạng ${o.grade}`;
  if (!(SUP.carriers as any[]).some((c) => c.id === o.carrierId)) return 'Chưa chọn hãng vận chuyển';
  return null;
}

export function buyRetail(s: GameState, productId: string, qty: number, opts: PurchaseOpts): GameState {
  const o = norm(opts);
  const f = findProduct(productId);
  if (!f || !s.industries.includes(f.ind.id)) return reject(s, 'Sản phẩm không thuộc ngành của bạn');
  if (((f.p as any).unlockStage ?? 1) > s.stage) return reject(s, `Mở ở màn ${(f.p as any).unlockStage}`);
  const gate = purchaseGate(s, o); if (gate) return reject(s, gate);
  const q = quoteRetail(s, productId, qty, o);
  if (qty < q.moq) return reject(s, `Tối thiểu ${q.moq} sản phẩm`);
  if (qty > SUP.retail.maxPerOrder) return reject(s, `Tối đa ${SUP.retail.maxPerOrder} sản phẩm/lần`);
  const cost = q.goods + q.ship;
  if (s.money < cost) return reject(s, 'Không đủ tiền');
  if (q.days === 0 && qty > pendingAuditCapacity(s)) return reject(s, 'Khu chờ kiểm đã đầy — cần ô trống');
  return ok(makeDelivery(s, { [productId]: qty }, cost, o, q.days));
}

export function buyBundle(s: GameState, industryId: string, bundleId: string, opts: PurchaseOpts): GameState {
  const o = norm(opts);
  const ind = (IND.industries as any[]).find((i) => i.id === industryId);
  if (!ind || !s.industries.includes(industryId)) return reject(s, 'Ngành chưa mở');
  const bundle = ind.bundles.find((b: any) => b.id === bundleId);
  if (!bundle) return reject(s, 'Không có gói này');
  if (bundle.unlockStage > s.stage) return reject(s, `Mở ở màn ${bundle.unlockStage}`);
  const gate = purchaseGate(s, o); if (gate) return reject(s, gate);
  let seasonalBought = s.seasonalBought;
  if (o.seasonalId) {
    if (s.stage < 2) return reject(s, 'Gói mùa mở ở màn 2');
    const sb = (CAL.seasonalBundles as any[]).find((x) => x.id === o.seasonalId);
    if (!sb) return reject(s, 'Không có gói mùa này');
    const [[fm, fd], [tm, td]] = sb.window;
    const a = s.clock.month * 100 + s.clock.day;
    if (a < fm * 100 + fd || a > tm * 100 + td) return reject(s, 'Ngoài cửa sổ gói mùa');
    if (sb.industries !== 'all' && !(sb.industries as string[]).includes(industryId)) return reject(s, 'Gói mùa không áp dụng ngành này');
    if ((s.seasonalBought[o.seasonalId] ?? 0) >= sb.limit) return reject(s, 'Hết lượt mua gói mùa');
    seasonalBought = { ...s.seasonalBought, [o.seasonalId]: (s.seasonalBought[o.seasonalId] ?? 0) + 1 };
  }
  const q = quoteBundle(s, industryId, bundleId, o);
  const cost = q.goods + q.ship;
  if (s.money < cost) return reject(s, 'Không đủ tiền');
  const itemsTotal = Object.values(bundle.items as Record<string, number>).reduce((a, b) => a + b, 0);
  if (q.days === 0 && itemsTotal > pendingAuditCapacity(s)) return reject(s, 'Khu chờ kiểm đã đầy — cần ô trống');
  return ok(makeDelivery({ ...s, seasonalBought }, bundle.items as Record<string, number>, cost, o, q.days, bundleId));
}
```

Keep `findProduct`, `pendingAuditCapacity`, `expediteDelivery` (unchanged). Remove the old `makeDelivery` signature entirely.

- [ ] **Step 5: Update call sites to the options object**

- `packages/sim/test/purchase.test.ts`: every `buyRetail(s, pid, qty, 'standard')` → `buyRetail(s, pid, qty, { carrierId: 'standard' })`; every `buyBundle(s, ind, b, 'standard'|'express')` → `{ carrierId: '…' }`. Expected numbers do not change (local/B defaults).
- `packages/sim/test/logistics.test.ts`: same substitution (6 call sites).
- `packages/sim/test/harness.test.ts`: three call sites → `{ carrierId: 'standard' }`.
- `apps/web/src/worker/simWorker.ts`:
  ```ts
  buyRetail: (...a) => A.buyRetail(state!, ...(a as [string, number, A.PurchaseOpts])),
  buyBundle: (...a) => A.buyBundle(state!, ...(a as [string, string, A.PurchaseOpts])),
  ```
- `apps/web/src/screens/RestockRetail.tsx`: `dispatch('buyRetail', pid, q, { carrierId })`.
- `apps/web/src/screens/RestockBundles.tsx`: `dispatch('buyBundle', ind.id, b.id, { carrierId })` and the seasonal call `dispatch('buyBundle', ind.id, cheapest.id, { carrierId, seasonalId: seasonal.id })`.

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm test` and `pnpm typecheck` → green. If the relationship test's XP count is off, check `xpPerCents = 10000` (cents), i.e. $120 bundle + $20 ship = 14000 cents → 1 XP per purchase.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(sim): supplier/grade purchases, quote helpers, relationship XP

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: Supplier risk + relationship decay in `settleDay(s, rng)`

**Files:**
- Modify: `packages/sim/src/logistics.ts`, `packages/sim/src/settleDay.ts`, `packages/sim/src/suppliers.ts`, `packages/sim/src/tick.ts`
- Modify (call sites): `packages/sim/test/settle-stage.test.ts` (none call `settleDay` directly — verify with grep), `packages/sim/src/index.ts` unchanged
- Test: `packages/sim/test/risk.test.ts` (new)

**Interfaces:**
- Produces: `settleDay(s, rng)`, `advanceShipping(s, rng)`, `decayRelationships(s): GameState`. Risk resolves once per lot (`riskResolved`), tag in `risk`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/sim/test/risk.test.ts
import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { buyBundle } from '../src/actions.js';
import { advanceShipping } from '../src/logistics.js';
import { decayRelationships } from '../src/suppliers.js';
import { settleDay } from '../src/settleDay.js';

const seq = (...vals: number[]) => { let i = 0; return { next: () => vals[Math.min(i++, vals.length - 1)] }; };
const lot = (supplierId: string) => {
  const s = createGame(42, 'electronics'); s.stage = 3; s.money = 10_000_000; s.clock.day = 8;
  return buyBundle(s, 'electronics', 'starter', { carrierId: 'standard', supplierId, grade: 'B' });
};

describe('supplier risk (first night only)', () => {
  it('regional: delay when roll < 0.05', () => {
    const s = advanceShipping(lot('regional'), seq(0.01));
    expect(s.deliveries[0]).toMatchObject({ risk: 'delay', riskResolved: true, daysLeft: 3 + 1 - 1 });
  });
  it('regional: no delay otherwise', () => {
    const s = advanceShipping(lot('regional'), seq(0.5));
    expect(s.deliveries[0].risk).toBeUndefined();
    expect(s.deliveries[0].daysLeft).toBe(2);
  });
  it('overseas: customs +2 and loss 10% can both fire; customs wins the tag', () => {
    const s = advanceShipping(lot('overseas'), seq(0.05, 0.01));
    const d = s.deliveries[0];
    expect(d.risk).toBe('customs');
    expect(d.daysLeft).toBe(5 + 2 - 1);
    // 15 ốp → 13, 10 cáp → 9 (floor of ×0.9)
    expect(d.items).toEqual({ phone_case: 13, cable: 9 });
    expect(d.itemsTotal).toBe(22);
  });
  it('overseas: loss only', () => {
    const d = advanceShipping(lot('overseas'), seq(0.5, 0.01)).deliveries[0];
    expect(d.risk).toBe('loss'); expect(d.daysLeft).toBe(4);
  });
  it('resolved once: second night rolls nothing', () => {
    let s = advanceShipping(lot('regional'), seq(0.5));
    s = advanceShipping(s, seq(0.01));
    expect(s.deliveries[0].risk).toBeUndefined();
    expect(s.deliveries[0].daysLeft).toBe(1);
  });
});

describe('relationship decay', () => {
  it('drops one level after 30 idle days', () => {
    const s = createGame(42, 'electronics');
    s.relationships = { local: { xp: 35, lastPurchaseDay: 6 } };
    s.clock.day = 6; s.clock.month = 2; // absDay 36 → 30 ngày sau
    const d = decayRelationships(s);
    expect(d.relationships.local.xp).toBe(10); // về mốc cấp trước (index 1)
    expect(d.relationships.local.lastPurchaseDay).toBe(36);
    expect(decayRelationships(createGame(42, 'electronics')).relationships).toEqual({});
  });
  it('settleDay applies decay', () => {
    const s = createGame(42, 'electronics');
    s.relationships = { local: { xp: 10, lastPurchaseDay: 6 } };
    s.clock = { minute: 24 * 60, day: 6, month: 2, year: 1 };
    expect(settleDay(s, seq(0.5)).relationships.local.xp).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @shopflow/sim exec vitest run test/risk.test.ts` → FAIL.

- [ ] **Step 3: Implement risk in `logistics.ts`**

Replace `advanceShipping`:

```ts
import { stages as ST, suppliers as SUP } from '@shopflow/data';
import type { GameState, Delivery, Rng } from './types.js';

/** Rủi ro nguồn (spec B2) — chỉ xét một lần, đêm đầu tiên lô còn đang vận chuyển. */
function resolveRisk(d: Delivery, rng: Rng): Delivery {
  if (d.riskResolved) return d;
  const risk = (SUP.tiers as any[]).find((t) => t.id === d.supplierId)?.risk;
  let out: Delivery = { ...d, riskResolved: true };
  if (!risk) return out;
  if (risk.delayChance != null && rng.next() < risk.delayChance)
    out = { ...out, daysLeft: out.daysLeft + risk.delayDays, risk: 'delay' };
  if (risk.customsChance != null) {
    const customs = rng.next() < risk.customsChance;
    const loss = rng.next() < risk.lossChance;
    if (customs) out = { ...out, daysLeft: out.daysLeft + risk.customsDays, risk: 'customs' };
    if (loss) {
      const items = Object.fromEntries(Object.entries(out.items).map(([k, v]) => [k, Math.floor(v * (1 - risk.lossPct))]));
      const itemsTotal = Object.values(items).reduce((a, b) => a + b, 0);
      out = { ...out, items, itemsTotal, risk: customs ? 'customs' : 'loss' };
    }
  }
  return out;
}

/** Gọi từ settleDay: xe chạy qua đêm. */
export function advanceShipping(s: GameState, rng: Rng): GameState {
  let unchecked = s.unchecked;
  const deliveries = s.deliveries.map((d0) => {
    if (d0.state !== 'shipping') return d0;
    const d = resolveRisk(d0, rng);
    const daysLeft = d.daysLeft - 1;
    if (daysLeft <= 0) { unchecked += d.itemsTotal; return { ...d, daysLeft: 0, state: 'auditing' as const }; }
    return { ...d, daysLeft };
  });
  return { ...s, deliveries, unchecked };
}
```

- [ ] **Step 4: Add `decayRelationships` to `suppliers.ts`**

```ts
/** Mỗi 30 ngày không mua → tụt 1 cấp (về mốc XP của cấp dưới). Gọi ở settleDay. */
export function decayRelationships(s: GameState): GameState {
  const today = absDay(s.clock);
  const idle = SUP.relationship.decayAfterIdleDays as number;
  const levels = SUP.relationship.levels as { xp: number }[];
  let changed = false;
  const relationships = { ...s.relationships };
  for (const [id, r] of Object.entries(relationships)) {
    if (today - r.lastPurchaseDay < idle) continue;
    const lv = relationshipLevel(s, id);
    if (lv === 0) { relationships[id] = { ...r, lastPurchaseDay: today }; changed = true; continue; }
    relationships[id] = { xp: levels[lv - 1].xp, lastPurchaseDay: today }; changed = true;
  }
  return changed ? { ...s, relationships } : s;
}
```

- [ ] **Step 5: Thread `rng` through `settleDay` and `tick`**

`settleDay.ts`: signature `export function settleDay(s: GameState, rng: Rng): GameState`, first line `s = decayRelationships(advanceShipping(s, rng));` (import `Rng` type and `decayRelationships`). `tick.ts`: `next = settleDay(next, rng);`.

- [ ] **Step 6: Run tests** — `pnpm test` → green (`tick` already had `rng`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(sim): supplier risk on first night, relationship decay

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: Grade mix + returns (`fulfilOrders(s, dt, rng)`)

**Files:**
- Modify: `packages/sim/src/logistics.ts` (`runAudits`), `packages/sim/src/fulfil.ts`, `packages/sim/src/tick.ts`
- Modify (call sites): `packages/sim/test/fulfil.test.ts` (3 calls)
- Test: `packages/sim/test/returns.test.ts` (new)

**Interfaces:**
- Produces: `fulfilOrders(s, dtGameMinutes, rng)`. `runAudits` maintains `inventoryGrades`. Returns: refund (no revenue/commission/rating gain), `returnedOrders++`, `dayRefunds += value`, A → restock, B/C → destroyed with rating −0.02/−0.05. Order still counts in `completedOrders` and channel `ordersDelivered`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/sim/test/returns.test.ts
import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { buyRetail } from '../src/actions.js';
import { runAudits } from '../src/logistics.js';
import { fulfilOrders } from '../src/fulfil.js';
import type { Order } from '../src/types.js';

const seq = (...vals: number[]) => { let i = 0; return { next: () => vals[Math.min(i++, vals.length - 1)] }; };
const order = (id: string): Order => ({ id, productId: 'phone_case', industryId: 'electronics', channelId: 'flea', value: 800, slaLeft: 1440, state: 'queued' });

function stocked(grade: 'A' | 'B' | 'C') {
  const s = createGame(42, 'electronics'); s.stage = 2; s.money = 1_000_000;
  s.grid.cells[0] = { type: 'shelf', level: 1 };
  s.inventory = { phone_case: 10 };
  s.inventoryGrades = { phone_case: { A: 0, B: 0, C: 0, [grade]: 10 } as any };
  s.orders = [order('o1')];
  return s;
}

describe('grade mix from audits', () => {
  it('runAudits records checked units under the lot grade', () => {
    let s = createGame(42, 'electronics'); s.stage = 2; s.grid.cells[0] = { type: 'shelf', level: 1 };
    s = buyRetail(s, 'phone_case', 10, { carrierId: 'standard', grade: 'A' });
    s = runAudits(s, 30); // 1 bàn: 20 SP/giờ → 10 SP sau 30 phút
    expect(s.inventory.phone_case).toBe(10);
    expect(s.inventoryGrades.phone_case).toEqual({ A: 10, B: 0, C: 0 });
  });
});

describe('returns at delivery', () => {
  // Điện tử: returnRateBonus 0.03 ⇒ A 4%, B 7%, C 13%.
  it('no return: revenue credited, grade decremented', () => {
    const s = fulfilOrders(stocked('B'), 4, seq(0.5, 0.99));
    expect(s.money).toBe(1_000_000 + 704);
    expect(s.inventoryGrades.phone_case).toEqual({ A: 0, B: 9, C: 0 });
    expect(s.returnedOrders).toBe(0);
  });
  it('grade B return: refund, unit destroyed, rating −0.02, still counts delivered', () => {
    const s = fulfilOrders(stocked('B'), 4, seq(0.5, 0.01));
    expect(s.money).toBe(1_000_000);
    expect(s.dayRevenue.flea ?? 0).toBe(0);
    expect(s.dayCommission).toBe(0);
    expect(s.dayRefunds).toBe(800);
    expect(s.inventory.phone_case).toBe(9);
    expect(s.rating).toBeCloseTo(3.98);
    expect(s.returnedOrders).toBe(1);
    expect(s.completedOrders).toBe(1);
    expect(s.channels[0].ordersDelivered).toBe(1);
    expect(s.orders).toHaveLength(0);
  });
  it('grade C return: rating −0.05', () => {
    expect(fulfilOrders(stocked('C'), 4, seq(0.5, 0.01)).rating).toBeCloseTo(3.95);
  });
  it('grade A return: unit back on shelf, no rating hit', () => {
    const s = fulfilOrders(stocked('A'), 4, seq(0.5, 0.01));
    expect(s.inventory.phone_case).toBe(10);
    expect(s.inventoryGrades.phone_case.A).toBe(10);
    expect(s.rating).toBe(4);
  });
  it('empty mix falls back to grade B', () => {
    const s0 = stocked('B'); s0.inventoryGrades = {};
    const s = fulfilOrders(s0, 4, seq(0.5, 0.01));
    expect(s.rating).toBeCloseTo(3.98);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @shopflow/sim exec vitest run test/returns.test.ts` → FAIL.

- [ ] **Step 3: Track grades in `runAudits`**

In `logistics.ts` `runAudits`, add `const grades = { ...s.inventoryGrades };` next to `const inventory = …`, and inside the allocation loop after `inventory[pid] = (inventory[pid] ?? 0) + take;` add:

```ts
        const g = grades[pid] ? { ...grades[pid] } : { A: 0, B: 0, C: 0 };
        g[d.grade] += take; grades[pid] = g;
```

Return `{ ...s, deliveries: remaining, inventory, inventoryGrades: grades, unchecked }`.

- [ ] **Step 4: Rewrite `fulfilOrders` in `fulfil.ts`**

```ts
import { channels as CH, stages as ST, suppliers as SUP, industries as IND } from '@shopflow/data';
import type { GameState, Grade, Rng } from './types.js';
import { modifiers } from './modifiers.js';

const RETURN_RATING: Record<Grade, number> = { A: 0, B: -0.02, C: -0.05 }; // spec B2: hạng B/C −0.02/−0.05

/** Chọn hạng của 1 đơn vị theo tỉ lệ tồn; mix trống/không nhất quán → B. */
function pickGrade(mix: { A: number; B: number; C: number } | undefined, rng: Rng): Grade {
  if (!mix) return 'B';
  const total = mix.A + mix.B + mix.C;
  if (total <= 0) return 'B';
  let x = rng.next() * total;
  for (const g of ['A', 'B', 'C'] as Grade[]) { x -= mix[g]; if (x < 0) return g; }
  return 'C';
}

export function fulfilOrders(s: GameState, dtGameMinutes: number, rng: Rng): GameState {
  let accum = s.packAccum + packCapacityPerSecond(s) * (dtGameMinutes / 4);
  let n = Math.floor(accum);
  if (n <= 0) return { ...s, packAccum: accum };
  accum -= n;
  const inventory = { ...s.inventory };
  const grades = { ...s.inventoryGrades };
  const dayRevenue = { ...s.dayRevenue }, dayOrders = { ...s.dayOrders };
  let { money, rating, dayCommission, onTimeStreak, completedOrders, returnedOrders, dayRefunds } = s;
  const channels = s.channels.map((c) => ({ ...c }));
  const remaining = [] as typeof s.orders;
  for (const o of s.orders) {
    if (n > 0 && (inventory[o.productId] ?? 0) > 0) {
      n--;
      inventory[o.productId]--;
      const g = pickGrade(grades[o.productId], rng);
      if (grades[o.productId]) { grades[o.productId] = { ...grades[o.productId], [g]: Math.max(0, grades[o.productId][g] - 1) }; }
      const ind = (IND.industries as any[]).find((i) => i.id === o.industryId);
      const returnRate = (SUP.grades as any)[g].returnRate + (ind?.traits?.returnRateBonus ?? 0);
      const returned = rng.next() < returnRate;
      if (returned) {
        returnedOrders++; dayRefunds += o.value;
        if (g === 'A') {
          inventory[o.productId]++;
          if (grades[o.productId]) grades[o.productId] = { ...grades[o.productId], A: grades[o.productId].A + 1 };
        } else rating = Math.max(ST.rating.min, rating + RETURN_RATING[g]);
      } else {
        const revenue = Math.round(o.value * (1 + comboBonus(onTimeStreak)));
        const comAmt = Math.round(revenue * commissionOf(s, o.channelId));
        money += revenue - comAmt;
        dayRevenue[o.channelId] = (dayRevenue[o.channelId] ?? 0) + revenue;
        dayCommission += comAmt;
        rating = Math.min(ST.rating.max, rating + ST.rating.perDelivered);
      }
      dayOrders[o.channelId] = (dayOrders[o.channelId] ?? 0) + 1;
      onTimeStreak++;
      completedOrders++;
      const ch = channels.find((c) => c.id === o.channelId);
      if (ch) ch.ordersDelivered++;
    } else remaining.push(o);
  }
  return {
    ...s, packAccum: accum, inventory, inventoryGrades: grades, orders: remaining, money, rating,
    dayRevenue, dayOrders, dayCommission, onTimeStreak, completedOrders, returnedOrders, dayRefunds,
    channels, combo: comboBonus(onTimeStreak), bestCombo: Math.max(s.bestCombo, comboBonus(onTimeStreak)),
  };
}
```

Note `dayOrders` counts the returned order too (it was an order handled that day); the report's revenue rows use `revenueByChannel`, so a returned order shows as an order with $0 revenue.

- [ ] **Step 5: Thread `rng`**

`tick.ts`: `next = fulfilOrders(next, dtGameMinutes, rng);`. `packages/sim/test/fulfil.test.ts`: add `const noReturn = { next: () => 0.99 };` and pass it as the third argument in the three `fulfilOrders(…, 4)` calls (existing expectations hold: the grade pick consumes one roll, the return roll gets 0.99 ≥ any rate).

- [ ] **Step 6: Run tests** — `pnpm test` → green. If `fulfil.test.ts` money expectations break, confirm the stub returns ≥ 0.13 for every call.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(sim): grade mix tracking and returns at delivery

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 6: Market cycle, SEO decay, SocialShop peak, profit streak, report v2

**Files:**
- Modify: `packages/sim/src/settleDay.ts`, `packages/sim/src/env.ts`, `packages/sim/src/formulas.ts`, `packages/sim/src/orders.ts`, `packages/sim/src/index.ts`
- Test: `packages/sim/test/market.test.ts` (new), `packages/sim/test/channels.test.ts` (append one test), `packages/sim/test/env.test.ts` (append)

**Interfaces:**
- Produces: `nightMult(minute): number`, `peakMultFor(def: { peakHourMult?: number }, minute): number`; `hourMult(minute)` kept as `nightMult × (peak ? 2 : 1)` (deprecated alias removed in Task 14). `orderRate(s, industryId, seo, envMult)` — `envMult` must now exclude the hour peak (callers pass `trafficEnvMult × nightMult`). `settleDay` handles market cycle, SEO decay, profit streak, recession tracking, `refunds`/`questBonus` report lines. `rollMarketCycle(rng): string` exported for tests.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/sim/test/market.test.ts
import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { settleDay, rollMarketCycle } from '../src/settleDay.js';
import { calendar as CAL, costs as CO } from '@shopflow/data';

const seq = (...vals: number[]) => { let i = 0; return { next: () => vals[Math.min(i++, vals.length - 1)] }; };
const midnight = (stage: number) => { const s = createGame(42, 'electronics'); s.stage = stage; s.clock.day = 8; return s; };

describe('market cycle (từ màn 3, đổi mỗi 5 ngày)', () => {
  it('rollMarketCycle is weighted by p in data order', () => {
    expect(rollMarketCycle(seq(0.0))).toBe('stable');
    expect(rollMarketCycle(seq(0.5))).toBe('boom');     // 0.40 ≤ 0.5 < 0.65
    expect(rollMarketCycle(seq(0.7))).toBe('slow');     // 0.65 ≤ 0.7 < 0.85
    expect(rollMarketCycle(seq(0.9))).toBe('recession');
  });
  it('stays stable before stage 3', () => {
    const s = settleDay(midnight(2), seq(0.9));
    expect(s.marketCycle).toBe('stable'); expect(s.marketCycleDaysLeft).toBe(0);
  });
  it('rolls at stage 3 when daysLeft hits 0, then counts down', () => {
    let s = settleDay(midnight(3), seq(0.9));
    expect(s.marketCycle).toBe('recession');
    expect(s.marketCycleDaysLeft).toBe(CAL.marketCycle.periodDays);
    expect(s.recessionClean).toBe(true);
    s = settleDay(s, seq(0.0));
    expect(s.marketCycle).toBe('recession'); expect(s.marketCycleDaysLeft).toBe(CAL.marketCycle.periodDays - 1);
  });
  it('leaving a clean recession sets survivedRecession', () => {
    let s = midnight(3); s.marketCycle = 'recession'; s.marketCycleDaysLeft = 1;
    s = settleDay(s, seq(0.0)); // countdown → 0
    expect(s.marketCycle).toBe('recession');
    s = settleDay(s, seq(0.0)); // roll → stable
    expect(s.marketCycle).toBe('stable'); expect(s.survivedRecession).toBe(true);
  });
  it('unpaid channel fee during recession dirties recessionClean', () => {
    let s = midnight(3); s.marketCycle = 'recession'; s.marketCycleDaysLeft = 3; s.money = 0;
    s.channels.push({ id: 'mall', open: true, suspended: false, ratingLocked: false, level: 1, ordersDelivered: 0 });
    s = settleDay(s, seq(0.0));
    expect(s.recessionClean).toBe(false);
  });
});

describe('SEO decay + profit streak', () => {
  it('SEO −1/ngày về sàn 40 từ màn 3', () => {
    let s = midnight(3); s.seo = { electronics: 41 };
    s = settleDay(s, seq(0.0)); expect(s.seo.electronics).toBe(40);
    s = settleDay(s, seq(0.0)); expect(s.seo.electronics).toBe(CO.seoFloor);
    const s2 = settleDay({ ...midnight(2), seo: { electronics: 55 } }, seq(0.0));
    expect(s2.seo.electronics).toBe(55);
  });
  it('profitStreakDays counts consecutive net > 0 days', () => {
    let s = midnight(2); s.dayRevenue = { flea: 500000 };
    s = settleDay(s, seq(0.0)); expect(s.profitStreakDays).toBe(1);
    s = settleDay(s, seq(0.0)); expect(s.profitStreakDays).toBe(0); // ngày trống: net âm (thuê kho)
  });
  it('report carries refunds and questBonus, questBonus folded into net', () => {
    let s = midnight(2); s.dayRefunds = 800; s.dayQuestBonus = 5000; s.dayRevenue = { flea: 10000 };
    s = settleDay(s, seq(0.0));
    const r = s.reports[0];
    expect(r.refunds).toBe(800); expect(r.questBonus).toBe(5000);
    expect(r.net).toBe(10000 - 0 - 0 - 1800 - 100 - 0 + 5000);
    expect(s.dayRefunds).toBe(0); expect(s.dayQuestBonus).toBe(0);
  });
});
```

Append to `packages/sim/test/channels.test.ts`:

```ts
describe('SocialShop peak ×3 (per-channel hour multiplier)', () => {
  it('at 12:00 social weight is 3× its base K×A, flea is 2×', () => {
    const s = createGame(42, 'fashion'); s.stage = 3; s.money = 10_000_000;
    const s2 = openChannel(s, 'social');
    const w = (minute: number) => Object.fromEntries(channelWeights({ ...s2, clock: { ...s2.clock, minute } }, 'fashion'));
    const day = w(9 * 60), noon = w(12 * 60);
    expect(noon.social / day.social).toBeCloseTo(3);
    expect(noon.flea / day.flea).toBeCloseTo(2);
  });
});
```

Append to `packages/sim/test/env.test.ts`:

```ts
import { nightMult, peakMultFor } from '../src/env.js';
describe('nightMult / peakMultFor', () => {
  it('night ×0.5, day 1; peak per channel', () => {
    expect(nightMult(3 * 60)).toBe(0.5); expect(nightMult(12 * 60)).toBe(1);
    expect(peakMultFor({ peakHourMult: 3 }, 12 * 60)).toBe(3);
    expect(peakMultFor({ peakHourMult: 3 }, 9 * 60)).toBe(1);
    expect(peakMultFor({}, 12 * 60)).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @shopflow/sim exec vitest run` → new tests FAIL.

- [ ] **Step 3: `env.ts` — split hour multipliers**

```ts
const peakHour = (minute: number) => CAL.hourly.peakHours.includes(Math.floor(minute / 60) % 24);
export function nightMult(minute: number): number {
  return CAL.hourly.nightHours.includes(Math.floor(minute / 60) % 24) ? CAL.hourly.nightMult : 1;
}
/** Hệ số giờ cao điểm riêng từng kênh (spec B5: SocialShop ×3, còn lại ×2). */
export function peakMultFor(def: { peakHourMult?: number }, minute: number): number {
  return peakHour(minute) ? (def.peakHourMult ?? 1) : 1;
}
/** @deprecated dùng nightMult × peakMultFor; giữ để web M1 còn biên dịch tới Task 14. */
export function hourMult(minute: number): number {
  return nightMult(minute) * (peakHour(minute) ? 2 : 1);
}
```

- [ ] **Step 4: `formulas.ts` — per-channel peak**

In both `orderRate` and `channelWeights`, multiply each channel term by `peakMultFor(def, s.clock.minute)`:

```ts
import { peakMultFor } from './env.js';
// orderRate loop:
    channelSum += levelK(def, c.level) * a * peakMultFor(def, s.clock.minute);
// channelWeights map:
      return [c.id, levelK(def, c.level) * a * peakMultFor(def, s.clock.minute)] as [string, number];
```

`orders.ts`: `const env = trafficEnvMult(s.clock, indId) * nightMult(s.clock.minute);` (import `nightMult` instead of `hourMult`).

- [ ] **Step 5: Rewrite `settleDay.ts`**

```ts
import { channels as CH, costs as CO, calendar as CAL, upgrades as UP } from '@shopflow/data';
import type { GameState, DayReport, Rng } from './types.js';
import { advanceShipping } from './logistics.js';
import { decayRelationships } from './suppliers.js';
import { checkQuests } from './quests.js'; // Task 7 creates it; until then use the stub below

/** Chu kỳ thị trường: chọn trạng thái theo trọng số p, đúng thứ tự trong data. */
export function rollMarketCycle(rng: Rng): string {
  const states = CAL.marketCycle.states as { id: string; p: number }[];
  let x = rng.next();
  for (const st of states) { x -= st.p; if (x < 0) return st.id; }
  return states[states.length - 1].id;
}

/** Kết toán 00:00 (spec B6/B7). */
export function settleDay(s: GameState, rng: Rng): GameState {
  s = decayRelationships(advanceShipping(s, rng));
  const equipment = s.grid.cells.filter((c): c is { type: 'shelf' | 'packer' | 'robot'; level: 1 | 2 | 3 } => !!c && c.type !== 'pile');
  const rent = CO.warehouseRentPerCellPerDay * s.grid.size * s.grid.size;
  const maintenance = equipment.reduce((sum, e) => sum + CO.maintenancePerEquipmentLevelPerDay * e.level, 0);
  let channelFees = 0;
  let money = s.money - rent - maintenance;
  let recessionClean = s.recessionClean;
  const paid = s.channels.map((c) => {
    if (!c.open) return c;
    const def = CH.channels.find((d: any) => d.id === c.id)!;
    if (!def.dailyFee) return { ...c, suspended: false };
    if (money >= def.dailyFee) { money -= def.dailyFee; channelFees += def.dailyFee; return { ...c, suspended: false }; }
    if (s.marketCycle === 'recession') recessionClean = false;
    return { ...c, suspended: true }; // thiếu tiền → tạm ngưng kênh có phí
  });
  const rated = paid.map((c) => {
    const def = CH.channels.find((d: any) => d.id === c.id)!;
    if (!(def as any).minRating) return c;
    if (s.rating < (def as any).minRating) return { ...c, ratingLocked: true };
    if (c.ratingLocked && s.rating >= (def as any).minRating) return { ...c, ratingLocked: false };
    return c;
  });

  // Chu kỳ thị trường (màn 3+): đổi mỗi periodDays.
  let marketCycle = s.marketCycle, marketCycleDaysLeft = s.marketCycleDaysLeft, survivedRecession = s.survivedRecession;
  if (s.stage >= CAL.marketCycle.fromStage) {
    if (marketCycleDaysLeft <= 0) {
      const next = rollMarketCycle(rng);
      if (marketCycle === 'recession' && next !== 'recession' && recessionClean) survivedRecession = true;
      if (next === 'recession' && marketCycle !== 'recession') recessionClean = true;
      marketCycle = next; marketCycleDaysLeft = CAL.marketCycle.periodDays;
    } else marketCycleDaysLeft--;
  }

  // SEO hao hụt (màn 3+).
  let seo = s.seo;
  if (s.stage >= CO.seoDecayFromStage) {
    seo = { ...s.seo };
    for (const id of s.industries) seo[id] = Math.max(CO.seoFloor, (seo[id] ?? UP.seoStart) - CO.seoDecayPerDay);
  }

  const revenue = Object.values(s.dayRevenue).reduce((a, b) => a + b, 0);
  const report: DayReport = {
    day: s.clock.day, month: s.clock.month,
    revenueByChannel: s.dayRevenue, ordersByChannel: s.dayOrders,
    commission: s.dayCommission, channelFees, rent, maintenance,
    purchases: s.dayPurchases, other: 0, refunds: s.dayRefunds, questBonus: s.dayQuestBonus,
    net: revenue - s.dayCommission - channelFees - rent - maintenance - s.dayPurchases + s.dayQuestBonus,
  };
  const out: GameState = {
    ...s, money, channels: rated, reports: [...s.reports, report], seo,
    marketCycle, marketCycleDaysLeft, recessionClean, survivedRecession,
    profitStreakDays: report.net > 0 ? s.profitStreakDays + 1 : 0,
    dayRevenue: {}, dayOrders: {}, dayCommission: 0, dayPurchases: 0, dayRefunds: 0, dayQuestBonus: 0,
  };
  return checkQuests(out);
}
```

Until Task 7 lands, create a temporary `packages/sim/src/quests.ts` containing only `export const checkQuests = (s: GameState) => s;` with the import of `GameState`. Task 7 replaces it.

Export from `index.ts`: `export { settleDay, rollMarketCycle } from './settleDay.js';` and `export * from './quests.js';`.

- [ ] **Step 6: Run tests** — `pnpm test` → green. `settle-stage.test.ts` "net = 500" still holds (no refunds/bonus). If the `midnight(3)` recession test rolls differently, check that `rollMarketCycle` consumes exactly one `rng.next()` and that `advanceShipping` consumes none when there are no shipping lots.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(sim): market cycle, SEO decay, SocialShop peak weighting, report v2

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 7: Quests with bonuses (`quests.ts`)

**Files:**
- Modify: `packages/sim/src/quests.ts` (replace stub), `packages/sim/src/actions.ts` (`ok()` calls `checkQuests`)
- Test: `packages/sim/test/quests.test.ts` (new)

**Interfaces:**
- Produces: `interface QuestDef { id: string; bonus: number }`, `questsForStage(stage: number): QuestDef[]`, `questDone(s, id): boolean`, `checkQuests(s): GameState` (pays each newly satisfied quest of the current stage once: `money += bonus`, `dayQuestBonus += bonus`, `questsDone.push(id)`).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/sim/test/quests.test.ts
import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { checkQuests, questsForStage, questDone } from '../src/quests.js';
import { openChannel, buySeo, placeEquipment } from '../src/actions.js';
import { stages as ST } from '@shopflow/data';

const at = (stage: number) => { const s = createGame(42, 'electronics'); s.stage = stage; s.money = 10_000_000; return s; };

describe('quests', () => {
  it('data: stage 2 has 4, stage 3 has 3, stage 1 none', () => {
    expect(questsForStage(1)).toEqual([]);
    expect(questsForStage(2).map((q) => q.id)).toEqual(['open_mall', 'buy_seasonal', 'place_robot', 'run_seo']);
    expect(questsForStage(3)).toHaveLength(3);
  });
  it('open_mall pays once via action ok()', () => {
    let s = openChannel(at(2), 'mall');
    const bonus = ST.quests['2'][0].bonus;
    expect(questDone(s, 'open_mall')).toBe(true);
    expect(s.money).toBe(10_000_000 - 20000 + bonus);
    expect(s.dayQuestBonus).toBe(bonus);
    s = checkQuests(s);
    expect(s.money).toBe(10_000_000 - 20000 + bonus); // không trả lần 2
  });
  it('only current-stage quests are evaluated', () => {
    const s = openChannel(at(3), 'mall');
    expect(questDone(s, 'open_mall')).toBe(false);
  });
  it('place_robot, run_seo', () => {
    let s = at(2);
    s = placeEquipment(s, 0, 'robot'); expect(questDone(s, 'place_robot')).toBe(true);
    s = buySeo(s, 'electronics'); expect(questDone(s, 'run_seo')).toBe(true);
  });
  it('stage 3 predicates: relationship_3, survive_recession, profit_5_days', () => {
    const s = at(3);
    s.relationships = { local: { xp: 30, lastPurchaseDay: 6 } };
    s.survivedRecession = true; s.profitStreakDays = 5;
    const out = checkQuests(s);
    expect(out.questsDone.sort()).toEqual(['profit_5_days', 'relationship_3', 'survive_recession']);
    expect(out.money).toBe(10_000_000 + 3 * 20000);
  });
  it('buy_seasonal', () => {
    const s = at(2); s.seasonalBought = { valentine_gift: 1 };
    expect(questDone(checkQuests(s), 'buy_seasonal')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @shopflow/sim exec vitest run test/quests.test.ts` → FAIL.

- [ ] **Step 3: Implement `quests.ts`**

```ts
// packages/sim/src/quests.ts
// Nhiệm vụ màn (checklist spec B9) — "mềm": thưởng tiền, không chặn qua màn.
import { stages as ST, upgrades as UP } from '@shopflow/data';
import type { GameState } from './types.js';
import { relationshipLevel } from './suppliers.js';

export interface QuestDef { id: string; bonus: number }

export const questsForStage = (stage: number): QuestDef[] => ((ST as any).quests?.[String(stage)] ?? []) as QuestDef[];
export const questDone = (s: GameState, id: string): boolean => s.questsDone.includes(id);

const PREDICATES: Record<string, (s: GameState) => boolean> = {
  open_mall: (s) => s.channels.some((c) => c.id === 'mall'),
  buy_seasonal: (s) => Object.values(s.seasonalBought).some((n) => n > 0),
  place_robot: (s) => s.grid.cells.some((c) => c?.type === 'robot'),
  run_seo: (s) => Object.values(s.seo).some((v) => v > UP.seoStart),
  relationship_3: (s) => Object.keys(s.relationships).some((id) => relationshipLevel(s, id) >= 2), // index 2 = "cấp 3" trong spec (cấp 1 = 0 XP)
  survive_recession: (s) => s.survivedRecession,
  profit_5_days: (s) => s.profitStreakDays >= 5,
};

/** Trả thưởng cho mọi nhiệm vụ của màn hiện tại vừa đạt; mỗi nhiệm vụ chỉ một lần. */
export function checkQuests(s: GameState): GameState {
  let out = s;
  for (const q of questsForStage(s.stage)) {
    if (out.questsDone.includes(q.id)) continue;
    const pred = PREDICATES[q.id];
    if (!pred || !pred(out)) continue;
    out = { ...out, money: out.money + q.bonus, dayQuestBonus: out.dayQuestBonus + q.bonus, questsDone: [...out.questsDone, q.id] };
  }
  return out;
}
```

Spec note: "quan hệ cấp 3" maps to `relationship.levels` index 2 (levels are 0-based with level 0 at 0 XP; the spec counts from 1). Record this mapping in the spec's 1.8 predicate line.

- [ ] **Step 4: Hook into `actions.ts`**

```ts
import { checkQuests } from './quests.js';
const ok = (s: GameState): GameState => checkQuests({ ...s, lastReject: null });
```

- [ ] **Step 5: Run tests** — `pnpm test` → green. The harness stays at stage 1 (no quests). `channels.test.ts` money assertions at stage 2 (`openChannel(atStage2(), 'mall')` → `100000 − 20000`) now receive the `open_mall` bonus: update those two expectations to `100000 - 20000 + 5000` and `100000 - 20000 - 40000 + 5000`, citing `ST.quests['2'][0].bonus` rather than the literal.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(sim): stage quests with one-time bonuses

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 8: Tutorial state actions

**Files:**
- Create: `packages/sim/src/tutorial.ts`
- Modify: `packages/sim/src/index.ts`
- Test: `packages/sim/test/tutorial.test.ts` (new)

**Interfaces:**
- Produces: `TUTORIAL_STEPS = 8`, `tutorialAdvance(s)`, `tutorialSkip(s)`, `tutorialClaim(s)`, `tutorialReset(s)` — all `GameState → GameState` with `lastReject` semantics.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/sim/test/tutorial.test.ts
import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { tutorialAdvance, tutorialSkip, tutorialClaim, tutorialReset, TUTORIAL_STEPS } from '../src/tutorial.js';
import { stages as ST } from '@shopflow/data';

describe('tutorial', () => {
  it('advance caps at 8; claim pays once', () => {
    let s = createGame(42, 'electronics');
    for (let i = 0; i < 10; i++) s = tutorialAdvance(s);
    expect(s.tutorial.step).toBe(TUTORIAL_STEPS);
    expect(tutorialClaim(createGame(42, 'electronics')).lastReject).toBeTruthy(); // chưa tới bước 8
    s = tutorialClaim(s);
    expect(s.money).toBe(100000 + ST.tutorialReward);
    expect(s.tutorial).toEqual({ step: 8, done: true, rewarded: true });
    expect(tutorialClaim(s).lastReject).toBeTruthy();
  });
  it('skip: done without reward; reset replays without paying twice', () => {
    let s = tutorialSkip(createGame(42, 'electronics'));
    expect(s.tutorial).toEqual({ step: 0, done: true, rewarded: false });
    s = tutorialReset(s);
    expect(s.tutorial).toEqual({ step: 0, done: false, rewarded: false });
    for (let i = 0; i < 8; i++) s = tutorialAdvance(s);
    s = tutorialClaim(s);
    expect(s.money).toBe(100000 + ST.tutorialReward);
    s = tutorialReset(s);
    expect(s.tutorial.rewarded).toBe(true);
    for (let i = 0; i < 8; i++) s = tutorialAdvance(s);
    expect(tutorialClaim(s).lastReject).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL (module missing).

- [ ] **Step 3: Implement `tutorial.ts`**

```ts
// packages/sim/src/tutorial.ts
// Hướng dẫn 8 bước (spec C3). Sim chỉ giữ tiến độ + thưởng; điều kiện từng bước do web đánh giá.
import { stages as ST } from '@shopflow/data';
import type { GameState } from './types.js';

export const TUTORIAL_STEPS = 8;
const ok = (s: GameState): GameState => ({ ...s, lastReject: null });
const reject = (s: GameState, msg: string): GameState => ({ ...s, lastReject: msg });

export const tutorialAdvance = (s: GameState): GameState =>
  ok({ ...s, tutorial: { ...s.tutorial, step: Math.min(TUTORIAL_STEPS, s.tutorial.step + 1) } });

export const tutorialSkip = (s: GameState): GameState =>
  ok({ ...s, tutorial: { ...s.tutorial, done: true } });

export function tutorialClaim(s: GameState): GameState {
  if (s.tutorial.step < TUTORIAL_STEPS) return reject(s, 'Chưa hoàn thành hướng dẫn');
  if (s.tutorial.rewarded) return reject(s, 'Đã nhận thưởng hướng dẫn');
  return ok({ ...s, money: s.money + ST.tutorialReward, tutorial: { step: TUTORIAL_STEPS, done: true, rewarded: true } });
}

export const tutorialReset = (s: GameState): GameState =>
  ok({ ...s, tutorial: { ...s.tutorial, step: 0, done: false } });
```

Add `export * from './tutorial.js';` to `index.ts`.

- [ ] **Step 4: Run tests** — green. **Step 5: Commit** `feat(sim): tutorial progress and one-time reward`.

### Task 9: `fastForward` with offline summary

**Files:**
- Create: `packages/sim/src/fastForward.ts`
- Modify: `packages/sim/src/index.ts`
- Test: `packages/sim/test/fastForward.test.ts` (new)

**Interfaces:**
- Produces: `MAX_OFFLINE_TICKS = 28800`, `interface OfflineSummary { ticks; ordersDelivered; ordersCancelled; ordersReturned; netRevenue; daysSettled; feesPaid; eventsStarted: string[]; eventsEnded: string[]; lowStock: string[]; stageCompleted: boolean }`, `fastForward(s, ticks, rng): { state; summary }`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/sim/test/fastForward.test.ts
import { describe, it, expect } from 'vitest';
import { createGame, tick, makeRng } from '../src/index.js';
import { buyRetail, placeEquipment } from '../src/actions.js';
import { fastForward, MAX_OFFLINE_TICKS } from '../src/fastForward.js';

function playing() {
  let s = createGame(42, 'electronics');
  s = placeEquipment(s, 0, 'shelf');
  s = buyRetail(s, 'phone_case', 40, { carrierId: 'standard' });
  return s;
}

describe('fastForward', () => {
  it('equals N single ticks for the same seed', () => {
    const a = fastForward(playing(), 500, makeRng(7)).state;
    let b = playing(); const rng = makeRng(7);
    for (let i = 0; i < 500; i++) b = tick(b, 4, rng);
    expect(a).toEqual(b);
  });
  it('summary matches counter diffs', () => {
    const s0 = playing();
    const { state, summary } = fastForward(s0, 600, makeRng(7)); // 40 giờ game → 1 lần kết toán
    expect(summary.ticks).toBe(600);
    expect(summary.ordersDelivered).toBe(state.completedOrders - s0.completedOrders);
    expect(summary.ordersCancelled).toBe(state.cancelledOrders);
    expect(summary.ordersReturned).toBe(state.returnedOrders);
    expect(summary.daysSettled).toBe(state.reports.length);
    const r = state.reports[0];
    expect(summary.feesPaid).toBe(r.rent + r.maintenance + r.channelFees);
    expect(summary.netRevenue).toBe(
      Object.values(r.revenueByChannel).reduce((x, y) => x + y, 0) - r.commission
      + Object.values(state.dayRevenue).reduce((x, y) => x + y, 0) - state.dayCommission);
    expect(summary.lowStock.every((id) => (state.inventory[id] ?? 0) < 10)).toBe(true);
  });
  it('clamps to [0, MAX_OFFLINE_TICKS]', () => {
    expect(fastForward(playing(), -5, makeRng(1)).summary.ticks).toBe(0);
    expect(fastForward(playing(), 10 ** 9, makeRng(1)).summary.ticks).toBe(MAX_OFFLINE_TICKS);
  });
  it('stops early when a stage completes', () => {
    const s0 = playing(); s0.money = 159_999; s0.completedOrders = 49; s0.rating = 4;
    const { state, summary } = fastForward(s0, 3000, makeRng(7));
    expect(state.stageComplete).toBe(true);
    expect(summary.stageCompleted).toBe(true);
    expect(summary.ticks).toBeLessThan(3000);
  });
  it('reports events started/ended', () => {
    const s0 = playing(); s0.clock = { minute: 0, day: 13, month: 2, year: 1 }; // Valentine 14–15/2
    const { summary } = fastForward(s0, 360 * 3, makeRng(1)); // 3 ngày
    expect(summary.eventsStarted).toContain('valentine');
    expect(summary.eventsEnded).toContain('valentine');
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement `fastForward.ts`**

```ts
// packages/sim/src/fastForward.ts
// Tua bù thời gian offline (spec A3: tối đa 8 giờ thực) bằng cách chạy tick thật.
import type { Cents, GameState, Rng } from './types.js';
import { tick } from './tick.js';
import { activeEvents } from './env.js';

export const MAX_OFFLINE_TICKS = 8 * 60 * 60; // 8 giờ thực × 1 tick/giây

export interface OfflineSummary {
  ticks: number; ordersDelivered: number; ordersCancelled: number; ordersReturned: number;
  netRevenue: Cents; daysSettled: number; feesPaid: Cents;
  eventsStarted: string[]; eventsEnded: string[]; lowStock: string[]; stageCompleted: boolean;
}

const partialRevenue = (s: GameState): Cents =>
  Object.values(s.dayRevenue).reduce((a, b) => a + b, 0) - s.dayCommission;

export function fastForward(s: GameState, ticks: number, rng: Rng): { state: GameState; summary: OfflineSummary } {
  const n = Math.max(0, Math.min(MAX_OFFLINE_TICKS, Math.floor(ticks)));
  const seen = new Set<string>(activeEvents(s.clock.month, s.clock.day).map((e: any) => e.id));
  const started = new Set<string>(), ended = new Set<string>();
  let state = s, applied = 0;
  for (; applied < n; applied++) {
    state = tick(state, 4, rng);
    const now = new Set<string>(activeEvents(state.clock.month, state.clock.day).map((e: any) => e.id));
    for (const id of now) if (!seen.has(id)) { started.add(id); seen.add(id); }
    for (const id of [...seen]) if (!now.has(id)) { ended.add(id); seen.delete(id); }
    if (state.stageComplete && !s.stageComplete) { applied++; break; }
  }
  const newReports = state.reports.slice(s.reports.length);
  const feesPaid = newReports.reduce((a, r) => a + r.rent + r.maintenance + r.channelFees, 0);
  const reportRevenue = newReports.reduce((a, r) => a + Object.values(r.revenueByChannel).reduce((x, y) => x + y, 0) - r.commission, 0);
  const netRevenue = newReports.length > 0
    ? reportRevenue + partialRevenue(state)
    : partialRevenue(state) - partialRevenue(s);
  return {
    state,
    summary: {
      ticks: applied,
      ordersDelivered: state.completedOrders - s.completedOrders,
      ordersCancelled: state.cancelledOrders - s.cancelledOrders,
      ordersReturned: state.returnedOrders - s.returnedOrders,
      netRevenue, daysSettled: newReports.length, feesPaid,
      eventsStarted: [...started], eventsEnded: [...ended],
      lowStock: Object.entries(state.inventory).filter(([, n]) => n < 10).map(([id]) => id),
      stageCompleted: state.stageComplete && !s.stageComplete,
    },
  };
}
```

`netRevenue` when a settle happened: revenue in the new reports plus the current partial day (the pre-existing partial day was folded into the first new report, so it is not subtracted). Add `export * from './fastForward.js';` to `index.ts`.

- [ ] **Step 4: Run tests** — green. The "stage completes" test: with $1,599.99, 49 orders, rating 4 and 40 phone cases on a shelf, the first delivery crosses both thresholds within a few ticks. **Step 5: Commit** `feat(sim): fastForward with offline summary`.

### Task 10: Balance harness for stages 2 and 3

**Files:**
- Modify: `packages/sim/test/harness.test.ts`

**Interfaces:**
- Consumes: everything above. Produces nothing; gates `pnpm test`.

- [ ] **Step 1: Extend the bot**

Keep `botAct` for stage 1. Add `botAct2` (stage ≥ 2) that, in priority order, returns the first applicable action (each check uses `s.money` after a `reserve` of 30000 cents):

```ts
import { openChannel, upgradeChannel, chooseIndustry, buySeo, buyUpgrade, placeEquipment, buyRetail, buyBundle, advanceStage } from '../src/actions.js';
import { industries as IND, calendar as CAL } from '@shopflow/data';

const RESERVE = 30000;
function botAct2(s: GameState): GameState {
  const has = (id: string) => s.channels.some((c) => c.id === id);
  const spare = s.money - RESERVE;
  // 1. Ngành mới khi được phép (ngành thứ 2 = fashion, thứ 3 = home).
  if (s.industries.length < s.stage) {
    const next = (IND.industries as any[]).find((i) => i.unlock === 'start-option' && !s.industries.includes(i.id));
    if (next) return chooseIndustry(s, next.id);
  }
  // 2. Kênh: MegaMall (màn 2), SocialShop (màn 3).
  if (s.stage >= 2 && !has('mall') && s.rating >= 3.5 && spare >= 20000) return openChannel(s, 'mall');
  if (s.stage >= 3 && !has('social') && spare >= 15000) return openChannel(s, 'social');
  // 3. Kho: mở 4×4, thêm kệ/bàn/robot theo tỉ lệ.
  const cells = s.grid.cells, empty = cells.findIndex((c) => c === null);
  const count = (t: string) => cells.filter((c) => c?.type === t).length;
  if (s.stage >= 2 && s.grid.size === 3 && spare >= 40000) return (s as any).grid.size === 3 ? require('../src/actions.js').expandGrid(s) : s;
  if (empty >= 0 && count('shelf') < 3 && spare >= 4000) return placeEquipment(s, empty, 'shelf');
  if (empty >= 0 && count('packer') < 3 && spare >= 8000) return placeEquipment(s, empty, 'packer');
  if (empty >= 0 && s.stage >= 2 && count('robot') < 2 && spare >= 12000) return placeEquipment(s, empty, 'robot');
  // 4. SEO cấp 1–2 cho mọi ngành (cấp 3 ở màn 3 khi dư tiền).
  for (const id of s.industries) {
    const seo = s.seo[id] ?? 40;
    if (seo < 70 && spare >= 40000) return buySeo(s, id);
    if (s.stage >= 3 && seo < 85 && spare >= 200000) return buySeo(s, id);
  }
  // 5. Nâng cấp vĩnh viễn (màn 3): wholesale rồi routing.
  if (s.stage >= 3 && !s.upgrades.includes('wholesale') && spare >= 100000) return buyUpgrade(s, 'wholesale');
  if (s.stage >= 3 && !s.upgrades.includes('routing') && spare >= 16000) return buyUpgrade(s, 'routing');
  // 6. Hàng: mỗi ngành giữ ≥ 40 món trên đường + trên kệ; gói mùa nếu đang mở.
  for (const id of s.industries) {
    const ind = (IND.industries as any[]).find((i) => i.id === id);
    const onHand = ind.products.reduce((a: number, p: any) => a + (s.inventory[p.id] ?? 0), 0);
    const inbound = s.deliveries.filter((d) => ind.products.some((p: any) => p.id in d.items))
      .reduce((a, d) => a + d.itemsTotal - Math.floor(d.itemsChecked), 0);
    if (onHand + inbound >= 40) continue;
    const supplierId = s.stage >= 3 ? 'overseas' : s.stage >= 2 ? 'regional' : 'local';
    const bundles = ind.bundles.filter((b: any) => b.unlockStage <= s.stage).sort((a: any, b: any) => b.cost - a.cost);
    const now = s.clock.month * 100 + s.clock.day;
    const seasonal = (CAL.seasonalBundles as any[]).find((sb) => {
      const [[fm, fd], [tm, td]] = sb.window;
      return now >= fm * 100 + fd && now <= tm * 100 + td && (sb.industries === 'all' || sb.industries.includes(id)) && (s.seasonalBought[sb.id] ?? 0) < sb.limit;
    });
    for (const b of bundles) {
      const opts = { carrierId: 'standard', supplierId, grade: 'B' as const, seasonalId: seasonal?.id };
      const r = buyBundle(s, id, b.id, opts);
      if (!r.lastReject) return r;
      const r2 = buyBundle(s, id, b.id, { ...opts, seasonalId: undefined });
      if (!r2.lastReject) return r2;
    }
    const cheap = ind.products[0];
    const r3 = buyRetail(s, cheap.id, supplierId === 'local' ? 10 : 20, { carrierId: 'standard', supplierId });
    if (!r3.lastReject) return r3;
  }
  return s;
}
```

Replace the odd `require` line in step 3 with a plain import of `expandGrid` and `if (s.stage >= 2 && s.grid.size === 3 && spare >= 40000) return expandGrid(s);`.

- [ ] **Step 2: Add the stage 2 and 3 tests**

```ts
function runStage(s: GameState, rng: Rng, bot: (s: GameState) => GameState, maxTicks: number): { s: GameState; ticks: number } {
  let ticks = 0;
  while (!s.stageComplete && ticks < maxTicks) {
    if (ticks % 5 === 0) s = bot(s);
    s = tick(s, 4, rng);
    ticks++;
  }
  return { s, ticks };
}

describe('balance harness — màn 2 & 3', () => {
  const S2 = { min: 1200, max: 2400 }; // 20–40 phút thực (spec M2a 1.9, proposal)
  const S3 = { min: 1800, max: 3600 }; // 30–60 phút
  it('màn 2 xong trong 20–40 phút, màn 3 trong 30–60 phút, không kênh nào bị ngưng vì thiếu phí', () => {
    const rng = makeRng(20260917);
    let s = createGame(20260917, 'electronics');
    ({ s } = runStage(s, rng, botAct, 1501));
    expect(s.stageComplete).toBe(true);
    s = advanceStage(s);
    let r = runStage(s, rng, botAct2, S2.max + 1);
    expect(r.s.stageComplete, `màn 2 không xong (money=${r.s.money}, orders=${r.s.completedOrders}, rating=${r.s.rating})`).toBe(true);
    expect(r.ticks).toBeGreaterThanOrEqual(S2.min);
    s = advanceStage(r.s);
    r = runStage(s, rng, botAct2, S3.max + 1);
    expect(r.s.stageComplete, `màn 3 không xong (money=${r.s.money}, orders=${r.s.completedOrders}, rating=${r.s.rating})`).toBe(true);
    expect(r.ticks).toBeGreaterThanOrEqual(S3.min);
    const suspendedEver = r.s.reports.some((rep) => rep.channelFees === 0 && r.s.channels.some((c) => c.id === 'mall'));
    expect(suspendedEver, 'kênh bị ngưng vì thiếu phí').toBe(false);
  });
});
```

Tighten the "suspended ever" check by tracking it inside `runStage`: after each tick, `if (s.channels.some((c) => c.suspended)) suspended = true;` and return it; assert `false`. Replace the report-based heuristic with that flag.

- [ ] **Step 3: Run and tune**

Run: `pnpm --filter @shopflow/sim exec vitest run test/harness.test.ts`. If a stage overshoots its window, adjust the bot first (buy more stock, open channels earlier), not the data. If the window itself is wrong (e.g. stage 3 finishes in 25 minutes with a sensible bot), change `S2`/`S3` constants and record the new numbers in the spec section 1.9 in the same commit. Do not touch stage-1 assertions.

- [ ] **Step 4: Run everything, commit**

`pnpm test` and `pnpm typecheck` → green.

```bash
git add -A
git commit -m "test(sim): balance harness for stages 2 and 3

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

# Phase 2 — Web app (`apps/web`)

### Task 11: Save v2, worker speed + offline resume, store visibility handling

**Files:**
- Modify: `apps/web/src/save.ts`, `apps/web/src/save.test.ts`, `apps/web/src/worker/simWorker.ts`, `apps/web/src/store.ts`

**Interfaces:**
- Produces:
  - `SAVE_VERSION = 2`; `SaveBlob { seed; version; savedAt?: number; state }`; `validateSave(raw): { seed; state; savedAt: number | null } | null`.
  - Worker messages in: `init { save, elapsedMs }`, `start { seed, industryId }`, `setPaused { paused }`, `setSpeed { speed: 1|2 }`, `resume { elapsedMs }`, `action { name, args }`. Out: `state { state, offline?: OfflineSummary }`, `nosave`.
  - Store fields: `speed: 1|2`, `setSpeed(n)`, `offlineSummary: OfflineSummary | null`, `dismissOffline()`, `userPaused: boolean` (the `paused` flag the user set), `supplierId`, `grade`, `setSupplier`, `setGrade`, `newGame()`, `visited: Set<Tab>` + `markVisited(tab)`.
  - New worker ACTIONS entries: `buyUpgrade`, `tutorialAdvance`, `tutorialSkip`, `tutorialClaim`, `tutorialReset`.

- [ ] **Step 1: Update `save.test.ts` (failing first)**

Change `goodState` to `{ money: 100000, packAccum: 0, orders: [], tutorial: { step: 0, done: false, rewarded: false }, questsDone: [] }` and add:

```ts
  it('v2: thiếu tutorial hoặc questsDone → null', () => {
    const { tutorial, ...noTut } = goodState;
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, state: noTut }))).toBeNull();
    const { questsDone, ...noQ } = goodState;
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, state: noQ }))).toBeNull();
  });
  it('savedAt được trả về (null nếu thiếu / không phải số)', () => {
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, state: goodState }))!.savedAt).toBeNull();
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, savedAt: 1700000000000, state: goodState }))!.savedAt).toBe(1700000000000);
    expect(validateSave(blob({ seed: 42, version: SAVE_VERSION, savedAt: 'x', state: goodState }))!.savedAt).toBeNull();
  });
```

Run: `pnpm --filter @shopflow/web test` → the new tests FAIL.

- [ ] **Step 2: `save.ts`**

```ts
export const SAVE_VERSION = 2;

export interface SaveBlob { seed: number; version: number; savedAt?: number; state: any }

export function validateSave(raw: string | null): { seed: number; state: any; savedAt: number | null } | null {
  if (!raw) return null;
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.version !== SAVE_VERSION) return null;
  if (typeof parsed.seed !== 'number' || !Number.isFinite(parsed.seed)) return null;
  const state = parsed.state;
  if (!state || typeof state !== 'object') return null;
  if (typeof state.money !== 'number') return null;
  if (typeof state.packAccum !== 'number') return null;
  if (!Array.isArray(state.orders)) return null;
  if (!state.tutorial || typeof state.tutorial.step !== 'number') return null;
  if (!Array.isArray(state.questsDone)) return null;
  const savedAt = typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt) ? parsed.savedAt : null;
  return { seed: parsed.seed, state, savedAt };
}
```

- [ ] **Step 3: Worker**

```ts
// apps/web/src/worker/simWorker.ts
import { createGame, tick, makeRng, fastForward, type GameState, type Rng, type PurchaseOpts } from '@shopflow/sim';
import * as A from '@shopflow/sim';
import { validateSave } from '../save';

const OFFLINE_NOTICE_MS = 60_000; // dưới 1 phút: tua âm thầm, không hiện "Chào mừng trở lại"

let state: GameState | null = null;
let rng: Rng | null = null;
let paused = false;
let speed: 1 | 2 = 1;
let timer: ReturnType<typeof setInterval> | null = null;

const post = (extra: Record<string, unknown> = {}) => state && (self as any).postMessage({ type: 'state', state, ...extra });

function startLoop() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (paused || !state || !rng) return;
    for (let i = 0; i < speed; i++) state = tick(state, 4, rng);
    post();
  }, 1000);
}

/** Tua bù thời gian vắng mặt; ≥ 1 phút thì kèm tóm tắt và tự tạm dừng chờ người chơi bấm Nhận. */
function resume(elapsedMs: number) {
  if (!state || !rng) return;
  const ticks = Math.floor(Math.max(0, elapsedMs) / 1000);
  if (ticks <= 0) { post(); return; }
  const r = fastForward(state, ticks, rng);
  state = r.state;
  if (elapsedMs >= OFFLINE_NOTICE_MS) { paused = true; post({ offline: r.summary }); }
  else post();
}

const ACTIONS: Record<string, (...a: any[]) => GameState> = {
  buyRetail: (...a) => A.buyRetail(state!, ...(a as [string, number, PurchaseOpts])),
  buyBundle: (...a) => A.buyBundle(state!, ...(a as [string, string, PurchaseOpts])),
  placeEquipment: (...a) => A.placeEquipment(state!, ...(a as [number, 'shelf' | 'packer' | 'robot'])),
  upgradeEquipment: (...a) => A.upgradeEquipment(state!, ...(a as [number])),
  removeEquipment: (...a) => A.removeEquipment(state!, ...(a as [number])),
  expandGrid: () => A.expandGrid(state!),
  openChannel: (...a) => A.openChannel(state!, ...(a as [string])),
  upgradeChannel: (...a) => A.upgradeChannel(state!, ...(a as [string])),
  setChannelOpen: (...a) => A.setChannelOpen(state!, ...(a as [string, boolean])),
  buySeo: (...a) => A.buySeo(state!, ...(a as [string])),
  buyUpgrade: (...a) => A.buyUpgrade(state!, ...(a as [string])),
  chooseIndustry: (...a) => A.chooseIndustry(state!, ...(a as [string])),
  advanceStage: () => A.advanceStage(state!),
  expediteDelivery: (...a) => A.expediteDelivery(state!, ...(a as [string])),
  tutorialAdvance: () => A.tutorialAdvance(state!),
  tutorialSkip: () => A.tutorialSkip(state!),
  tutorialClaim: () => A.tutorialClaim(state!),
  tutorialReset: () => A.tutorialReset(state!),
};

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    const valid = validateSave(msg.save ?? null);
    if (valid) {
      state = valid.state;
      rng = makeRng(valid.seed + (valid.state.completedOrders ?? 0));
      startLoop();
      resume(msg.elapsedMs ?? 0);
      return;
    }
    if (msg.save) console.warn('[simWorker] save không hợp lệ (hỏng hoặc sai version) → chơi mới');
    (self as any).postMessage({ type: 'nosave' });
    return;
  }
  if (msg.type === 'start') { state = createGame(msg.seed, msg.industryId); rng = makeRng(msg.seed); startLoop(); post(); }
  if (msg.type === 'setPaused') paused = msg.paused;
  if (msg.type === 'setSpeed') speed = msg.speed === 2 ? 2 : 1;
  if (msg.type === 'resume') resume(msg.elapsedMs ?? 0);
  if (msg.type === 'action') {
    if (!ACTIONS[msg.name]) { console.warn('[simWorker] action không tồn tại:', msg.name); return; }
    if (!state) return;
    state = ACTIONS[msg.name](...(msg.args ?? []));
    post();
  }
};
```

- [ ] **Step 4: Store**

```ts
// apps/web/src/store.ts
import { create } from 'zustand';
import type { GameState, OfflineSummary } from '@shopflow/sim';
import { SAVE_VERSION, validateSave } from './save';
import type { Tab } from './components/TabBar';

const SAVE_KEY = 'shopflow-save';

interface GameStore {
  game: GameState | null;
  paused: boolean;        // trạng thái worker thực tế (người chơi bấm, hoặc tự dừng khi ẩn tab / chờ Nhận)
  userPaused: boolean;    // người chơi tự bấm ⏸ — không tự chạy lại khi quay về tab
  speed: 1 | 2;
  booted: boolean;
  hasSave: boolean;
  seed: number;
  offlineSummary: OfflineSummary | null;
  supplierId: string; grade: 'A' | 'B' | 'C';
  visited: Tab[];
  dispatch: (name: string, ...args: unknown[]) => void;
  start: (industryId: string) => void;
  setPaused: (p: boolean) => void;
  setSpeed: (n: 1 | 2) => void;
  dismissOffline: () => void;
  setSupplier: (id: string) => void; setGrade: (g: 'A' | 'B' | 'C') => void;
  markVisited: (t: Tab) => void;
  newGame: () => void;
}

export const useGame = create<GameStore>((set, get) => {
  const w = new Worker(new URL('./worker/simWorker.ts', import.meta.url), { type: 'module' });
  const savedRaw = localStorage.getItem(SAVE_KEY);
  const saved = validateSave(savedRaw);
  // UI shell code: performance.now() only seeds the UI; the sim only ever sees the numeric seed.
  const seed = saved?.seed ?? (Math.floor(performance.now() * 1000) % 2 ** 31 || 1);
  const elapsedMs = saved?.savedAt ? Math.max(0, Date.now() - saved.savedAt) : 0;

  w.onmessage = (ev) => {
    if (ev.data.type === 'state') {
      const offline: OfflineSummary | undefined = ev.data.offline;
      set({ game: ev.data.state, booted: true, hasSave: true,
        ...(offline ? { offlineSummary: offline, paused: true } : {}) });
    }
    if (ev.data.type === 'nosave') set({ booted: true, hasSave: false });
  };
  w.postMessage({ type: 'init', save: savedRaw, elapsedMs });

  const save = () => {
    const g = get().game;
    if (g) localStorage.setItem(SAVE_KEY, JSON.stringify({ seed: get().seed, version: SAVE_VERSION, savedAt: Date.now(), state: g }));
  };
  setInterval(save, 60_000);

  const pauseWorker = (paused: boolean) => { set({ paused }); w.postMessage({ type: 'setPaused', paused }); };
  let hiddenAt: number | null = null;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { save(); hiddenAt = Date.now(); pauseWorker(true); return; }
    const elapsed = hiddenAt ? Date.now() - hiddenAt : 0; hiddenAt = null;
    if (!get().game) return;
    w.postMessage({ type: 'resume', elapsedMs: elapsed });
    // Dưới 1 phút worker không gửi tóm tắt → tự chạy lại nếu người chơi không tự dừng.
    if (elapsed < 60_000 && !get().userPaused) pauseWorker(false);
  });
  window.addEventListener('pagehide', save);

  return {
    game: null, paused: false, userPaused: false, speed: 1, booted: false, hasSave: saved !== null, seed,
    offlineSummary: null, supplierId: 'local', grade: 'B', visited: [],
    dispatch: (name, ...args) => w.postMessage({ type: 'action', name, args }),
    start: (industryId) => w.postMessage({ type: 'start', seed: get().seed, industryId }),
    setPaused: (paused) => { set({ userPaused: paused }); pauseWorker(paused); },
    setSpeed: (speed) => { set({ speed }); w.postMessage({ type: 'setSpeed', speed }); },
    dismissOffline: () => { set({ offlineSummary: null }); if (!get().userPaused) pauseWorker(false); },
    setSupplier: (supplierId) => set({ supplierId }),
    setGrade: (grade) => set({ grade }),
    markVisited: (t) => { if (!get().visited.includes(t)) set({ visited: [...get().visited, t] }); },
    newGame: () => { localStorage.removeItem(SAVE_KEY); w.terminate(); location.reload(); },
  };
});
```

Existing callers of `setPaused` (Hud, DayReportModal, StageComplete) keep working: the day-report modal pausing the game is a *user-visible* pause and should not be sticky, so in `DayReportModal` change its two calls to use a new store method `setModalPaused(p)` = `pauseWorker(p)` without touching `userPaused`. Add `setModalPaused: (p: boolean) => void` to the interface and `setModalPaused: pauseWorker` to the returned object.

- [ ] **Step 5: Run tests and typecheck** — `pnpm test`, `pnpm typecheck` → green (`Tab` import from `TabBar` is type-only; no cycle at runtime).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): save v2 with savedAt, worker speed + offline resume, pause on hide

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 12: HUD — speed control, goal strip, quest sheet

**Files:**
- Modify: `apps/web/src/components/Hud.tsx`
- Create: `apps/web/src/components/GoalStrip.tsx`, `apps/web/src/components/QuestSheet.tsx`
- Create: `apps/web/src/goals.ts` + `apps/web/src/goals.test.ts`

**Interfaces:**
- Produces: `goalProgress(game): { money: {cur, target, pct}; orders: {...}; rating: {...} } | null` (null when the stage has no goal); `questProgress(game): { done: number; total: number; list: { id; bonus; done }[] }`; `QUEST_LABEL: Record<string, string>`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/goals.test.ts
import { describe, it, expect } from 'vitest';
import { goalProgress, questProgress, QUEST_LABEL } from './goals';
import { stages as ST } from '@shopflow/data';

const g = (over: any = {}) => ({ stage: 1, money: 80000, completedOrders: 25, rating: 4.2, questsDone: [], ...over }) as any;

describe('goalProgress', () => {
  it('pct clamps to 100 and uses the current stage goal', () => {
    const p = goalProgress(g())!;
    expect(p.money.target).toBe(ST.stages[0].goal.money);
    expect(p.money.pct).toBe(50);
    expect(p.orders.pct).toBe(50);
    expect(p.rating.pct).toBe(100);
  });
  it('null when stage has no goal', () => { expect(goalProgress(g({ stage: 6 }))).toBeNull(); });
});
describe('questProgress', () => {
  it('counts done quests of the current stage and labels every id', () => {
    const q = questProgress(g({ stage: 2, questsDone: ['open_mall'] }));
    expect(q.total).toBe(4); expect(q.done).toBe(1);
    expect(q.list.find((x) => x.id === 'open_mall')!.done).toBe(true);
    for (const x of q.list) expect(QUEST_LABEL[x.id]).toBeTruthy();
    expect(questProgress(g({ stage: 3 })).list.every((x) => QUEST_LABEL[x.id])).toBe(true);
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: `goals.ts`**

```ts
// apps/web/src/goals.ts — hàm thuần cho dải mục tiêu + nhiệm vụ (test được không cần store).
import { stages as ST } from '@shopflow/data';
import { questsForStage, type GameState } from '@shopflow/sim';

const pct = (cur: number, target: number) => Math.max(0, Math.min(100, Math.round((cur / target) * 100)));

export function goalProgress(game: Pick<GameState, 'stage' | 'money' | 'completedOrders' | 'rating'>) {
  const goal = (ST.stages as any[])[game.stage - 1]?.goal;
  if (!goal) return null;
  return {
    money: { cur: game.money, target: goal.money, pct: pct(game.money, goal.money) },
    orders: { cur: game.completedOrders, target: goal.orders, pct: pct(game.completedOrders, goal.orders) },
    rating: { cur: game.rating, target: goal.rating, pct: pct(game.rating, goal.rating) },
  };
}

export const QUEST_LABEL: Record<string, string> = {
  open_mall: 'Mở kênh MegaMall',
  buy_seasonal: 'Mua một gói mùa',
  place_robot: 'Đặt robot trong kho',
  run_seo: 'Chạy chiến dịch SEO',
  relationship_3: 'Quan hệ nhà cung cấp cấp 3',
  survive_recession: 'Sống sót một kỳ Suy thoái',
  profit_5_days: 'Lãi ròng dương 5 ngày liên tiếp',
};

export function questProgress(game: Pick<GameState, 'stage' | 'questsDone'>) {
  const list = questsForStage(game.stage).map((q) => ({ ...q, done: game.questsDone.includes(q.id) }));
  return { total: list.length, done: list.filter((q) => q.done).length, list };
}
```

- [ ] **Step 4: `GoalStrip.tsx`**

```tsx
import { useState } from 'react';
import { useGame } from '../store';
import { usd } from '../format';
import { goalProgress, questProgress } from '../goals';
import QuestSheet from './QuestSheet';

export default function GoalStrip() {
  const game = useGame((s) => s.game);
  const [open, setOpen] = useState(false);
  if (!game) return null;
  const p = goalProgress(game);
  const q = questProgress(game);
  if (!p) return null;
  return (
    <div className="mx-auto flex max-w-md items-center gap-2 px-4 pb-2 text-[11px]">
      <Bar label="💵" text={`${usd(p.money.cur)} / ${usd(p.money.target)}`} pct={p.money.pct} />
      <Bar label="📦" text={`${p.orders.cur} / ${p.orders.target}`} pct={p.orders.pct} />
      <Bar label="⭐" text={`${p.rating.cur.toFixed(1)} / ${p.rating.target}`} pct={p.rating.pct} />
      {q.total > 0 && (
        <button onClick={() => setOpen(true)} aria-label="Nhiệm vụ màn"
          className="shrink-0 rounded-full bg-amber-100 px-2 py-1 font-bold text-amber-800">
          🎯 {q.done}/{q.total}
        </button>
      )}
      {open && <QuestSheet onClose={() => setOpen(false)} />}
    </div>
  );
}

function Bar({ label, text, pct }: { label: string; text: string; pct: number }) {
  return (
    <div className="min-w-0 flex-1" title={`Mục tiêu màn: ${text}`}>
      <div className="flex justify-between gap-1 text-slate-500"><span>{label}</span><span className="truncate">{text}</span></div>
      <div className="mt-0.5 h-1.5 rounded-full bg-slate-200">
        <div className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-emerald-600' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `QuestSheet.tsx`**

```tsx
import { useGame } from '../store';
import { usd } from '../format';
import { questProgress, QUEST_LABEL } from '../goals';

export default function QuestSheet({ onClose }: { onClose: () => void }) {
  const game = useGame((s) => s.game);
  if (!game) return null;
  const q = questProgress(game);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50" onClick={onClose}
      role="dialog" aria-modal="true" aria-label="Nhiệm vụ màn">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Nhiệm vụ màn {game.stage}</h2>
          <span className="text-sm text-slate-500">{q.done}/{q.total}</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">Không bắt buộc để qua màn — mỗi nhiệm vụ thưởng tiền một lần.</p>
        <ul className="mt-3 space-y-2">
          {q.list.map((x) => (
            <li key={x.id} className={`flex items-center justify-between rounded-xl p-3 ${x.done ? 'bg-emerald-50' : 'bg-slate-50'}`}>
              <span className={x.done ? 'font-bold text-emerald-700' : 'text-slate-700'}>{x.done ? '✓ ' : '○ '}{QUEST_LABEL[x.id] ?? x.id}</span>
              <span className="text-sm font-bold text-amber-700">+{usd(x.bonus)}</span>
            </li>
          ))}
        </ul>
        <button onClick={onClose} className="mt-4 w-full rounded-xl bg-slate-900 p-3 font-bold text-white">Đóng</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: HUD speed cluster + strip**

In `Hud.tsx` replace the single pause button with:

```tsx
  const speed = useGame((s) => s.speed);
  const setSpeed = useGame((s) => s.setSpeed);
  const speedUnlocked = game.stage >= 3; // stages.json: 'speed-2x' trong unlocks màn 3
  // ...
        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 text-sm">
          <SpeedBtn active={paused} onClick={() => setPaused(true)} label="⏸" aria="Tạm dừng" />
          <SpeedBtn active={!paused && speed === 1} onClick={() => { setSpeed(1); setPaused(false); }} label="1x" aria="Chạy 1x" />
          <SpeedBtn active={!paused && speed === 2} disabled={!speedUnlocked} onClick={() => { setSpeed(2); setPaused(false); }}
            label={speedUnlocked ? '2x' : '🔒2x'} aria={speedUnlocked ? 'Chạy 2x' : 'Tua nhanh mở ở màn 3'} />
        </div>
```

with

```tsx
function SpeedBtn({ active, disabled, onClick, label, aria }: { active: boolean; disabled?: boolean; onClick: () => void; label: string; aria: string }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={aria} aria-pressed={active}
      className={`rounded-md px-2 py-1 font-bold ${active ? 'bg-white text-emerald-700 shadow' : 'text-slate-500'} disabled:text-slate-300`}>
      {label}
    </button>
  );
}
```

and render `<GoalStrip />` as the last child of the `<header>`.

- [ ] **Step 7: Verify in the browser**

`pnpm test` + `pnpm typecheck` green. Start the `web` launch config; confirm the strip shows three bars and the 2x button is locked at stage 1. Temporarily set `stage` to 3 via a save edit if you want to see 2x enabled; do not commit test saves.

- [ ] **Step 8: Commit** `feat(web): HUD speed control, stage goal strip, quest sheet`.

### Task 13: Nhập — live supplier/grade picker, quotes, relationship panel, inbound risk tags

**Files:**
- Create: `apps/web/src/components/SupplierPicker.tsx`
- Modify: `apps/web/src/screens/RestockRetail.tsx`, `apps/web/src/screens/RestockBundles.tsx`, `apps/web/src/screens/RestockInbound.tsx`

**Interfaces:**
- Consumes: store `supplierId`, `grade`, `setSupplier`, `setGrade`; sim `quoteRetail`, `quoteBundle`, `supplierUnlocked`, `gradeAllowed`, `relationshipXp`, `relationshipDiscount`, `gradeCostMult`.
- Produces: `<SupplierPicker />` (self-contained; reads/writes the store).

- [ ] **Step 1: `SupplierPicker.tsx`**

```tsx
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
  const rel = relationshipXp(game, supplierId);
  const levels = SUP.relationship.levels as any[];
  const perks = [levels[rel.level]?.exclusiveBundle && 'hạng A giá hạng B', levels[rel.level]?.daysDelta && 'giao sớm 1 ngày'].filter(Boolean);
  const pctToNext = rel.nextXp === null ? 100 : Math.round(((rel.xp - levels[rel.level].xp) / (rel.nextXp - levels[rel.level].xp)) * 100);

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Nguồn hàng</h2>
      <div className="grid grid-cols-3 gap-2">
        {(SUP.tiers as any[]).map((t) => {
          const locked = !supplierUnlocked(game, t.id);
          const active = t.id === supplierId;
          return (
            <button key={t.id} disabled={locked} onClick={() => { setSupplier(t.id); if (!gradeAllowed({ ...game }, t.id, grade)) setGrade('B'); }}
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
        <div className="flex items-baseline justify-between">
          <span className="font-bold">Quan hệ · cấp {rel.level + 1}</span>
          <span className="text-emerald-700">giảm {Math.round(relationshipDiscount(game, supplierId) * 100)}%</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-slate-200"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${pctToNext}%` }} /></div>
        <div className="mt-1 text-slate-500">
          {rel.nextXp === null ? 'Cấp tối đa' : `${rel.xp}/${rel.nextXp} XP · $100 chi = 1 XP`}
          {perks.length > 0 && ` · ${perks.join(' · ')}`}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Hạng · % trả</h2>
        <div className="ml-auto flex gap-1">
          {GRADES.map((g) => {
            const allowed = gradeAllowed(game, supplierId, g);
            const active = g === grade;
            const perk = g === 'A' && gradeCostMult(game, supplierId, 'A') === SUP.grades.B.costMult;
            return (
              <button key={g} disabled={!allowed} onClick={() => setGrade(g)} aria-pressed={active}
                className={`rounded-full px-3 py-1 text-xs ${active ? 'bg-slate-900 font-bold text-white' : allowed ? 'bg-slate-100 text-slate-600' : 'bg-slate-100 text-slate-300'}`}>
                {g} · {Math.round(SUP.grades[g].returnRate * 100)}%{perk ? ' ★' : ''}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `RestockRetail.tsx`**

- Remove the inline "Nguồn hàng" grid and the grade chip row; render `<SupplierPicker />` at the top instead.
- Read `supplierId`, `grade` from the store. Replace `retailUnitPrice(game, pid)` and the goods/ship/days math with `quoteRetail(game, pid, q, { carrierId, supplierId, grade })`:

```tsx
  const supplierId = useGame((s) => s.supplierId);
  const grade = useGame((s) => s.grade);
  const quote = (pid: string, q: number) => quoteRetail(game, pid, Math.max(1, q), { carrierId, supplierId, grade });
  const moq = quote(ind.products[0].id, 1).moq;
  const lines = Object.entries(qty).filter(([, q]) => q > 0);
  const goods = lines.reduce((a, [pid, q]) => a + quote(pid, q).goods, 0);
  const ship = lines.length ? quote(lines[0][0], 1).ship * lines.length : 0;
  const days = quote(ind.products[0].id, 1).days;
  const sameDay = days === 0;
```

- Stepper: `STEP` becomes `moq` (so every quantity is ≥ MOQ and a multiple of it); `bump` clamps to `[0, MAX]` in steps of `moq`.
- Product row shows `Nhập <b>{usdCents(quote(p.id, 1).unit)}</b>`.
- Order bar text: `{units} món (hạng {grade}) {usdCents(goods)} + ship {usdCents(ship)}`; button label `Đặt hàng · {sameDay ? 'giao hôm nay' : `về sau ${days} ngày`}`.
- `order()` dispatches `dispatch('buyRetail', pid, q, { carrierId, supplierId, grade })`.
- Reset `qty` when `supplierId` changes (MOQ may change): `useEffect(() => setQty({}), [industryId, supplierId]);`.

- [ ] **Step 3: `RestockBundles.tsx`**

- Render `<SupplierPicker />` above the industry/carrier selects.
- Replace `cost`/`days` math per bundle with `const q = quoteBundle(game, ind.id, b.id, { carrierId, supplierId, grade }); const cost = q.goods + q.ship; const days = q.days;` and show `usdCents(q.goods)` + `ship {usdCents(q.ship)}`.
- Seasonal card: `full = quoteBundle(..., {carrierId, supplierId, grade}).goods + ship`, `sale = quoteBundle(..., {…, seasonalId: seasonal.id}).goods + ship`. Pass `full`/`sale` in instead of `env`/`fee`.
- Dispatches: `dispatch('buyBundle', ind.id, b.id, { carrierId, supplierId, grade })` and `{ carrierId, supplierId, grade, seasonalId: seasonal.id }`.
- Remove the now-unused `wholesaleEnvMult` import (keep `activeEvents` for the event note).

- [ ] **Step 4: `RestockInbound.tsx`**

Show supplier and risk on shipping cards:

```tsx
const SUPPLIER_NAME = (id: string) => (SUP.tiers as any[]).find((t) => t.id === id)?.name ?? id;
const RISK_TAG: Record<string, string> = { delay: '⏳ Trễ +1 ngày', customs: '🛃 Hải quan +2 ngày', loss: '📉 Mất 10% lô' };
// in the shipping card, under the carrier line:
            <div className="text-xs text-slate-500">
              {SUPPLIER_NAME(d.supplierId)} · {carrierName(d.carrierId)} · hạng {d.grade} · {usdCents(d.cost)}
            </div>
            {d.risk && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">{RISK_TAG[d.risk]}</span>}
```

Also apply the same supplier line to auditing cards.

- [ ] **Step 5: Verify**

`pnpm typecheck` + `pnpm test` green. In the browser at stage 1: only Nội địa and B are enabled, prices unchanged ($2.40 ốp lưng). Edit the save's `stage` to 3 temporarily to confirm overseas + C shows −35% and MOQ 20, then restore.

- [ ] **Step 6: Commit** `feat(web): live supplier and grade selection with quotes and relationship panel`.

### Task 14: Bán + Quảng bá — SocialShop note, return toast, market-cycle card, SEO decay warning

**Files:**
- Modify: `apps/web/src/screens/SalesChannels.tsx`, `apps/web/src/screens/SalesOrders.tsx`, `apps/web/src/screens/Promo.tsx`, `packages/sim/src/env.ts` (remove `hourMult` alias), `packages/sim/test/env.test.ts`
- Create: `apps/web/src/components/EventToasts.tsx`; modify `apps/web/src/App.tsx` to render it.

**Interfaces:**
- Consumes: `nightMult`, `modifiers`, `calendar.marketCycle`, `returnedOrders`, `questsDone`.
- Produces: `<EventToasts />` — one component watching counter deltas and showing stacked toasts: return (`Hoàn trả · −$X`), quest complete (`✓ Nhiệm vụ: … +$X`).

- [ ] **Step 1: Estimates use per-channel peak**

In `SalesChannels.tsx` and `Promo.tsx` replace `trafficEnvMult(game.clock, industryId) * hourMult(game.clock.minute)` with `trafficEnvMult(game.clock, industryId) * nightMult(game.clock.minute)` (import `nightMult`). The per-channel peak now lives inside `orderRate`, so the isolated-channel estimate already reflects SocialShop's ×3. Then delete `hourMult` from `env.ts` and replace its `env.test.ts` assertions with the `nightMult`/`peakMultFor` test added in Task 6.

- [ ] **Step 2: SocialShop card note**

In `ChannelCard`, after the commission/fee line add:

```tsx
        {def.peakHourMult > 2 && (
          <p className="mt-0.5 text-xs text-violet-700">Đơn dồn giờ cao điểm ×{def.peakHourMult} (11–13h, 19–22h)</p>
        )}
```

- [ ] **Step 3: `EventToasts.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store';
import { usd } from '../format';
import { questsForStage } from '@shopflow/sim';
import { QUEST_LABEL } from '../goals';

interface Note { id: number; text: string; cls: string }

/** Toast cho các sự kiện sim không đi qua lastReject: hoàn trả, nhiệm vụ xong. */
export default function EventToasts() {
  const returned = useGame((s) => s.game?.returnedOrders ?? 0);
  const questsDone = useGame((s) => s.game?.questsDone ?? []);
  const stage = useGame((s) => s.game?.stage ?? 1);
  const [notes, setNotes] = useState<Note[]>([]);
  const prev = useRef<{ returned: number; quests: number } | null>(null);
  const seq = useRef(0);
  const push = (text: string, cls: string) => {
    const id = ++seq.current;
    setNotes((n) => [...n, { id, text, cls }]);
    setTimeout(() => setNotes((n) => n.filter((x) => x.id !== id)), 3000);
  };
  useEffect(() => {
    const p = prev.current;
    prev.current = { returned, quests: questsDone.length };
    if (!p) return;
    if (returned > p.returned) push(`↩️ ${returned - p.returned} đơn hoàn trả`, 'bg-amber-600');
    if (questsDone.length > p.quests) {
      const defs = questsForStage(stage);
      for (const id of questsDone.slice(p.quests)) {
        const bonus = defs.find((q) => q.id === id)?.bonus ?? 0;
        push(`✓ Nhiệm vụ: ${QUEST_LABEL[id] ?? id} +${usd(bonus)}`, 'bg-emerald-700');
      }
    }
  }, [returned, questsDone.length, stage]);
  if (notes.length === 0) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 top-28 z-50 flex -translate-x-1/2 flex-col gap-2">
      {notes.map((n) => (
        <div key={n.id} role="status" className={`rounded-lg px-4 py-2 text-sm font-bold text-white shadow-lg ${n.cls}`}>{n.text}</div>
      ))}
    </div>
  );
}
```

Render `<EventToasts />` in `App.tsx` next to `<Toast />`.

- [ ] **Step 4: Market-cycle card in `Promo.tsx`**

Replace the locked "Thị trường" card with:

```tsx
const CYCLE_NAME: Record<string, string> = { stable: 'Ổn định', boom: 'Hưng thịnh', slow: 'Trầm lắng', recession: 'Suy thoái' };
const CYCLE_ICON: Record<string, string> = { stable: '⚖️', boom: '📈', slow: '🌫️', recession: '📉' };
// ...
        {game.stage < CAL.marketCycle.fromStage ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white/60 p-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Thị trường</h2>
            <p className="mt-1 font-bold text-slate-400">🔒 Chu kỳ thị trường</p>
            <p className="mt-0.5 text-xs text-slate-400">Mở ở màn {CAL.marketCycle.fromStage}</p>
          </div>
        ) : (() => {
          const st = (CAL.marketCycle.states as any[]).find((x) => x.id === game.marketCycle) ?? CAL.marketCycle.states[0];
          const bad = game.marketCycle === 'recession' || game.marketCycle === 'slow';
          return (
            <div className={`rounded-xl p-3 ${bad ? 'bg-slate-100' : 'bg-sky-50'}`}>
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Thị trường</h2>
              <p className="mt-1 font-bold">{CYCLE_ICON[st.id]} {CYCLE_NAME[st.id] ?? st.id}</p>
              <p className="mt-0.5 text-xs text-slate-600">khách ×{st.traffic} · giá lẻ ×{st.retail} · giá sỉ ×{st.wholesale} · ship ×{st.shipping}</p>
              <p className="mt-0.5 text-xs text-slate-500">Còn {game.marketCycleDaysLeft} ngày</p>
            </div>
          );
        })()}
```

- [ ] **Step 5: SEO card decay warning**

In `SeoCard`, under the "Cấp n/3" line:

```tsx
        {game.stage >= CO.seoDecayFromStage && score > CO.seoFloor && (
          <p className="mt-0.5 text-xs text-amber-600">Hao hụt −{CO.seoDecayPerDay} điểm/ngày về {CO.seoFloor}</p>
        )}
```

(import `costs as CO` from `@shopflow/data`). The level-3 button already appears through `next.unlockStage` logic.

- [ ] **Step 6: Verify + commit**

`pnpm test`, `pnpm typecheck` green. Browser: Bán tab shows SocialShop locked "Màn 3" with the peak note visible once unlocked; Quảng bá shows the locked market card at stage 1. Commit `feat(web): SocialShop note, event toasts, market-cycle card, SEO decay warning`.

### Task 15: Thêm — menu, Nâng cấp (C12), Báo cáo, Cài đặt (Chơi mới)

**Files:**
- Create: `apps/web/src/screens/More.tsx`, `apps/web/src/screens/more/Upgrades.tsx`, `apps/web/src/screens/more/Reports.tsx`, `apps/web/src/screens/more/Settings.tsx`, `apps/web/src/screens/ReportBody.tsx`
- Modify: `apps/web/src/screens/DayReportModal.tsx` (extract body), `apps/web/src/App.tsx` (route `them`), `apps/web/src/report.ts` (+ `upgradeEffectText`), `apps/web/src/report.test.ts`

**Interfaces:**
- Produces: `upgradeEffectText(effect: Record<string, unknown>): string` (pure, tested); `<ReportBody r game reports />` shared by the modal and the history screen.

- [ ] **Step 1: Failing test for `upgradeEffectText`**

Append to `apps/web/src/report.test.ts`:

```ts
import { upgradeEffectText } from './report';
describe('upgradeEffectText', () => {
  it('renders every effect key in upgrades.json', () => {
    expect(upgradeEffectText({ deliveryDaysMult: 0.7 })).toBe('Ngày giao ×0.7');
    expect(upgradeEffectText({ trafficMult: 1.3 })).toBe('Khách ×1.3');
    expect(upgradeEffectText({ robotSpeedMult: 1.5 })).toBe('Tốc độ robot ×1.5');
    expect(upgradeEffectText({ cancelPenaltyHalf: true, ratingRegenPerHour: 0.01 })).toBe('Phạt hủy đơn ÷2 · Rating hồi +0.01/giờ');
    expect(upgradeEffectText({ wholesaleMult: 0.85 })).toBe('Giá sỉ ×0.85');
    expect(upgradeEffectText({ commissionDelta: -0.02 })).toBe('Hoa hồng mọi kênh −2 điểm %');
  });
});
```

- [ ] **Step 2: Implement in `report.ts`**

```ts
/** Mô tả hiệu ứng nâng cấp đúng con số trong data (C12). */
export function upgradeEffectText(effect: Record<string, unknown>): string {
  const parts: string[] = [];
  if (effect.deliveryDaysMult != null) parts.push(`Ngày giao ×${effect.deliveryDaysMult}`);
  if (effect.trafficMult != null) parts.push(`Khách ×${effect.trafficMult}`);
  if (effect.robotSpeedMult != null) parts.push(`Tốc độ robot ×${effect.robotSpeedMult}`);
  if (effect.cancelPenaltyHalf) parts.push('Phạt hủy đơn ÷2');
  if (effect.ratingRegenPerHour != null) parts.push(`Rating hồi +${effect.ratingRegenPerHour}/giờ`);
  if (effect.wholesaleMult != null) parts.push(`Giá sỉ ×${effect.wholesaleMult}`);
  if (effect.commissionDelta != null) parts.push(`Hoa hồng mọi kênh ${Number(effect.commissionDelta) < 0 ? '−' : '+'}${Math.abs(Number(effect.commissionDelta) * 100)} điểm %`);
  return parts.join(' · ');
}
```

- [ ] **Step 3: Extract `ReportBody.tsx` from `DayReportModal.tsx`**

Move everything inside the white card (from the header `Báo cáo cuối ngày` down to and including the suspended-channel warnings, excluding the close button) into:

```tsx
import { channels as CH } from '@shopflow/data';
import type { DayReport, GameState } from '@shopflow/sim';
import { usdCents } from '../format';
import { sparklinePoints, sparklineZeroY } from '../report';

export default function ReportBody({ r, game, reports }: { r: DayReport; game: GameState; reports: DayReport[] }) { /* moved JSX */ }
```

Add two spend rows after `Nhập hàng`: `{r.refunds !== 0 && <InfoRow label="Hoàn trả (không tính vào chi)" value={`−${usdCents(r.refunds)}`} />}` and in the Thu section `{r.questBonus > 0 && <div className="mt-1 flex justify-between gap-2 text-sm"><span>🎯 Thưởng nhiệm vụ</span><span className="font-bold text-amber-700">+{usdCents(r.questBonus)}</span></div>}`. The sparkline uses the `reports` slice ending at `r` (`reports.slice(0, reports.indexOf(r) + 1).slice(-7)`), so history views show the trend up to that day. `DayReportModal` becomes: effect + `<ReportBody r={reports[reports.length-1]} game={game} reports={reports} />` + close button, and switches `setPaused` to `setModalPaused` (Task 11).

- [ ] **Step 4: `More.tsx` and sub-screens**

```tsx
// apps/web/src/screens/More.tsx
import { useState } from 'react';
import Upgrades from './more/Upgrades';
import Reports from './more/Reports';
import Settings from './more/Settings';

type Sub = null | 'nangcap' | 'baocao' | 'caidat';
const ITEMS: { id: Exclude<Sub, null>; icon: string; title: string; hint: string }[] = [
  { id: 'nangcap', icon: '🧰', title: 'Nâng cấp', hint: '6 nâng cấp vĩnh viễn · mở ở màn 3' },
  { id: 'baocao', icon: '📊', title: 'Báo cáo', hint: 'Xem lại báo cáo cuối ngày' },
  { id: 'caidat', icon: '⚙️', title: 'Cài đặt', hint: 'Chơi mới · chơi lại hướng dẫn' },
];

export default function More() {
  const [sub, setSub] = useState<Sub>(null);
  if (sub) {
    const Screen = sub === 'nangcap' ? Upgrades : sub === 'baocao' ? Reports : Settings;
    return (
      <div className="space-y-3">
        <button onClick={() => setSub(null)} className="text-sm font-bold text-emerald-700">← Thêm</button>
        <Screen />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {ITEMS.map((it) => (
        <button key={it.id} onClick={() => setSub(it.id)} className="flex w-full items-center gap-3 rounded-xl bg-white p-4 text-left shadow">
          <span className="text-2xl">{it.icon}</span>
          <span className="min-w-0 flex-1"><span className="block font-bold">{it.title}</span><span className="block text-xs text-slate-500">{it.hint}</span></span>
          <span className="text-slate-300">›</span>
        </button>
      ))}
    </div>
  );
}
```

```tsx
// apps/web/src/screens/more/Upgrades.tsx
import { upgrades as UP } from '@shopflow/data';
import { useGame } from '../../store';
import { usd } from '../../format';
import { upgradeEffectText } from '../../report';

const ICON: Record<string, string> = { routing: '🚚', seo_pro: '🔍', robot_fast: '🤖', cs: '🎧', wholesale: '📜', negotiator: '🤝' };

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
```

```tsx
// apps/web/src/screens/more/Reports.tsx
import { useState } from 'react';
import { useGame } from '../../store';
import { usdCents } from '../../format';
import ReportBody from '../ReportBody';

export default function Reports() {
  const game = useGame((s) => s.game);
  const [idx, setIdx] = useState<number | null>(null);
  if (!game) return null;
  const reports = game.reports;
  const last30 = reports.slice(-30);
  const total = last30.reduce((a, r) => a + r.net, 0);
  if (idx !== null) {
    return (
      <div className="space-y-3">
        <button onClick={() => setIdx(null)} className="text-sm font-bold text-emerald-700">← Danh sách</button>
        <div className="rounded-2xl bg-white p-5 shadow"><ReportBody r={reports[idx]} game={game} reports={reports} /></div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between"><h1 className="text-lg font-bold">Báo cáo cuối ngày</h1>
        <span className={`text-sm font-bold ${total >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>30 ngày: {total >= 0 ? '+' : ''}{usdCents(total)}</span></div>
      {reports.length === 0 && <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-500 shadow">Chưa có báo cáo nào — hết ngày đầu tiên sẽ có.</p>}
      {reports.map((r, i) => ({ r, i })).reverse().map(({ r, i }) => (
        <button key={i} onClick={() => setIdx(i)} className="flex w-full items-center justify-between rounded-xl bg-white p-3 text-left shadow">
          <span className="font-bold">Ngày {r.day} · Tháng {r.month}</span>
          <span className={`font-bold ${r.net >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{r.net >= 0 ? '+' : ''}{usdCents(r.net)}</span>
        </button>
      ))}
    </div>
  );
}
```

```tsx
// apps/web/src/screens/more/Settings.tsx
import { useState } from 'react';
import { useGame } from '../../store';

export default function Settings() {
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const newGame = useGame((s) => s.newGame);
  const [confirm, setConfirm] = useState(false);
  if (!game) return null;
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">Cài đặt</h1>
      <div className="rounded-xl bg-white p-3 shadow">
        <div className="font-bold">Hướng dẫn</div>
        <p className="text-xs text-slate-500">Chơi lại 8 bước hướng dẫn. {game.tutorial.rewarded ? 'Thưởng $200 đã nhận, không nhận lại.' : 'Hoàn thành để nhận $200.'}</p>
        <button onClick={() => dispatch('tutorialReset')} className="mt-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">Chơi lại hướng dẫn</button>
      </div>
      <div className="rounded-xl bg-white p-3 shadow">
        <div className="font-bold text-rose-700">Chơi mới</div>
        <p className="text-xs text-slate-500">Xoá bản lưu hiện tại (màn {game.stage}, {game.completedOrders} đơn) và bắt đầu lại từ chọn ngành.</p>
        {!confirm ? (
          <button onClick={() => setConfirm(true)} className="mt-2 rounded-xl bg-rose-600 px-3 py-2 text-sm font-bold text-white">Chơi mới…</button>
        ) : (
          <div className="mt-2 flex gap-2">
            <button onClick={newGame} className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-bold text-white">Xoá và chơi mới</button>
            <button onClick={() => setConfirm(false)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">Huỷ</button>
          </div>
        )}
      </div>
      <p className="text-center text-xs text-slate-400">Shopflow Tycoon · M2a · lưu tự động mỗi 60 giây</p>
    </div>
  );
}
```

- [ ] **Step 5: Route in `App.tsx`**

Delete `PLACEHOLDERS`; render `<More />` for `tab === 'them'`.

- [ ] **Step 6: Verify + commit**

`pnpm test`, `pnpm typecheck` green. Browser: Thêm → three entries; Nâng cấp shows six cards locked at stage 1; Báo cáo lists days; Cài đặt → Chơi mới → confirm → industry select appears and the old save is gone (`localStorage.getItem('shopflow-save')` is null). Commit `feat(web): Thêm menu with upgrades, report history, settings and new game`.

### Task 16: Tutorial coach-mark

**Files:**
- Create: `apps/web/src/tutorial.ts`, `apps/web/src/tutorial.test.ts`, `apps/web/src/components/TutorialCard.tsx`
- Modify: `apps/web/src/App.tsx` (mark visited tabs, render card)

**Interfaces:**
- Produces: `TUTORIAL: { text: string; tab: Tab }[]` (8 entries), `tutorialCtx = { game: GameState; visited: Tab[] }`, `completedSteps(ctx): number` (highest n such that steps 1..n are all satisfied), `<TutorialCard />`.

- [ ] **Step 1: Failing tests**

```ts
// apps/web/src/tutorial.test.ts
import { describe, it, expect } from 'vitest';
import { createGame } from '@shopflow/sim';
import { completedSteps, TUTORIAL } from './tutorial';

const ctx = (over: any = {}, visited: any[] = []) => ({ game: { ...createGame(1, 'electronics'), ...over }, visited });

describe('tutorial predicates', () => {
  it('8 steps, each with a tab', () => { expect(TUTORIAL).toHaveLength(8); expect(TUTORIAL.every((s) => s.text && s.tab)).toBe(true); });
  it('0 when nothing done; 1 after visiting Nhập', () => {
    expect(completedSteps(ctx())).toBe(0);
    expect(completedSteps(ctx({}, ['nhap']))).toBe(1);
  });
  it('steps must be consecutive: a shelf without purchases still counts 1', () => {
    const g = createGame(1, 'electronics'); g.grid.cells[0] = { type: 'shelf', level: 1 };
    expect(completedSteps(ctx(g, ['nhap']))).toBe(1);
  });
  it('full run reaches 8', () => {
    const g = createGame(1, 'electronics');
    g.retailLotsBought = 1; g.bundleLotsBought = 1;
    g.grid.cells[0] = { type: 'shelf', level: 1 }; g.grid.cells[1] = { type: 'packer', level: 1 };
    g.completedOrders = 1; g.reports = [{} as any];
    expect(completedSteps(ctx(g, ['nhap', 'ban']))).toBe(8);
    expect(completedSteps(ctx(g, ['nhap']))).toBe(5); // chưa mở tab Bán
  });
});
```

- [ ] **Step 2: `tutorial.ts`**

```ts
// apps/web/src/tutorial.ts — điều kiện 8 bước hướng dẫn (spec C3); sim chỉ lưu tiến độ.
import type { GameState } from '@shopflow/sim';
import type { Tab } from './components/TabBar';

export interface TutorialCtx { game: GameState; visited: Tab[] }

export const TUTORIAL: { text: string; tab: Tab; done: (c: TutorialCtx) => boolean }[] = [
  { text: 'Mở tab Nhập để xem nguồn hàng.', tab: 'nhap', done: (c) => c.visited.includes('nhap') },
  { text: 'Nhập lẻ 10 sản phẩm đầu tiên (giao ngay).', tab: 'nhap', done: (c) => c.game.retailLotsBought >= 1 },
  { text: 'Mua gói sỉ đầu tiên — xe về sau 1 ngày.', tab: 'nhap', done: (c) => c.game.bundleLotsBought >= 1 },
  { text: 'Về Kho, chọn Kệ hàng rồi chạm ô trống.', tab: 'kho', done: (c) => c.game.grid.cells.some((x) => x?.type === 'shelf') },
  { text: 'Đặt thêm một Bàn đóng gói để giao nhanh hơn.', tab: 'kho', done: (c) => c.game.grid.cells.filter((x) => x?.type === 'packer').length >= 2 },
  { text: 'Mở tab Bán hàng: Chợ Trời Online đã bật — mỗi đơn mất 12% hoa hồng.', tab: 'ban', done: (c) => c.visited.includes('ban') },
  { text: 'Chờ đơn đầu tiên được giao.', tab: 'ban', done: (c) => c.game.completedOrders >= 1 },
  { text: 'Xem Báo cáo cuối ngày đầu tiên lúc 00:00: thu, chi, lãi.', tab: 'kho', done: (c) => c.game.reports.length >= 1 },
];

/** Số bước liên tiếp đã xong tính từ bước 1 (chơi lệch thứ tự vẫn được tính khi các bước trước hoàn tất). */
export function completedSteps(c: TutorialCtx): number {
  let n = 0;
  for (const step of TUTORIAL) { if (!step.done(c)) break; n++; }
  return n;
}
```

- [ ] **Step 3: `TutorialCard.tsx`**

```tsx
import { useEffect } from 'react';
import { TUTORIAL_STEPS } from '@shopflow/sim';
import { stages as ST } from '@shopflow/data';
import { useGame } from '../store';
import { usd } from '../format';
import { TUTORIAL, completedSteps } from '../tutorial';
import { TABS, type Tab } from './TabBar';

export default function TutorialCard({ setTab }: { setTab: (t: Tab) => void }) {
  const game = useGame((s) => s.game);
  const visited = useGame((s) => s.visited);
  const dispatch = useGame((s) => s.dispatch);
  const step = game?.tutorial.step ?? 0;
  const done = game?.tutorial.done ?? true;
  // Đồng bộ tiến độ: sim chỉ nhận "advance", web quyết định bước nào đã xong.
  const reached = game ? completedSteps({ game, visited }) : 0;
  useEffect(() => { if (game && !done && reached > step) dispatch('tutorialAdvance'); }, [reached, step, done, game, dispatch]);
  if (!game || done) return null;
  const finished = step >= TUTORIAL_STEPS;
  const cur = TUTORIAL[Math.min(step, TUTORIAL_STEPS - 1)];
  const tabDef = TABS.find((t) => t.id === cur.tab)!;
  return (
    <div className="fixed inset-x-0 bottom-14 z-30 px-3 pb-2">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 shadow-lg" role="status">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500 text-sm font-bold text-white">
          {finished ? '🎉' : `${step + 1}/${TUTORIAL_STEPS}`}
        </span>
        <div className="min-w-0 flex-1 text-sm">
          {finished ? <span className="font-bold text-amber-900">Xong hướng dẫn! Nhận thưởng {usd(ST.tutorialReward)}.</span>
            : <><span className="font-bold text-amber-900">Bước {step + 1}:</span> {cur.text}</>}
        </div>
        {finished ? (
          <button onClick={() => dispatch('tutorialClaim')} className="shrink-0 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white">Nhận +{usd(ST.tutorialReward)}</button>
        ) : (
          <div className="flex shrink-0 flex-col gap-1">
            <button onClick={() => setTab(cur.tab)} className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-white">{tabDef.icon} {tabDef.label}</button>
            <button onClick={() => dispatch('tutorialSkip')} className="text-xs text-amber-800 underline">Bỏ qua</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire in `App.tsx`**

```tsx
  const markVisited = useGame((s) => s.markVisited);
  useEffect(() => { markVisited(tab); }, [tab, markVisited]);
  // ... after <TabBar/>:
      <TutorialCard setTab={setTab} />
```

The restock/sales screens' fixed order bar sits at `bottom-14`; when the tutorial card is visible it overlaps. Give `<main>` `pb-36` while `!game.tutorial.done` and move the card above the order bar by rendering the card with `bottom-14` only when `tab !== 'nhap'`, else `bottom-40`. Keep it simple: `className={`fixed inset-x-0 ${tab === 'nhap' ? 'bottom-40' : 'bottom-14'} z-30 px-3 pb-2`}` (pass `tab` as a prop).

- [ ] **Step 5: Verify + commit**

`pnpm test` + `pnpm typecheck` green. Browser: Chơi mới → pick industry → card shows "Bước 1/8"; tapping the Nhập button switches tab and the card advances to 2/8; buying 10 ốp lưng advances to 3/8; skip hides the card; Cài đặt → Chơi lại hướng dẫn brings it back at 1/8. Commit `feat(web): 8-step tutorial coach-mark with reward`.

### Task 17: "Chào mừng trở lại" modal, day-report suppression, stage-complete quest list

**Files:**
- Create: `apps/web/src/screens/WelcomeBack.tsx`
- Modify: `apps/web/src/screens/DayReportModal.tsx`, `apps/web/src/screens/StageComplete.tsx`, `apps/web/src/App.tsx`
- Create: `apps/web/src/offline.ts` + `apps/web/src/offline.test.ts`

**Interfaces:**
- Produces: `elapsedText(ticks: number): string` (`"2 phút"`, `"1 giờ 05 phút"`, `"8 giờ (tối đa)"`), `<WelcomeBack />`.

- [ ] **Step 1: Failing test**

```ts
// apps/web/src/offline.test.ts
import { describe, it, expect } from 'vitest';
import { elapsedText } from './offline';
import { MAX_OFFLINE_TICKS } from '@shopflow/sim';

describe('elapsedText', () => {
  it('formats ticks (1 tick = 1 giây thực)', () => {
    expect(elapsedText(90)).toBe('1 phút');
    expect(elapsedText(3900)).toBe('1 giờ 05 phút');
    expect(elapsedText(MAX_OFFLINE_TICKS)).toBe('8 giờ (tối đa)');
  });
});
```

- [ ] **Step 2: `offline.ts`**

```ts
import { MAX_OFFLINE_TICKS } from '@shopflow/sim';
export function elapsedText(ticks: number): string {
  if (ticks >= MAX_OFFLINE_TICKS) return '8 giờ (tối đa)';
  const h = Math.floor(ticks / 3600), m = Math.floor((ticks % 3600) / 60);
  if (h === 0) return `${Math.max(1, m)} phút`;
  return `${h} giờ ${String(m).padStart(2, '0')} phút`;
}
```

- [ ] **Step 3: `WelcomeBack.tsx`**

```tsx
import { industries as IND, calendar as CAL } from '@shopflow/data';
import { useGame } from '../store';
import { usdCents } from '../format';
import { elapsedText } from '../offline';

const PRODUCT_NAME: Record<string, string> = Object.fromEntries((IND.industries as any[]).flatMap((i) => i.products.map((p: any) => [p.id, p.name])));
const EVENT_NAME = (id: string) => (CAL.events as any[]).find((e) => e.id === id)?.name ?? id;

/** C15 — tóm tắt thời gian vắng mặt; game đang tạm dừng cho tới khi bấm Nhận. */
export default function WelcomeBack() {
  const sum = useGame((s) => s.offlineSummary);
  const dismiss = useGame((s) => s.dismissOffline);
  if (!sum) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-label="Chào mừng trở lại">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Chào mừng trở lại</p>
        <h2 className="text-2xl font-bold">Sếp vắng {elapsedText(sum.ticks)}</h2>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Tile label="Đã giao" value={String(sum.ordersDelivered)} />
          <Tile label="Quá hạn" value={String(sum.ordersCancelled)} tone={sum.ordersCancelled > 0 ? 'rose' : undefined} />
          <Tile label="Hoàn trả" value={String(sum.ordersReturned)} />
        </div>
        <Row label="Doanh thu (đã trừ hoa hồng)" value={`+${usdCents(sum.netRevenue)}`} cls="text-emerald-700" />
        <Row label={`Chi phí ${sum.daysSettled} ngày (thuê, bảo trì, phí kênh)`} value={`−${usdCents(sum.feesPaid)}`} cls="text-rose-600" />
        {sum.eventsStarted.length > 0 && <Row label="Sự kiện bắt đầu" value={sum.eventsStarted.map(EVENT_NAME).join(', ')} />}
        {sum.eventsEnded.length > 0 && <Row label="Sự kiện đã qua" value={sum.eventsEnded.map(EVENT_NAME).join(', ')} />}
        {sum.lowStock.length > 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">⚠️ Tồn thấp: {sum.lowStock.map((id) => PRODUCT_NAME[id] ?? id).join(', ')}</p>
        )}
        {sum.stageCompleted && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">🏆 Đã đạt mục tiêu màn trong lúc sếp vắng!</p>}
        <button onClick={dismiss} className="mt-4 w-full rounded-xl bg-emerald-700 p-3 font-bold text-white">Nhận</button>
      </div>
    </div>
  );
}
function Tile({ label, value, tone }: { label: string; value: string; tone?: 'rose' }) {
  return <div className="rounded-xl bg-slate-100 p-3"><div className="text-xs text-slate-500">{label}</div><div className={`text-lg font-bold ${tone === 'rose' ? 'text-rose-600' : ''}`}>{value}</div></div>;
}
function Row({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return <div className="mt-2 flex justify-between gap-2 text-sm"><span className="text-slate-600">{label}</span><span className={`shrink-0 font-bold ${cls}`}>{value}</span></div>;
}
```

- [ ] **Step 4: Suppress the day report during catch-up**

In `DayReportModal.tsx`'s effect, read `const offline = useGame((s) => s.offlineSummary);` and:

```ts
    if (offline) { prevLen.current = len; return; } // tóm tắt offline đã gồm các ngày này
```

placed before the `len > prevLen.current` check. Also, because the worker posts `state` and `offline` in the same message, the store sets both in one `set`, so the effect sees `offline` on the same render.

- [ ] **Step 5: Stage-complete quest list**

In `StageComplete.tsx`, after the reward box, add:

```tsx
        {(() => {
          const q = questProgress({ stage, questsDone: game.questsDone });
          return q.total > 0 ? (
            <ul className="mt-3 space-y-1 text-sm">
              {q.list.map((x) => <li key={x.id} className={x.done ? 'text-emerald-700' : 'text-slate-400'}>{x.done ? '✓' : '○'} {QUEST_LABEL[x.id] ?? x.id}</li>)}
            </ul>
          ) : null;
        })()}
```

(import `questProgress`, `QUEST_LABEL` from `../goals`). Note `stage` here is the finished stage captured in `stageRef`, and `questsDone` still contains that stage's ids.

- [ ] **Step 6: Render and verify**

Add `<WelcomeBack />` in `App.tsx` after `<DayReportModal />`. `pnpm test` + `pnpm typecheck` green. Browser: start a game with stock on a shelf, switch to another tab in the app browser for ≥ 2 minutes (or set the system clock forward is not needed: use the built-in browser's tab switching), return → modal shows elapsed time and counts, HUD clock advanced, game paused until Nhận, no day-report modal appeared for the settled days. Reload the page after ≥ 60 s away → same modal via `savedAt`.

- [ ] **Step 7: Commit** `feat(web): welcome-back offline summary, report suppression, stage quest list`.

### Task 18: Exit-criteria playthrough, docs, deploy

**Files:**
- Modify: `README-SETUP.md` (roadmap line), `docs/superpowers/specs/2026-09-17-m2a-stage3-and-core-ux-design.md` (record any harness window changes)
- No new code unless a bug is found (fix with a test, commit separately).

- [ ] **Step 1: Full gate** — `pnpm test`, `pnpm typecheck`, `BASE_PATH=/shopflow-tycoon/ pnpm --filter @shopflow/web build` (Git Bash: prefix `MSYS_NO_PATHCONV=1`).

- [ ] **Step 2: Playthrough checklist (in-app browser, `web` launch config)**

1. Chơi mới → industry select → tutorial card 1/8 → follow the steps → "Nhận +$200" → money increases by $200; goal strip visible; 2x locked.
2. Hide the tab ≥ 2 min → return → Chào mừng trở lại with plausible numbers, game paused, Nhận resumes.
3. Reach stage 2 (harness bot strategy by hand or a temporary edited save: set `money`, `completedOrders`, `rating` just under the goal, then deliver one order). Quest chip appears; open MegaMall → quest toast "+$50".
4. Reach stage 3 the same way: SocialShop card shows the ×3 note and opens; Nhập → Nhập khẩu xa + hạng C → MOQ 20, −35% unit price; after a night the Đang về card may show a risk tag (repeat with a couple of lots, 10% customs / 3% loss); Thêm → Nâng cấp → buy Định Tuyến → a bundle's ETA drops; Quảng bá shows the market-cycle card with a countdown; 2x unlocked and visibly doubles the clock rate.
5. Thêm → Cài đặt → Chơi mới → industry select; `localStorage['shopflow-save']` absent.
6. Remove any temporary save edits; `pnpm test` still green.

- [ ] **Step 3: Docs**

`README-SETUP.md` roadmap line: after `M1 … ✅ (hoàn thành 2026-08-25)` insert `→ M2a màn 3 + tutorial/offline/Thêm ✅ (hoàn thành <date>)` and keep `→ M2b màn 4 + sự kiện → M2c màn 5–6 → M3 …`. Record final harness windows in spec 1.9 if changed.

- [ ] **Step 4: Merge and deploy**

```bash
git checkout master
git merge --no-ff m2a -m "feat: M2a — stage 3 mechanics + core UX (tutorial, goals, Thêm menu, offline catch-up, 2x)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push origin master
```

Watch the Pages workflow (Actions tab or the API); confirm https://trananhvan1102vn.github.io/shopflow-tycoon/ loads, shows the tutorial on a fresh game, and the worker runs (HUD clock ticks).

---

## Self-review against the spec

- **1.1 state** → Task 1. **1.2 purchases/quote/XP** → Task 3. **1.3 risk/decay** → Task 4. **1.4 returns** → Task 5. **1.5 modifiers** → Task 2. **1.6 market/SEO/social/upgrades** → Tasks 2, 6. **1.7 fastForward** → Task 9. **1.8 tutorial/quests** → Tasks 7, 8. **1.9 harness** → Task 10.
- **2.1 worker/store/save** → Task 11. **2.2 HUD** → Task 12. **2.3 Nhập** → Task 13. **2.4 Bán/Quảng bá** → Task 14. **2.5 Thêm** → Task 15. **2.6 overlays** → Tasks 16 (tutorial), 17 (welcome, stage quest list), 14 (quest toast). Exit criteria → Task 18.
- Deviations recorded: `bundleShipMult` reused instead of a new `shipMult` trait (Task 3); `survivedRecession`, `retailLotsBought`, `bundleLotsBought` added to state (Task 1); "quan hệ cấp 3" = `levels` index 2 (Task 7); `hourMult` kept as a deprecated alias between Tasks 6 and 14.
- Type consistency: `PurchaseOpts` (Task 3) is used by Tasks 10, 11, 13; `OfflineSummary` (Task 9) by Tasks 11, 17; `questsForStage`/`questDone` (Task 7) by Tasks 12, 14, 17; `TUTORIAL_STEPS` (Task 8) by Task 16; `setModalPaused` (Task 11) by Task 15; `nightMult`/`peakMultFor` (Task 6) by Task 14.

