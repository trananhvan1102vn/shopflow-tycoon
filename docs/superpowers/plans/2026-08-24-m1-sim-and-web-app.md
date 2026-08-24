# M1 — Sim màn 1–2 + Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable stage 1→2 build: complete pure sim mechanics with a balance harness, then a Vietnamese mobile-first web app driving the sim in a Web Worker.

**Architecture:** The sim (`packages/sim`) stays pure and deterministic — new modules `rng.ts`, `env.ts`, `orders.ts`, `logistics.ts`, `fulfil.ts`, `actions.ts`, `stageCheck.ts` are orchestrated by `tick.ts`/`settleDay.ts`. The web app (`apps/web`) runs the sim in a Web Worker (1 real second → `tick(state, 4, rng)`), posts JSON snapshots to a Zustand store, and dispatches action messages back.

**Tech Stack:** TypeScript, vitest, Vite, React 18, Zustand, Tailwind CSS v3, Web Worker, localStorage.

**Spec:** `docs/superpowers/specs/2026-08-24-m1-sim-and-web-app-design.md` (scope) + `docs/Kich-Ban-Game-Shopflow-Tycoon-Full.md` (game rules — wins on rules conflicts).

## Global Constraints

- Money is **integer cents** ($1 = 100). Durations in **game minutes**. 1 real second = 4 game minutes.
- Sim code never calls `Date.now()`, `Math.random()`, or `new Date()` — randomness only via the injected `Rng`.
- All game numbers come from `@shopflow/data` — never hard-code a balance value in sim or UI code.
- All sim state is plain JSON-serializable (worker postMessage + localStorage save).
- UI copy is Vietnamese, matching `docs/demo-screens/*.png` terminology.
- `pnpm test` must pass after every task; run it from the repo root.
- Actions that can't be afforded/placed return the state unchanged except `lastReject` set to a Vietnamese message; on success `lastReject` is `null`.
- Commit after every task (feature branch `m1`, created in Task 1).
- Windows environment: use forward slashes in imports; commands below run in PowerShell or bash.
- Existing test `test/sim.test.ts` must stay green (update only if a task explicitly says so).

## Data cheat-sheet (already in `@shopflow/data`, do not re-declare)

- `stages.stages[n-1]` → `{ n, goal: {money, orders, rating}, reward, sla, queueCap, unlocks }`; `stages.combo = { ordersPerStep: 10, bonusPerStep: 0.05, maxBonus: 0.5 }`; `stages.rating = { start: 4.0, perDelivered: 0.02, perCancelled: -0.1, min: 1, max: 5 }`; `stages.warehouse` → grids/shelf/packer/robot/demolish(1000)/uncheckedPerEmptyCell(500)/auditPerPackerSpeedPerHour(20).
- `channels.channels[]` → `{ id: 'flea'|'mall'|'social'|'website', openCost, dailyFee, commission, trafficK, unlockStage, minRating? }`; `channels.levelBonus['2'|'3']`; `channels.affinity[industryId][channelId]`.
- `industries.industries[]` → `{ id, name, V, products: [{id, name, retail, wholesale, unlockStage?}], bundles: [{id, name, cost, days, items, unlockStage}] }`. Stage 1–2 industries: `electronics`, `fashion`, `home`.
- `suppliers` → `tiers[]` (`local` costMult 1.0 extraDays 0), `grades` (B costMult 1.0), `carriers[]` (`economy` fee 1200 daysDelta +1, `standard` 2000 0, `express` 4000 −1), `retail = { priceMult: 1.2, moqLocal: 5, maxPerOrder: 100 }`.
- `calendar` → `events[]` (`from`/`to` as `[month, day]`, `retailMult?`, `wholesaleMult?`, `trafficMult`, `industries: 'all'|string[]`), `doubleDay {retailMult 2, trafficMult 3}`, `weekendDays[]`, `weekend {trafficMult 1.3, retailMult 1.05, wholesaleMult 0.95}`, `hourly {peakHours[], nightHours[], nightMult 0.5}`, `seasonalBundles[]` (`window: [[m,d],[m,d]]`, `discount`, `limit`).
- `upgrades.seoCampaigns` → `[{level: 1, cost: 16000, score: 55}, {level: 2, cost: 40000, score: 70}, {level: 3, ...unlockStage: 3}]`; `upgrades.seoStart = 40`.
- `costs` → `warehouseRentPerCellPerDay: 200`, `maintenancePerEquipmentLevelPerDay: 100`.

---

# Phase 1 — Sim (`packages/sim`)

### Task 1: Seeded RNG + state shape extensions

**Files:**
- Create: `packages/sim/src/rng.ts`
- Modify: `packages/sim/src/types.ts`, `packages/sim/src/create.ts`, `packages/sim/src/index.ts`
- Test: `packages/sim/test/rng.test.ts`

**Interfaces:**
- Produces: `makeRng(seed: number): Rng` (mulberry32). `GameState` gains the fields below; `createGame` initializes them. `Delivery` replaces `auditLeft` with `itemsTotal`/`itemsChecked`.

- [ ] **Step 0: Create feature branch**

```bash
git checkout -b m1
```

- [ ] **Step 1: Write the failing test**

```ts
// packages/sim/test/rng.test.ts
import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/rng.js';

describe('makeRng', () => {
  it('same seed → same sequence, in [0,1)', () => {
    const a = makeRng(42), b = makeRng(42);
    for (let i = 0; i < 100; i++) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('different seeds differ', () => {
    expect(makeRng(1).next()).not.toBe(makeRng(2).next());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shopflow/sim exec vitest run test/rng.test.ts`
Expected: FAIL — cannot resolve `../src/rng.js`

- [ ] **Step 3: Implement rng + type changes**

```ts
// packages/sim/src/rng.ts
import type { Rng } from './types.js';

/** mulberry32 — deterministic, serializable via seed. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
```

In `packages/sim/src/types.ts`:
- In `Delivery`, replace `auditLeft: GameMinutes;` with `itemsTotal: number; itemsChecked: number;`
- Add to `GameState` (after `completedOrders`):

```ts
  orderGenAccum: GameMinutes; packAccum: number;
  orderSeq: number; deliverySeq: number;
  dayRevenue: Record<string, Cents>; dayOrders: Record<string, number>;
  dayCommission: Cents; dayPurchases: Cents;
  onTimeStreak: number; stageComplete: boolean;
  seasonalBought: Record<string, number>;
  lastReject: string | null;
```

In `packages/sim/src/create.ts`, add to the returned object:

```ts
    orderGenAccum: 0, packAccum: 0, orderSeq: 0, deliverySeq: 0,
    dayRevenue: {}, dayOrders: {}, dayCommission: 0, dayPurchases: 0,
    onTimeStreak: 0, stageComplete: false, seasonalBought: {}, lastReject: null,
```

and change `seo: {}` to `seo: { [startIndustry]: UP.seoStart }` with `import { stages as ST, upgrades as UP } from '@shopflow/data';`

In `packages/sim/src/index.ts` add: `export { makeRng } from './rng.js';`

- [ ] **Step 4: Run all sim tests**

Run: `pnpm --filter @shopflow/sim test`
Expected: PASS (rng tests + 3 existing skeleton tests)

- [ ] **Step 5: Commit**

```bash
git add packages/sim
git commit -m "feat(sim): seeded rng + M1 state fields"
```

### Task 2: Calendar/environment multipliers (`env.ts`)

**Files:**
- Create: `packages/sim/src/env.ts`
- Modify: `packages/sim/src/index.ts`
- Test: `packages/sim/test/env.test.ts`

**Interfaces:**
- Produces:
  - `activeEvents(month: number, day: number): CalendarEvent[]` (raw entries from `calendar.events`)
  - `trafficEnvMult(clock: {minute:number; day:number; month:number}, industryId: string): number` — weekend × doubleDay × events × hour multiplier
  - `retailEnvMult(clock, industryId): number` — weekend(1.05) × doubleDay × event retailMult
  - `wholesaleEnvMult(clock, industryId): number` — weekend(0.95) × event wholesaleMult
  - `hourMult(minute: number): number`

- [ ] **Step 1: Write the failing test**

```ts
// packages/sim/test/env.test.ts
import { describe, it, expect } from 'vitest';
import { trafficEnvMult, retailEnvMult, wholesaleEnvMult, hourMult, activeEvents } from '../src/env.js';

const at = (month: number, day: number, minute = 9 * 60) => ({ minute, day, month });

describe('env multipliers', () => {
  it('weekday off-peak = 1', () => {
    expect(trafficEnvMult(at(1, 8), 'electronics')).toBe(1);
    expect(retailEnvMult(at(1, 8), 'electronics')).toBe(1);
  });
  it('weekend: traffic ×1.3, retail ×1.05, wholesale ×0.95', () => {
    expect(trafficEnvMult(at(1, 6), 'electronics')).toBeCloseTo(1.3);
    expect(retailEnvMult(at(1, 6), 'electronics')).toBeCloseTo(1.05);
    expect(wholesaleEnvMult(at(1, 6), 'electronics')).toBeCloseTo(0.95);
  });
  it('peak hour ×2, night ×0.5', () => {
    expect(hourMult(12 * 60)).toBe(2);
    expect(hourMult(3 * 60)).toBe(0.5);
    expect(hourMult(9 * 60)).toBe(1);
  });
  it('Valentine hits fashion only', () => {
    expect(activeEvents(2, 14).map(e => e.id)).toContain('valentine');
    expect(trafficEnvMult(at(2, 16), 'fashion')).toBe(1);           // after window
    expect(trafficEnvMult(at(2, 15), 'fashion')).toBeCloseTo(2.5);  // weekday, in window
    expect(trafficEnvMult(at(2, 15), 'electronics')).toBe(1);
    expect(retailEnvMult(at(2, 15), 'fashion')).toBeCloseTo(1.5);
  });
  it('double day (day === month): traffic ×3, retail ×2', () => {
    expect(trafficEnvMult(at(3, 3), 'electronics')).toBeCloseTo(3);
    expect(retailEnvMult(at(3, 3), 'electronics')).toBeCloseTo(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shopflow/sim exec vitest run test/env.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement env.ts**

```ts
// packages/sim/src/env.ts
import { calendar as CAL } from '@shopflow/data';

export interface EnvClock { minute: number; day: number; month: number }
type CalEvent = (typeof CAL.events)[number];

const inRange = (m: number, d: number, from: number[], to: number[]) =>
  m * 100 + d >= from[0] * 100 + from[1] && m * 100 + d <= to[0] * 100 + to[1];

export function activeEvents(month: number, day: number): CalEvent[] {
  return CAL.events.filter((e) => inRange(month, day, e.from, e.to));
}

const hits = (e: CalEvent, industryId: string) =>
  e.industries === 'all' || (e.industries as string[]).includes(industryId);

export function hourMult(minute: number): number {
  const h = Math.floor(minute / 60) % 24;
  if (CAL.hourly.peakHours.includes(h)) return 2; // flea/mall peakHourMult; social ×3 comes at màn 3
  if (CAL.hourly.nightHours.includes(h)) return CAL.hourly.nightMult;
  return 1;
}

export function trafficEnvMult(clock: EnvClock, industryId: string): number {
  let m = 1;
  if (CAL.weekendDays.includes(clock.day)) m *= CAL.weekend.trafficMult;
  if (clock.day === clock.month) m *= CAL.doubleDay.trafficMult;
  for (const e of activeEvents(clock.month, clock.day)) if (hits(e, industryId)) m *= e.trafficMult;
  return m;
}

export function retailEnvMult(clock: EnvClock, industryId: string): number {
  let m = 1;
  if (CAL.weekendDays.includes(clock.day)) m *= CAL.weekend.retailMult;
  if (clock.day === clock.month) m *= CAL.doubleDay.retailMult;
  for (const e of activeEvents(clock.month, clock.day))
    if (hits(e, industryId) && (e as any).retailMult) m *= (e as any).retailMult;
  return m;
}

export function wholesaleEnvMult(clock: EnvClock, industryId: string): number {
  let m = 1;
  if (CAL.weekendDays.includes(clock.day)) m *= CAL.weekend.wholesaleMult;
  for (const e of activeEvents(clock.month, clock.day))
    if (hits(e, industryId) && (e as any).wholesaleMult) m *= (e as any).wholesaleMult;
  return m;
}
```

Add to `packages/sim/src/index.ts`: `export * from './env.js';`

Note: the double-day test uses 3/3 (day 3 is not a weekend day); 1/1 and 2/2 would also collide with New Year — 3/3 avoids both.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shopflow/sim test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sim
git commit -m "feat(sim): calendar environment multipliers"
```

### Task 3: Order generation in tick

**Files:**
- Create: `packages/sim/src/orders.ts`
- Modify: `packages/sim/src/tick.ts`, `packages/sim/src/index.ts`
- Test: `packages/sim/test/orders.test.ts`

**Interfaces:**
- Consumes: `orderRate`, `channelWeights` (formulas.ts), env functions (Task 2).
- Produces: `genOrders(s: GameState, rng: Rng): GameState` — one 10-real-second generation pass. `tick` now: advances clock, accumulates `orderGenAccum`, and runs `genOrders` once per full 40 game-minutes. Orders are only generated for products with `inventory > 0` (design decision: keeps the 20-slot queue meaningful; noted deviation from spec which allows `waiting_stock`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/sim/test/orders.test.ts
import { describe, it, expect } from 'vitest';
import { createGame, tick, makeRng } from '../src/index.js';
import { genOrders } from '../src/orders.js';
import { stages as ST } from '@shopflow/data';

function stocked() {
  const s = createGame(42, 'electronics');
  s.inventory = { phone_case: 50, cable: 50 };
  return s;
}

describe('order generation', () => {
  it('creates orders only for stocked products, assigned to open channels', () => {
    const s = genOrders(stocked(), makeRng(1));
    expect(s.orders.length).toBeGreaterThan(0);
    for (const o of s.orders) {
      expect(['phone_case', 'cable']).toContain(o.productId);
      expect(o.channelId).toBe('flea');
      expect(o.slaLeft).toBe(ST.stages[0].sla);
      expect(o.state).toBe('queued');
      expect(o.value).toBeGreaterThan(0);
    }
  });
  it('no stock → no orders', () => {
    expect(genOrders(createGame(42, 'electronics'), makeRng(1)).orders).toHaveLength(0);
  });
  it('respects queue cap', () => {
    let s = stocked();
    const rng = makeRng(7);
    for (let i = 0; i < 200; i++) s = genOrders(s, rng);
    expect(s.orders.length).toBeLessThanOrEqual(ST.stages[0].queueCap);
  });
  it('tick fires generation every 40 game-minutes', () => {
    let s = stocked();
    const rng = makeRng(3);
    for (let i = 0; i < 10; i++) s = tick(s, 4, rng); // 40 min
    const after40 = s.orders.length;
    expect(after40).toBeGreaterThan(0);
    expect(s.orderGenAccum).toBeLessThan(40);
  });
  it('deterministic for same seed', () => {
    const a = genOrders(stocked(), makeRng(9));
    const b = genOrders(stocked(), makeRng(9));
    expect(a.orders).toEqual(b.orders);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shopflow/sim exec vitest run test/orders.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement orders.ts and wire into tick**

```ts
// packages/sim/src/orders.ts
import { industries as IND, stages as ST, upgrades as UP } from '@shopflow/data';
import type { GameState, Order, Rng } from './types.js';
import { orderRate, channelWeights } from './formulas.js';
import { trafficEnvMult, retailEnvMult, hourMult } from './env.js';

function pickWeighted(weights: [string, number][], rng: Rng): string {
  const total = weights.reduce((a, [, w]) => a + w, 0);
  let x = rng.next() * total;
  for (const [id, w] of weights) { x -= w; if (x <= 0) return id; }
  return weights[weights.length - 1][0];
}

/** Một lượt sinh đơn (mỗi 40 phút game = 10 giây thực, spec B5). */
export function genOrders(s: GameState, rng: Rng): GameState {
  const stage = ST.stages[s.stage - 1];
  const orders = [...s.orders];
  let seq = s.orderSeq;
  for (const indId of s.industries) {
    const ind = IND.industries.find((i) => i.id === indId)!;
    const weights = channelWeights(s, indId);
    if (!weights.length) continue;
    const env = trafficEnvMult(s.clock, indId) * hourMult(s.clock.minute);
    const retailM = retailEnvMult(s.clock, indId);
    for (const p of ind.products) {
      if (((p as any).unlockStage ?? 1) > s.stage) continue;
      if ((s.inventory[p.id] ?? 0) <= 0) continue;
      const r = orderRate(s, indId, s.seo[indId] ?? UP.seoStart, env);
      const per = r / 5;
      let n = Math.floor(per);
      if (rng.next() < per - n) n++;
      for (let k = 0; k < n; k++) {
        if (orders.length >= stage.queueCap) break;
        const order: Order = {
          id: `o${++seq}`, productId: p.id, industryId: indId,
          channelId: pickWeighted(weights, rng),
          value: Math.round(p.retail * retailM),
          slaLeft: stage.sla, state: 'queued',
        };
        orders.push(order);
      }
    }
  }
  return { ...s, orders, orderSeq: seq };
}
```

Rewrite `packages/sim/src/tick.ts`:

```ts
import type { GameState, Rng } from './types.js';
import { settleDay } from './settleDay.js';
import { genOrders } from './orders.js';

/** tick: 1 giây thực = +4 phút game (spec A3). Thuần túy, chỉ dùng rng. */
export function tick(s: GameState, dtGameMinutes: number, rng: Rng): GameState {
  let next: GameState = { ...s, clock: { ...s.clock, minute: s.clock.minute + dtGameMinutes } };
  next.orderGenAccum = s.orderGenAccum + dtGameMinutes;
  while (next.orderGenAccum >= 40) {
    next = genOrders(next, rng);
    next.orderGenAccum -= 40;
  }
  if (next.clock.minute >= 24 * 60) {
    next = settleDay(next);
    next.clock = { ...next.clock, minute: next.clock.minute - 24 * 60, day: next.clock.day + 1 };
    if (next.clock.day > 30) { next.clock.day = 1; next.clock.month++; }
    if (next.clock.month > 12) { next.clock.month = 1; next.clock.year++; }
  }
  return next;
}
```

Add to `index.ts`: `export { genOrders } from './orders.js';`

Existing skeleton test note: `settleDay trừ thuê kho…` passes a 16-hour dt in one call — generation runs but with no stock creates no orders, so it stays green.

- [ ] **Step 4: Run all sim tests**

Run: `pnpm --filter @shopflow/sim test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sim
git commit -m "feat(sim): order generation every 40 game-minutes"
```

### Task 4: Purchasing actions — buyRetail & buyBundle

**Files:**
- Create: `packages/sim/src/actions.ts`
- Modify: `packages/sim/src/index.ts`
- Test: `packages/sim/test/purchase.test.ts`

**Interfaces:**
- Consumes: `wholesaleEnvMult` (Task 2), Delivery type (Task 1).
- Produces:
  - `retailUnitPrice(s, productId): Cents` — `round(wholesale × 1.2 × tierMult(local=1) × gradeMult(B=1))` (relationship discount = M2)
  - `buyRetail(s, productId, qty, carrierId): GameState`
  - `buyBundle(s, industryId, bundleId, carrierId, seasonalId?): GameState` — seasonal applies `calendar.seasonalBundles` discount & limit
  - `pendingAuditCapacity(s): number` — `emptyCells × 500 − unchecked`
  - Both actions: reject (set `lastReject`) on insufficient funds, MOQ/max violation, stage lock, audit-space overflow; success → money↓, `dayPurchases`↑, new `Delivery` (grade 'B', supplier 'local', `daysLeft = max(0, baseDays + carrier.daysDelta)`, `state: daysLeft === 0 ? 'auditing' : 'shipping'`, `itemsTotal = Σ items`, `itemsChecked: 0`), `unchecked` += itemsTotal when arriving instantly.

- [ ] **Step 1: Write the failing test**

```ts
// packages/sim/test/purchase.test.ts
import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { buyRetail, buyBundle, retailUnitPrice } from '../src/actions.js';

describe('buyRetail', () => {
  it('charges wholesale×1.2×qty + carrier fee; standard = same-day audit', () => {
    const s = buyRetail(createGame(42, 'electronics'), 'phone_case', 10, 'standard');
    // 200×1.2=240 ×10 + 2000 ship = 4400
    expect(s.money).toBe(100000 - 4400);
    expect(s.dayPurchases).toBe(4400);
    expect(s.deliveries).toHaveLength(1);
    expect(s.deliveries[0].state).toBe('auditing');
    expect(s.deliveries[0].itemsTotal).toBe(10);
    expect(s.unchecked).toBe(10);
    expect(s.lastReject).toBeNull();
  });
  it('economy adds a day → shipping', () => {
    const s = buyRetail(createGame(42, 'electronics'), 'phone_case', 10, 'economy');
    expect(s.deliveries[0].state).toBe('shipping');
    expect(s.deliveries[0].daysLeft).toBe(1);
  });
  it('rejects below MOQ 5 and above 100', () => {
    expect(buyRetail(createGame(42, 'electronics'), 'phone_case', 4, 'standard').lastReject).toBeTruthy();
    expect(buyRetail(createGame(42, 'electronics'), 'phone_case', 101, 'standard').lastReject).toBeTruthy();
  });
  it('rejects when broke, state unchanged', () => {
    const s0 = createGame(42, 'electronics'); s0.money = 100;
    const s = buyRetail(s0, 'phone_case', 10, 'standard');
    expect(s.lastReject).toBeTruthy();
    expect(s.deliveries).toHaveLength(0);
    expect(s.money).toBe(100);
  });
  it('unit price helper', () => {
    expect(retailUnitPrice(createGame(42, 'electronics'), 'phone_case')).toBe(240);
  });
});

describe('buyBundle', () => {
  it('starter bundle: cost + ship, 1 day transit (standard)', () => {
    const s = buyBundle(createGame(42, 'electronics'), 'electronics', 'starter', 'standard');
    expect(s.money).toBe(100000 - 6000 - 2000);
    expect(s.deliveries[0].daysLeft).toBe(1);
    expect(s.deliveries[0].itemsTotal).toBe(25); // 15 ốp + 10 cáp
  });
  it('express shaves a day: starter arrives same tick', () => {
    const s = buyBundle(createGame(42, 'electronics'), 'electronics', 'starter', 'express');
    expect(s.deliveries[0].state).toBe('auditing');
  });
  it('stage-locked bundle rejected at stage 1', () => {
    const s = buyBundle(createGame(42, 'electronics'), 'electronics', 'audio', 'standard');
    expect(s.lastReject).toBeTruthy();
  });
  it('weekend wholesale ×0.95 applies to bundle cost', () => {
    const s0 = createGame(42, 'electronics'); s0.clock.day = 6;
    const s = buyBundle(s0, 'electronics', 'starter', 'standard');
    expect(s.money).toBe(100000 - Math.round(6000 * 0.95) - 2000);
  });
  it('audit space: rejects when pallets full', () => {
    const s0 = createGame(42, 'electronics');
    s0.unchecked = 8 * 500; // 8 ô trống của lưới 3×3 đã đầy
    const s = buyRetail(s0, 'phone_case', 10, 'standard');
    expect(s.lastReject).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shopflow/sim exec vitest run test/purchase.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement actions.ts (purchasing half)**

```ts
// packages/sim/src/actions.ts
import { industries as IND, suppliers as SUP, stages as ST, calendar as CAL } from '@shopflow/data';
import type { Cents, Delivery, GameState } from './types.js';
import { wholesaleEnvMult } from './env.js';

const ok = (s: GameState): GameState => ({ ...s, lastReject: null });
const reject = (s: GameState, msg: string): GameState => ({ ...s, lastReject: msg });

function findProduct(productId: string) {
  for (const ind of IND.industries)
    for (const p of ind.products) if (p.id === productId) return { ind, p };
  return null;
}

export function pendingAuditCapacity(s: GameState): number {
  const empty = s.grid.cells.filter((c) => c === null).length;
  return empty * ST.warehouse.uncheckedPerEmptyCell - s.unchecked;
}

export function retailUnitPrice(s: GameState, productId: string): Cents {
  const f = findProduct(productId)!;
  const tier = SUP.tiers.find((t) => t.id === 'local')!;
  return Math.round(f.p.wholesale * SUP.retail.priceMult * tier.costMult * SUP.grades.B.costMult);
}

function makeDelivery(s: GameState, items: Record<string, number>, cost: Cents, carrierId: string, baseDays: number): { s: GameState; d: Delivery } {
  const carrier = SUP.carriers.find((c) => c.id === carrierId)!;
  const daysLeft = Math.max(0, baseDays + carrier.daysDelta);
  const itemsTotal = Object.values(items).reduce((a, b) => a + b, 0);
  const d: Delivery = {
    id: `d${s.deliverySeq + 1}`, items, grade: 'B', supplierId: 'local', carrierId,
    cost, state: daysLeft === 0 ? 'auditing' : 'shipping', daysLeft, itemsTotal, itemsChecked: 0,
  };
  const next = {
    ...s, deliverySeq: s.deliverySeq + 1,
    money: s.money - cost, dayPurchases: s.dayPurchases + cost,
    deliveries: [...s.deliveries, d],
    unchecked: d.state === 'auditing' ? s.unchecked + itemsTotal : s.unchecked,
  };
  return { s: next, d };
}

export function buyRetail(s: GameState, productId: string, qty: number, carrierId: string): GameState {
  const f = findProduct(productId);
  if (!f || !s.industries.includes(f.ind.id)) return reject(s, 'Sản phẩm không thuộc ngành của bạn');
  if (((f.p as any).unlockStage ?? 1) > s.stage) return reject(s, `Mở ở màn ${(f.p as any).unlockStage}`);
  if (qty < SUP.retail.moqLocal) return reject(s, `Tối thiểu ${SUP.retail.moqLocal} sản phẩm`);
  if (qty > SUP.retail.maxPerOrder) return reject(s, `Tối đa ${SUP.retail.maxPerOrder} sản phẩm/lần`);
  const carrier = SUP.carriers.find((c) => c.id === carrierId);
  if (!carrier) return reject(s, 'Chưa chọn hãng vận chuyển');
  const cost = retailUnitPrice(s, productId) * qty + carrier.fee;
  if (s.money < cost) return reject(s, 'Không đủ tiền');
  if (qty > pendingAuditCapacity(s) && Math.max(0, 0 + carrier.daysDelta) === 0)
    return reject(s, 'Khu chờ kiểm đã đầy — cần ô trống');
  return ok(makeDelivery(s, { [productId]: qty }, cost, carrierId, 0).s);
}

export function buyBundle(s: GameState, industryId: string, bundleId: string, carrierId: string, seasonalId?: string): GameState {
  const ind = IND.industries.find((i) => i.id === industryId);
  if (!ind || !s.industries.includes(industryId)) return reject(s, 'Ngành chưa mở');
  const bundle = ind.bundles.find((b) => b.id === bundleId);
  if (!bundle) return reject(s, 'Không có gói này');
  if (bundle.unlockStage > s.stage) return reject(s, `Mở ở màn ${bundle.unlockStage}`);
  const carrier = SUP.carriers.find((c) => c.id === carrierId);
  if (!carrier) return reject(s, 'Chưa chọn hãng vận chuyển');
  let cost = bundle.cost * wholesaleEnvMult(s.clock, industryId);
  let seasonalBought = s.seasonalBought;
  if (seasonalId) {
    if (s.stage < 2) return reject(s, 'Gói mùa mở ở màn 2');
    const sb = CAL.seasonalBundles.find((x) => x.id === seasonalId);
    if (!sb) return reject(s, 'Không có gói mùa này');
    const [[fm, fd], [tm, td]] = sb.window;
    const a = s.clock.month * 100 + s.clock.day;
    if (a < fm * 100 + fd || a > tm * 100 + td) return reject(s, 'Ngoài cửa sổ gói mùa');
    if (sb.industries !== 'all' && !(sb.industries as string[]).includes(industryId)) return reject(s, 'Gói mùa không áp dụng ngành này');
    if ((s.seasonalBought[seasonalId] ?? 0) >= sb.limit) return reject(s, 'Hết lượt mua gói mùa');
    cost *= 1 - sb.discount;
    seasonalBought = { ...s.seasonalBought, [seasonalId]: (s.seasonalBought[seasonalId] ?? 0) + 1 };
  }
  cost = Math.round(cost) + carrier.fee;
  if (s.money < cost) return reject(s, 'Không đủ tiền');
  const itemsTotal = Object.values(bundle.items).reduce((a, b) => a + b, 0);
  if (Math.max(0, bundle.days + carrier.daysDelta) === 0 && itemsTotal > pendingAuditCapacity(s))
    return reject(s, 'Khu chờ kiểm đã đầy — cần ô trống');
  const r = makeDelivery({ ...s, seasonalBought }, bundle.items as Record<string, number>, cost, carrierId, bundle.days);
  return ok(r.s);
}
```

Add to `index.ts`: `export * from './actions.js';`

- [ ] **Step 4: Run all sim tests**

Run: `pnpm --filter @shopflow/sim test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sim
git commit -m "feat(sim): buyRetail and buyBundle purchasing actions"
```

### Task 5: Delivery pipeline — shipping countdown, audit, shelving

**Files:**
- Create: `packages/sim/src/logistics.ts`
- Modify: `packages/sim/src/tick.ts`, `packages/sim/src/settleDay.ts`, `packages/sim/src/index.ts`
- Test: `packages/sim/test/logistics.test.ts`

**Interfaces:**
- Consumes: Delivery shape (Task 1/4).
- Produces:
  - `advanceShipping(s): GameState` — called from `settleDay`: each shipping delivery `daysLeft−1`; at 0 → `state:'auditing'`, `unchecked += itemsTotal` (arrival ignores pallet cap — overflow simply queues; purchase-time check is the gate).
  - `runAudits(s, dtGameMinutes): GameState` — called each tick: audit throughput = `ΣpackerSpeed × 20 × (dt/60)` items across auditing deliveries (FIFO). Checked items go to shelf inventory, capped by `Σ shelf cap − Σ inventory`; items beyond shelf space stay unchecked in the delivery. Finished deliveries (all items shelved) are removed. `unchecked` recomputed as Σ un-shelved items of auditing deliveries.
  - `shelfCapacity(s): number`, `packerSpeedTotal(s): number` (exported for UI + later tasks).
  - `expediteDelivery(s, deliveryId): GameState` (in `actions.ts`) — "Nâng lên Hỏa tốc": only for `state:'shipping'` with a non-express carrier; pays `express.fee − currentCarrier.fee`, sets `carrierId:'express'`, `daysLeft −1`; at 0 the delivery flips to `auditing` and `unchecked += itemsTotal`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/sim/test/logistics.test.ts
import { describe, it, expect } from 'vitest';
import { createGame, tick, makeRng } from '../src/index.js';
import { buyRetail, buyBundle, expediteDelivery } from '../src/actions.js';
import { runAudits, shelfCapacity } from '../src/logistics.js';

const rng = makeRng(1);

function withShelf(s = createGame(42, 'electronics')) {
  s.grid.cells[0] = { type: 'shelf', level: 1 };
  return s;
}

describe('delivery pipeline', () => {
  it('shipping counts down at settleDay and lands as auditing', () => {
    let s = withShelf();
    s = buyBundle(s, 'electronics', 'starter', 'standard'); // 1 day
    expect(s.deliveries[0].state).toBe('shipping');
    s = tick(s, 16 * 60, rng); // qua 00:00
    expect(s.deliveries[0].state).toBe('auditing');
    expect(s.unchecked).toBe(25);
  });
  it('audit shelves items at packerSpeed×20/hour', () => {
    let s = withShelf();
    s = buyRetail(s, 'phone_case', 10, 'standard'); // auditing ngay
    // 1 bàn tốc độ 1.0 → 20 SP/giờ game → 10 SP sau 30 phút
    s = runAudits(s, 30);
    expect(s.inventory.phone_case).toBe(10);
    expect(s.deliveries).toHaveLength(0);
    expect(s.unchecked).toBe(0);
  });
  it('audit progresses fractionally via tick', () => {
    let s = withShelf();
    s = buyRetail(s, 'phone_case', 20, 'standard');
    s = tick(s, 4, rng); // 4 phút = 1.33 SP kiểm xong ~1
    expect(s.unchecked).toBe(20 - (s.inventory.phone_case ?? 0));
    for (let i = 0; i < 20; i++) s = tick(s, 4, rng);
    // sau 84 phút: 20 SP đã kiểm hết (một phần có thể đã bán qua đơn phát sinh)
    expect(s.unchecked).toBe(0);
  });
  it('expediteDelivery: trả phần chênh Express, về sớm 1 ngày', () => {
    let s = withShelf();
    s = buyBundle(s, 'electronics', 'starter', 'standard'); // 1 ngày
    const moneyBefore = s.money;
    s = expediteDelivery(s, s.deliveries[0].id);
    // chênh Express 4000 − Standard 2000 = 2000
    expect(s.money).toBe(moneyBefore - 2000);
    expect(s.deliveries[0].state).toBe('auditing'); // 1 − 1 = 0 ngày
    expect(s.unchecked).toBe(25);
    // đã là express → từ chối
    let s2 = withShelf();
    s2 = buyBundle(s2, 'electronics', 'power', 'express'); // 2−1 = 1 ngày shipping
    expect(expediteDelivery(s2, s2.deliveries[0].id).lastReject).toBeTruthy();
  });
  it('shelf space caps shelving; remainder stays unchecked', () => {
    let s = withShelf();               // 1 kệ cap 100
    s.inventory = { cable: 95 };       // còn 5 chỗ
    s = buyRetail(s, 'phone_case', 10, 'standard');
    s = runAudits(s, 60);
    expect(s.inventory.phone_case).toBe(5);
    expect(s.unchecked).toBe(5);
    expect(s.deliveries).toHaveLength(1); // chưa xong
  });
  it('no shelf → nothing shelves', () => {
    let s = createGame(42, 'electronics'); // không kệ
    expect(shelfCapacity(s)).toBe(0);
    s = buyRetail(s, 'phone_case', 10, 'standard');
    s = runAudits(s, 120);
    expect(s.inventory.phone_case ?? 0).toBe(0);
    expect(s.unchecked).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shopflow/sim exec vitest run test/logistics.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement logistics.ts and wire in**

```ts
// packages/sim/src/logistics.ts
import { stages as ST } from '@shopflow/data';
import type { GameState } from './types.js';

type Equip = { type: 'shelf' | 'packer' | 'robot'; level: 1 | 2 | 3 };
const equips = (s: GameState) =>
  s.grid.cells.filter((c): c is Equip => !!c && c.type !== 'pile');

export const packerSpeedTotal = (s: GameState) =>
  equips(s).filter((e) => e.type === 'packer')
    .reduce((a, e) => a + ST.warehouse.packer.levels[e.level - 1].speed, 0);

export const shelfCapacity = (s: GameState) =>
  equips(s).filter((e) => e.type === 'shelf')
    .reduce((a, e) => a + ST.warehouse.shelf.levels[e.level - 1].cap, 0);

/** Gọi từ settleDay: xe chạy qua đêm. */
export function advanceShipping(s: GameState): GameState {
  let unchecked = s.unchecked;
  const deliveries = s.deliveries.map((d) => {
    if (d.state !== 'shipping') return d;
    const daysLeft = d.daysLeft - 1;
    if (daysLeft <= 0) { unchecked += d.itemsTotal; return { ...d, daysLeft: 0, state: 'auditing' as const }; }
    return { ...d, daysLeft };
  });
  return { ...s, deliveries, unchecked };
}

/** Gọi mỗi tick: kiểm hàng = ΣtốcĐộBàn × 20 SP/giờ (spec B4). */
export function runAudits(s: GameState, dtGameMinutes: number): GameState {
  let budget = packerSpeedTotal(s) * ST.warehouse.auditPerPackerSpeedPerHour * (dtGameMinutes / 60);
  if (budget <= 0) return s;
  let space = shelfCapacity(s) - Object.values(s.inventory).reduce((a, b) => a + b, 0);
  if (space <= 0) return s;
  const inventory = { ...s.inventory };
  const deliveries = s.deliveries.map((d) => ({ ...d, items: { ...d.items } }));
  for (const d of deliveries) {
    if (d.state !== 'auditing') continue;
    if (budget <= 0 || space <= 0) break;
    let n = Math.min(Math.floor(budget), d.itemsTotal - d.itemsChecked, space);
    // giữ phần lẻ: cho phép kiểm dở 1 SP bằng cách tích lũy qua itemsChecked thực số
    const frac = Math.min(budget, d.itemsTotal - d.itemsChecked, space);
    n = Math.floor(d.itemsChecked + frac) - Math.floor(d.itemsChecked);
    d.itemsChecked = Math.min(d.itemsTotal, d.itemsChecked + frac);
    budget -= frac; space -= n;
    // phân bổ n SP đã kiểm vào tồn kho theo thứ tự items
    let left = n;
    for (const pid of Object.keys(d.items)) {
      const take = Math.min(d.items[pid], left);
      if (take > 0) { d.items[pid] -= take; inventory[pid] = (inventory[pid] ?? 0) + take; left -= take; }
    }
  }
  const remaining = deliveries.filter((d) => d.state !== 'auditing' || Object.values(d.items).some((v) => v > 0));
  const unchecked = remaining.filter((d) => d.state === 'auditing')
    .reduce((a, d) => a + Object.values(d.items).reduce((x, y) => x + y, 0), 0);
  return { ...s, deliveries: remaining, inventory, unchecked };
}
```

In `tick.ts`, after the order-generation loop and before the midnight check, add:

```ts
  next = runAudits(next, dtGameMinutes);
```
with `import { runAudits } from './logistics.js';`

In `settleDay.ts`, first line of the function: `s = advanceShipping(s);` with `import { advanceShipping } from './logistics.js';`

Append to `actions.ts`:

```ts
export function expediteDelivery(s: GameState, deliveryId: string): GameState {
  const d = s.deliveries.find((x) => x.id === deliveryId);
  if (!d || d.state !== 'shipping') return reject(s, 'Lô hàng không thể nâng cấp');
  if (d.carrierId === 'express') return reject(s, 'Đã là Hỏa tốc');
  const express = SUP.carriers.find((c) => c.id === 'express')!;
  const current = SUP.carriers.find((c) => c.id === d.carrierId)!;
  const extra = express.fee - current.fee;
  if (s.money < extra) return reject(s, 'Không đủ tiền');
  const daysLeft = d.daysLeft - 1;
  const arrived = daysLeft <= 0;
  const deliveries = s.deliveries.map((x) =>
    x.id === deliveryId
      ? { ...x, carrierId: 'express', daysLeft: Math.max(0, daysLeft), state: arrived ? ('auditing' as const) : ('shipping' as const) }
      : x);
  return ok({
    ...s, money: s.money - extra, dayPurchases: s.dayPurchases + extra, deliveries,
    unchecked: arrived ? s.unchecked + d.itemsTotal : s.unchecked,
  });
}
```

Add to `index.ts`: `export { advanceShipping, runAudits, shelfCapacity, packerSpeedTotal } from './logistics.js';`

Note on the fractional-audit trick: `itemsChecked` is a float accumulator; whole items move to shelves only when its floor advances. `n` (whole items) consumes shelf `space`; `frac` consumes the time `budget`.

- [ ] **Step 4: Run all sim tests**

Run: `pnpm --filter @shopflow/sim test`
Expected: PASS (also re-run orders/purchase suites — `tick` changed)

- [ ] **Step 5: Commit**

```bash
git add packages/sim
git commit -m "feat(sim): shipping countdown, audit throughput, shelving"
```

### Task 6: Fulfilment — packing, revenue, rating, combo, SLA

**Files:**
- Create: `packages/sim/src/fulfil.ts`
- Modify: `packages/sim/src/tick.ts`, `packages/sim/src/index.ts`
- Test: `packages/sim/test/fulfil.test.ts`

**Interfaces:**
- Consumes: `packerSpeedTotal`, `shelfCapacity` (Task 5); channel data.
- Produces:
  - `packCapacityPerSecond(s): number` — `Σ packer speed + (any shelf ? Σ robot speed × (adjacent-shelf ? 1.25 : 1) : 0)`
  - `comboBonus(streak: number): number` — `min(floor(streak/10) × 0.05, 0.5)`
  - `fulfilOrders(s, dtGameMinutes): GameState` — delivers `floor(packAccum)` oldest queued orders with stock; per order: inventory−1, `revenue = round(value × (1+combo))`, `commissionAmt = round(revenue × commission)` (level-3 channel −0.01), `money += revenue − commissionAmt`, day accumulators updated, rating +0.02 (max 5), streak+1, `completedOrders`/`ordersDelivered`+1
  - `expireSla(s, dtGameMinutes): GameState` — `slaLeft −= dt`; expired orders removed, rating −0.1 (min 1), streak → 0
  - `tick` calls, in order: genOrders loop → `runAudits` → `fulfilOrders` → `expireSla` → midnight rollover.

- [ ] **Step 1: Write the failing test**

```ts
// packages/sim/test/fulfil.test.ts
import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { fulfilOrders, expireSla, comboBonus, packCapacityPerSecond } from '../src/fulfil.js';
import type { Order } from '../src/types.js';

const order = (id: string, over: Partial<Order> = {}): Order => ({
  id, productId: 'phone_case', industryId: 'electronics', channelId: 'flea',
  value: 800, slaLeft: 1440, state: 'queued', ...over,
});

function ready() {
  const s = createGame(42, 'electronics'); // 1 bàn tốc độ 1.0 giữa lưới
  s.grid.cells[0] = { type: 'shelf', level: 1 };
  s.inventory = { phone_case: 10 };
  s.orders = [order('o1'), order('o2')];
  return s;
}

describe('fulfilment', () => {
  it('delivers capacity×dt orders: 1 packer → 1 đơn/giây thực (dt=4)', () => {
    let s = fulfilOrders(ready(), 4);
    expect(s.orders).toHaveLength(1);
    // 800 × (1−12% hoa hồng flea) = 704
    expect(s.money).toBe(100000 + 704);
    expect(s.dayRevenue.flea).toBe(800);
    expect(s.dayCommission).toBe(96);
    expect(s.dayOrders.flea).toBe(1);
    expect(s.rating).toBeCloseTo(4.02);
    expect(s.completedOrders).toBe(1);
    expect(s.inventory.phone_case).toBe(9);
    expect(s.onTimeStreak).toBe(1);
  });
  it('no stock → order waits', () => {
    const s0 = ready(); s0.inventory = {};
    const s = fulfilOrders(s0, 4);
    expect(s.orders).toHaveLength(2);
    expect(s.money).toBe(100000);
  });
  it('combo: 10 on-time → +5% revenue', () => {
    expect(comboBonus(9)).toBe(0);
    expect(comboBonus(10)).toBeCloseTo(0.05);
    expect(comboBonus(200)).toBeCloseTo(0.5);
    const s0 = ready(); s0.onTimeStreak = 10;
    const s = fulfilOrders(s0, 4);
    expect(s.dayRevenue.flea).toBe(Math.round(800 * 1.05));
  });
  it('robot counts only with a shelf, +25% adjacent', () => {
    const s = createGame(42, 'electronics'); // packer ở ô 4 (giữa 3×3)
    expect(packCapacityPerSecond(s)).toBe(1);
    s.grid.cells[0] = { type: 'robot', level: 1 }; // 0.5, không kệ → không tính
    expect(packCapacityPerSecond(s)).toBe(1);
    s.grid.cells[1] = { type: 'shelf', level: 1 }; // ô 1 kề ô 0
    expect(packCapacityPerSecond(s)).toBeCloseTo(1 + 0.5 * 1.25);
  });
  it('SLA expiry: đơn rơi, −0.1 rating, combo reset', () => {
    const s0 = ready(); s0.onTimeStreak = 25;
    s0.orders = [order('o1', { slaLeft: 3 })];
    const s = expireSla(s0, 4);
    expect(s.orders).toHaveLength(0);
    expect(s.rating).toBeCloseTo(3.9);
    expect(s.onTimeStreak).toBe(0);
    expect(s.combo).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shopflow/sim exec vitest run test/fulfil.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement fulfil.ts and wire into tick**

```ts
// packages/sim/src/fulfil.ts
import { channels as CH, stages as ST } from '@shopflow/data';
import type { GameState } from './types.js';

type Equip = { type: 'shelf' | 'packer' | 'robot'; level: 1 | 2 | 3 };

const neighbors = (i: number, size: number): number[] => {
  const r = Math.floor(i / size), c = i % size, out: number[] = [];
  if (r > 0) out.push(i - size);
  if (r < size - 1) out.push(i + size);
  if (c > 0) out.push(i - 1);
  if (c < size - 1) out.push(i + 1);
  return out;
};

export function packCapacityPerSecond(s: GameState): number {
  const cells = s.grid.cells;
  const hasShelf = cells.some((c) => c?.type === 'shelf');
  let cap = 0;
  cells.forEach((c, i) => {
    if (!c || c.type === 'pile') return;
    const e = c as Equip;
    if (e.type === 'packer') cap += ST.warehouse.packer.levels[e.level - 1].speed;
    if (e.type === 'robot' && hasShelf) {
      const adj = neighbors(i, s.grid.size).some((j) => cells[j]?.type === 'shelf');
      cap += ST.warehouse.robot.levels[e.level - 1].speed * (adj ? 1 + ST.warehouse.robot.adjacentShelfBonus : 1);
    }
  });
  return cap;
}

export const comboBonus = (streak: number): number =>
  Math.min(Math.floor(streak / ST.combo.ordersPerStep) * ST.combo.bonusPerStep, ST.combo.maxBonus);

export function commissionOf(s: GameState, channelId: string): number {
  const def = CH.channels.find((d) => d.id === channelId)!;
  const st = s.channels.find((c) => c.id === channelId);
  let com = def.commission;
  if (st && st.level >= 3) com += CH.levelBonus['3'].commissionDelta;
  return Math.max(0, com);
}

/** Đóng gói giao: capacity đơn / giây thực (dt=4 phút game = 1 giây thực). */
export function fulfilOrders(s: GameState, dtGameMinutes: number): GameState {
  let accum = s.packAccum + packCapacityPerSecond(s) * (dtGameMinutes / 4);
  let n = Math.floor(accum);
  if (n <= 0) return { ...s, packAccum: accum };
  accum -= n;
  const inventory = { ...s.inventory };
  const dayRevenue = { ...s.dayRevenue }, dayOrders = { ...s.dayOrders };
  let { money, rating, dayCommission, onTimeStreak, completedOrders } = s;
  const channels = s.channels.map((c) => ({ ...c }));
  const remaining = [] as typeof s.orders;
  for (const o of s.orders) {
    if (n > 0 && (inventory[o.productId] ?? 0) > 0) {
      n--;
      inventory[o.productId]--;
      const revenue = Math.round(o.value * (1 + comboBonus(onTimeStreak)));
      const comAmt = Math.round(revenue * commissionOf(s, o.channelId));
      money += revenue - comAmt;
      dayRevenue[o.channelId] = (dayRevenue[o.channelId] ?? 0) + revenue;
      dayOrders[o.channelId] = (dayOrders[o.channelId] ?? 0) + 1;
      dayCommission += comAmt;
      rating = Math.min(ST.rating.max, rating + ST.rating.perDelivered);
      onTimeStreak++;
      completedOrders++;
      const ch = channels.find((c) => c.id === o.channelId);
      if (ch) ch.ordersDelivered++;
    } else remaining.push(o);
  }
  return {
    ...s, packAccum: accum, inventory, orders: remaining, money, rating,
    dayRevenue, dayOrders, dayCommission, onTimeStreak, completedOrders,
    channels, combo: comboBonus(onTimeStreak), bestCombo: Math.max(s.bestCombo, comboBonus(onTimeStreak)),
  };
}

export function expireSla(s: GameState, dtGameMinutes: number): GameState {
  let rating = s.rating, streak = s.onTimeStreak, expired = 0;
  const orders = s.orders.flatMap((o) => {
    const slaLeft = o.slaLeft - dtGameMinutes;
    if (slaLeft <= 0) {
      expired++;
      rating = Math.max(ST.rating.min, rating + ST.rating.perCancelled);
      streak = 0;
      return [];
    }
    return [{ ...o, slaLeft }];
  });
  if (!expired) return { ...s, orders };
  return { ...s, orders, rating, onTimeStreak: streak, combo: comboBonus(streak) };
}
```

In `tick.ts`, after `runAudits`:

```ts
  next = fulfilOrders(next, dtGameMinutes);
  next = expireSla(next, dtGameMinutes);
```
with `import { fulfilOrders, expireSla } from './fulfil.js';`

Add to `index.ts`: `export { fulfilOrders, expireSla, comboBonus, packCapacityPerSecond, commissionOf } from './fulfil.js';`

Note: the existing skeleton test "settleDay trừ thuê kho" tick(16h) has no stock/orders, so money math is unchanged.

- [ ] **Step 4: Run all sim tests**

Run: `pnpm --filter @shopflow/sim test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sim
git commit -m "feat(sim): packing, revenue, rating, combo, SLA expiry"
```

### Task 7: Warehouse actions — equipment & grid

**Files:**
- Modify: `packages/sim/src/actions.ts`
- Test: `packages/sim/test/warehouse.test.ts`

**Interfaces:**
- Produces (appended to actions.ts):
  - `placeEquipment(s, cellIndex, type: 'shelf'|'packer'|'robot'): GameState` — cost `ST.warehouse[type].place`; robot needs stage ≥ `ST.warehouse.robot.unlockStage` (2); cell must be empty
  - `upgradeEquipment(s, cellIndex): GameState` — next level cost `levels[level].cost`, gated by its `unlockStage` (all ≥3 → always rejected in M1; implement generically)
  - `removeEquipment(s, cellIndex): GameState` — costs `ST.warehouse.demolish` (búa $10); shelves can only be removed if remaining shelf capacity ≥ current stock
  - `expandGrid(s): GameState` — next grid from `ST.warehouse.grids`, stage-gated; existing cells copied into the new larger array top-left (row-major: new index = `row × newSize + col`)

- [ ] **Step 1: Write the failing test**

```ts
// packages/sim/test/warehouse.test.ts
import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { placeEquipment, upgradeEquipment, removeEquipment, expandGrid } from '../src/actions.js';

describe('warehouse actions', () => {
  it('places a shelf for $40', () => {
    const s = placeEquipment(createGame(42, 'electronics'), 0, 'shelf');
    expect(s.money).toBe(100000 - 4000);
    expect(s.grid.cells[0]).toEqual({ type: 'shelf', level: 1 });
    expect(s.lastReject).toBeNull();
  });
  it('rejects occupied cell (packer có sẵn ở ô 4)', () => {
    expect(placeEquipment(createGame(42, 'electronics'), 4, 'shelf').lastReject).toBeTruthy();
  });
  it('robot locked at stage 1', () => {
    expect(placeEquipment(createGame(42, 'electronics'), 0, 'robot').lastReject).toBeTruthy();
    const s2 = createGame(42, 'electronics'); s2.stage = 2;
    expect(placeEquipment(s2, 0, 'robot').lastReject).toBeNull();
  });
  it('equipment upgrades are stage-3 locked in M1', () => {
    expect(upgradeEquipment(createGame(42, 'electronics'), 4).lastReject).toBeTruthy();
  });
  it('remove costs $10 and frees the cell', () => {
    let s = placeEquipment(createGame(42, 'electronics'), 0, 'shelf');
    s = removeEquipment(s, 0);
    expect(s.grid.cells[0]).toBeNull();
    expect(s.money).toBe(100000 - 4000 - 1000);
  });
  it('cannot remove a shelf holding needed stock', () => {
    let s = placeEquipment(createGame(42, 'electronics'), 0, 'shelf');
    s.inventory = { phone_case: 50 };
    expect(removeEquipment(s, 0).lastReject).toBeTruthy();
  });
  it('expandGrid: stage 2 → 4×4 for $400, cells preserved row-major', () => {
    const s0 = createGame(42, 'electronics'); s0.stage = 2;
    const s = expandGrid(s0);
    expect(s.grid.size).toBe(4);
    expect(s.money).toBe(100000 - 40000);
    expect(s.grid.cells).toHaveLength(16);
    expect(s.grid.cells[1 * 4 + 1]).toEqual({ type: 'packer', level: 1 }); // ô (1,1) cũ
    expect(expandGrid(createGame(42, 'electronics')).lastReject).toBeTruthy(); // stage 1
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shopflow/sim exec vitest run test/warehouse.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Append implementations to actions.ts**

```ts
// append to packages/sim/src/actions.ts  (ok/reject helpers already exist)
import { shelfCapacity } from './logistics.js'; // add to imports at top

export function placeEquipment(s: GameState, cellIndex: number, type: 'shelf' | 'packer' | 'robot'): GameState {
  if (cellIndex < 0 || cellIndex >= s.grid.cells.length) return reject(s, 'Ô không hợp lệ');
  if (s.grid.cells[cellIndex] !== null) return reject(s, 'Ô đã có thiết bị');
  const def = ST.warehouse[type];
  if ((def as any).unlockStage && (def as any).unlockStage > s.stage)
    return reject(s, `Mở ở màn ${(def as any).unlockStage}`);
  if (s.money < def.place) return reject(s, 'Không đủ tiền');
  const cells = [...s.grid.cells];
  cells[cellIndex] = { type, level: 1 };
  return ok({ ...s, money: s.money - def.place, grid: { ...s.grid, cells } });
}

export function upgradeEquipment(s: GameState, cellIndex: number): GameState {
  const cell = s.grid.cells[cellIndex];
  if (!cell || cell.type === 'pile') return reject(s, 'Không có thiết bị ở ô này');
  const levels = ST.warehouse[cell.type].levels as { cost?: number; unlockStage?: number }[];
  const nextLv = levels[cell.level]; // level là 1-based, mảng 0-based → phần tử kế
  if (!nextLv) return reject(s, 'Đã cấp tối đa');
  if ((nextLv.unlockStage ?? 1) > s.stage) return reject(s, `Mở ở màn ${nextLv.unlockStage}`);
  if (s.money < (nextLv.cost ?? 0)) return reject(s, 'Không đủ tiền');
  const cells = [...s.grid.cells];
  cells[cellIndex] = { ...cell, level: (cell.level + 1) as 2 | 3 };
  return ok({ ...s, money: s.money - (nextLv.cost ?? 0), grid: { ...s.grid, cells } });
}

export function removeEquipment(s: GameState, cellIndex: number): GameState {
  const cell = s.grid.cells[cellIndex];
  if (!cell || cell.type === 'pile') return reject(s, 'Không có thiết bị ở ô này');
  if (s.money < ST.warehouse.demolish) return reject(s, 'Không đủ tiền');
  if (cell.type === 'shelf') {
    const stock = Object.values(s.inventory).reduce((a, b) => a + b, 0);
    const capAfter = shelfCapacity(s) - ST.warehouse.shelf.levels[cell.level - 1].cap;
    if (stock > capAfter) return reject(s, 'Kệ còn hàng — bán bớt trước khi gỡ');
  }
  const cells = [...s.grid.cells];
  cells[cellIndex] = null;
  return ok({ ...s, money: s.money - ST.warehouse.demolish, grid: { ...s.grid, cells } });
}

export function expandGrid(s: GameState): GameState {
  const next = ST.warehouse.grids.find((g) => g.size === s.grid.size + 1);
  if (!next) return reject(s, 'Đã là kho lớn nhất');
  if ((next as any).unlockStage > s.stage) return reject(s, `Mở ở màn ${(next as any).unlockStage}`);
  if (s.money < next.cost) return reject(s, 'Không đủ tiền');
  const size = next.size;
  const cells = Array<(typeof s.grid.cells)[number]>(size * size).fill(null);
  s.grid.cells.forEach((c, i) => {
    const r = Math.floor(i / s.grid.size), col = i % s.grid.size;
    cells[r * size + col] = c;
  });
  return ok({ ...s, money: s.money - next.cost, grid: { size, cells } });
}
```

- [ ] **Step 4: Run all sim tests**

Run: `pnpm --filter @shopflow/sim test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sim
git commit -m "feat(sim): equipment placement, upgrade, removal, grid expansion"
```

### Task 8: Channel actions + MegaMall rating lock

**Files:**
- Modify: `packages/sim/src/actions.ts`, `packages/sim/src/settleDay.ts`, `packages/sim/src/types.ts`
- Test: `packages/sim/test/channels.test.ts`

**Interfaces:**
- `ChannelState` gains `ratingLocked: boolean` (default false; add `ratingLocked: false` to the flea channel in `createGame` — update `create.ts` too).
- Produces:
  - `openChannel(s, channelId): GameState` — stage-gated (`unlockStage`), pays `openCost`, adds `{id, open: true, suspended: false, ratingLocked: false, level: 1, ordersDelivered: 0}`; rejects if `minRating` unmet
  - `upgradeChannel(s, channelId): GameState` — level 2 costs `openCost × levelBonus['2'].costMult`, level 3 `openCost × levelBonus['3'].costMult`; max 3. flea (openCost 0) upgrades are free by data — accept that (data-driven).
  - `setChannelOpen(s, channelId, open: boolean): GameState` — "Tạm đóng" toggle; cannot close flea? (spec silent — allow closing any but flea has no fee; allow all)
  - In `settleDay`: mall with rating < `minRating` → `ratingLocked: true`; if locked and rating ≥ minRating at settle → unlock. `orderRate`/`channelWeights` must skip `ratingLocked` channels — update `formulas.ts` filters from `c.open && !c.suspended` to also `!c.ratingLocked`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/sim/test/channels.test.ts
import { describe, it, expect } from 'vitest';
import { createGame, tick, makeRng, orderRate } from '../src/index.js';
import { openChannel, upgradeChannel, setChannelOpen } from '../src/actions.js';

const rng = makeRng(1);
const atStage2 = () => { const s = createGame(42, 'electronics'); s.stage = 2; return s; };

describe('channels', () => {
  it('mall locked at stage 1, opens at stage 2 for $200', () => {
    expect(openChannel(createGame(42, 'electronics'), 'mall').lastReject).toBeTruthy();
    const s = openChannel(atStage2(), 'mall');
    expect(s.lastReject).toBeNull();
    expect(s.money).toBe(100000 - 20000);
    expect(s.channels.map(c => c.id)).toContain('mall');
  });
  it('upgrade: level 2 = openCost×2', () => {
    let s = openChannel(atStage2(), 'mall');
    s = upgradeChannel(s, 'mall');
    expect(s.channels.find(c => c.id === 'mall')!.level).toBe(2);
    expect(s.money).toBe(100000 - 20000 - 40000);
  });
  it('tạm đóng removes channel from order rate', () => {
    let s = openChannel(atStage2(), 'mall');
    const before = orderRate(s, 'electronics', 40, 1);
    s = setChannelOpen(s, 'mall', false);
    expect(orderRate(s, 'electronics', 40, 1)).toBeLessThan(before);
  });
  it('mall rating-locks at settleDay when rating < 3.5, unlocks when recovered', () => {
    let s = openChannel(atStage2(), 'mall');
    s.rating = 3.0;
    s = tick(s, 16 * 60, rng); // qua 00:00
    expect(s.channels.find(c => c.id === 'mall')!.ratingLocked).toBe(true);
    // mall bị khóa → không đóng góp vào tốc độ đơn
    const fleaOnly = { ...s, channels: s.channels.filter(c => c.id === 'flea') };
    expect(orderRate(s, 'electronics', 40, 1)).toBeCloseTo(orderRate(fleaOnly as any, 'electronics', 40, 1));
    s.rating = 3.8;
    s = tick(s, 24 * 60, rng); // thêm 1 ngày
    expect(s.channels.find(c => c.id === 'mall')!.ratingLocked).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shopflow/sim exec vitest run test/channels.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement**

`types.ts`: add `ratingLocked: boolean` to `ChannelState`. `create.ts`: add `ratingLocked: false` to the flea entry.

`formulas.ts`: in both `orderRate` and `channelWeights` change the skip condition to `if (!c.open || c.suspended || c.ratingLocked) continue;` (and the filter equivalent).

Append to `actions.ts` (`import { channels as CH } from '@shopflow/data';` added to top imports):

```ts
export function openChannel(s: GameState, channelId: string): GameState {
  const def = CH.channels.find((d) => d.id === channelId);
  if (!def) return reject(s, 'Không có kênh này');
  if (s.channels.some((c) => c.id === channelId)) return reject(s, 'Kênh đã mở');
  if (def.unlockStage > s.stage) return reject(s, `Mở ở màn ${def.unlockStage}`);
  if ((def as any).minRating && s.rating < (def as any).minRating)
    return reject(s, `Cần Rating ≥ ${(def as any).minRating}`);
  if (s.money < def.openCost) return reject(s, 'Không đủ tiền');
  return ok({
    ...s, money: s.money - def.openCost,
    channels: [...s.channels, { id: channelId, open: true, suspended: false, ratingLocked: false, level: 1 as const, ordersDelivered: 0 }],
  });
}

export function upgradeChannel(s: GameState, channelId: string): GameState {
  const def = CH.channels.find((d) => d.id === channelId);
  const st = s.channels.find((c) => c.id === channelId);
  if (!def || !st) return reject(s, 'Kênh chưa mở');
  if (st.level >= 3) return reject(s, 'Đã cấp tối đa');
  const cost = def.openCost * CH.levelBonus[String(st.level + 1) as '2' | '3'].costMult;
  if (s.money < cost) return reject(s, 'Không đủ tiền');
  return ok({
    ...s, money: s.money - cost,
    channels: s.channels.map((c) => (c.id === channelId ? { ...c, level: (c.level + 1) as 2 | 3 } : c)),
  });
}

export function setChannelOpen(s: GameState, channelId: string, open: boolean): GameState {
  if (!s.channels.some((c) => c.id === channelId)) return reject(s, 'Kênh chưa mở');
  return ok({ ...s, channels: s.channels.map((c) => (c.id === channelId ? { ...c, open } : c)) });
}
```

In `settleDay.ts`, after the fee-payment logic (operating on the final channel array before return), add:

```ts
  const rated = paid.map((c: any) => {
    const def = CH.channels.find((d) => d.id === c.id)!;
    if (!(def as any).minRating) return c;
    if (s.rating < (def as any).minRating) return { ...c, ratingLocked: true };
    if (c.ratingLocked && s.rating >= (def as any).minRating) return { ...c, ratingLocked: false };
    return c;
  });
```
and return `rated` (mapped to strip `fee`) instead of `paid`.

- [ ] **Step 4: Run all sim tests**

Run: `pnpm --filter @shopflow/sim test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sim
git commit -m "feat(sim): channel open/upgrade/pause + MegaMall rating lock"
```

### Task 9: SEO + second industry

**Files:**
- Modify: `packages/sim/src/actions.ts`
- Test: `packages/sim/test/seo-industry.test.ts`

**Interfaces:**
- Produces:
  - `buySeo(s, industryId): GameState` — next campaign from `upgrades.seoCampaigns` above current score; level `unlockStage` gate (level 3 → màn 3); SEO levels 1–2 themselves require stage ≥ 2 (unlock `'seo-1-2'`)
  - `chooseIndustry(s, industryId): GameState` — only when `s.industries.length < s.stage` and industry has `unlock: 'start-option'`; adds industry with `seo[industryId] = seoStart`

- [ ] **Step 1: Write the failing test**

```ts
// packages/sim/test/seo-industry.test.ts
import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { buySeo, chooseIndustry } from '../src/actions.js';

const atStage2 = () => { const s = createGame(42, 'electronics'); s.stage = 2; return s; };

describe('SEO', () => {
  it('locked at stage 1', () => {
    expect(buySeo(createGame(42, 'electronics'), 'electronics').lastReject).toBeTruthy();
  });
  it('level 1: $160 → score 55; level 2: $400 → 70; level 3 stage-locked', () => {
    let s = buySeo(atStage2(), 'electronics');
    expect(s.seo.electronics).toBe(55);
    expect(s.money).toBe(100000 - 16000);
    s = buySeo(s, 'electronics');
    expect(s.seo.electronics).toBe(70);
    expect(buySeo(s, 'electronics').lastReject).toBeTruthy(); // cấp 3 → màn 3
  });
});

describe('chooseIndustry', () => {
  it('stage 2 unlocks a second industry with SEO 40', () => {
    expect(chooseIndustry(createGame(42, 'electronics'), 'fashion').lastReject).toBeTruthy();
    const s = chooseIndustry(atStage2(), 'fashion');
    expect(s.industries).toEqual(['electronics', 'fashion']);
    expect(s.seo.fashion).toBe(40);
  });
  it('rejects duplicates and non-starter industries', () => {
    expect(chooseIndustry(atStage2(), 'electronics').lastReject).toBeTruthy();
    expect(chooseIndustry(atStage2(), 'books').lastReject).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shopflow/sim exec vitest run test/seo-industry.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement** (append to actions.ts; add `upgrades as UP` to the `@shopflow/data` import)

```ts
export function buySeo(s: GameState, industryId: string): GameState {
  if (!s.industries.includes(industryId)) return reject(s, 'Ngành chưa mở');
  if (s.stage < 2) return reject(s, 'SEO mở ở màn 2');
  const current = s.seo[industryId] ?? UP.seoStart;
  const next = UP.seoCampaigns.find((c) => c.score > current);
  if (!next) return reject(s, 'SEO đã tối đa');
  if (((next as any).unlockStage ?? 1) > s.stage) return reject(s, `Cấp ${next.level} mở ở màn ${(next as any).unlockStage}`);
  if (s.money < next.cost) return reject(s, 'Không đủ tiền');
  return ok({ ...s, money: s.money - next.cost, seo: { ...s.seo, [industryId]: next.score } });
}

export function chooseIndustry(s: GameState, industryId: string): GameState {
  const ind = IND.industries.find((i) => i.id === industryId);
  if (!ind || ind.unlock !== 'start-option') return reject(s, 'Ngành này chưa thể mở');
  if (s.industries.includes(industryId)) return reject(s, 'Ngành đã mở');
  if (s.industries.length >= s.stage) return reject(s, 'Chưa mở thêm ngành ở màn này');
  return ok({ ...s, industries: [...s.industries, industryId], seo: { ...s.seo, [industryId]: UP.seoStart } });
}
```

- [ ] **Step 4: Run all sim tests**

Run: `pnpm --filter @shopflow/sim test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sim
git commit -m "feat(sim): SEO campaigns and second-industry choice"
```

### Task 10: settleDay day report + stage progression

**Files:**
- Create: `packages/sim/src/stageCheck.ts`
- Modify: `packages/sim/src/settleDay.ts`, `packages/sim/src/tick.ts`, `packages/sim/src/actions.ts`, `packages/sim/src/index.ts`
- Test: `packages/sim/test/settle-stage.test.ts`

**Interfaces:**
- `settleDay` now writes real `DayReport`: `revenueByChannel = s.dayRevenue`, `ordersByChannel = s.dayOrders`, `commission = s.dayCommission`, `purchases = s.dayPurchases`, `net = Σrevenue − commission − channelFees − rent − maintenance − purchases`; then resets the four day accumulators to `{}`/`0`.
- Produces:
  - `checkStage(s): GameState` — sets `stageComplete: true` when `s.money ≥ goal.money && s.completedOrders ≥ goal.orders && s.rating ≥ goal.rating` (goal of current stage) and not already complete; called at the end of `tick`.
  - `advanceStage(s): GameState` (action) — requires `stageComplete`; `money += reward`, `stage += 1`, `stageComplete = false`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/sim/test/settle-stage.test.ts
import { describe, it, expect } from 'vitest';
import { createGame, tick, makeRng } from '../src/index.js';
import { advanceStage } from '../src/actions.js';

const rng = makeRng(1);

describe('settleDay report', () => {
  it('folds day accumulators into the report and resets them', () => {
    let s = createGame(42, 'electronics');
    s.dayRevenue = { flea: 5000 }; s.dayOrders = { flea: 6 };
    s.dayCommission = 600; s.dayPurchases = 2000;
    s = tick(s, 16 * 60, rng);
    const r = s.reports[0];
    expect(r.revenueByChannel).toEqual({ flea: 5000 });
    expect(r.ordersByChannel).toEqual({ flea: 6 });
    expect(r.commission).toBe(600);
    expect(r.purchases).toBe(2000);
    // net = 5000 − 600 − 0 phí kênh − 1800 thuê − 100 bảo trì − 2000 = 500
    expect(r.net).toBe(500);
    expect(s.dayRevenue).toEqual({});
    expect(s.dayCommission).toBe(0);
  });
});

describe('stage progression', () => {
  it('flags stageComplete when all goals met', () => {
    let s = createGame(42, 'electronics');
    s.money = 160000; s.completedOrders = 50; s.rating = 3.5;
    s = tick(s, 4, rng);
    expect(s.stageComplete).toBe(true);
  });
  it('not before goals', () => {
    let s = createGame(42, 'electronics');
    s.money = 160000; s.completedOrders = 49; s.rating = 4;
    s = tick(s, 4, rng);
    expect(s.stageComplete).toBe(false);
  });
  it('advanceStage pays reward and bumps stage', () => {
    let s = createGame(42, 'electronics');
    s.stageComplete = true; s.money = 160000;
    s = advanceStage(s);
    expect(s.stage).toBe(2);
    expect(s.money).toBe(160000 + 40000);
    expect(s.stageComplete).toBe(false);
    expect(advanceStage(createGame(42, 'electronics')).lastReject).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shopflow/sim exec vitest run test/settle-stage.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

`stageCheck.ts`:

```ts
// packages/sim/src/stageCheck.ts
import { stages as ST } from '@shopflow/data';
import type { GameState } from './types.js';

export function checkStage(s: GameState): GameState {
  if (s.stageComplete) return s;
  const goal = ST.stages[s.stage - 1]?.goal;
  if (!goal) return s;
  if (s.money >= goal.money && s.completedOrders >= goal.orders && s.rating >= goal.rating)
    return { ...s, stageComplete: true };
  return s;
}
```

`settleDay.ts` — replace the placeholder `report` construction with:

```ts
  const revenue = Object.values(s.dayRevenue).reduce((a, b) => a + b, 0);
  const report: DayReport = {
    day: s.clock.day, month: s.clock.month,
    revenueByChannel: s.dayRevenue, ordersByChannel: s.dayOrders,
    commission: s.dayCommission, channelFees, rent, maintenance,
    purchases: s.dayPurchases, other: 0,
    net: revenue - s.dayCommission - channelFees - rent - maintenance - s.dayPurchases,
  };
```
and add to the returned state: `dayRevenue: {}, dayOrders: {}, dayCommission: 0, dayPurchases: 0,`

`tick.ts` — last line before `return next;`: `next = checkStage(next);` with import.

`actions.ts` — append:

```ts
export function advanceStage(s: GameState): GameState {
  if (!s.stageComplete) return reject(s, 'Chưa hoàn thành mục tiêu màn');
  const reward = ST.stages[s.stage - 1].reward ?? 0;
  return ok({ ...s, money: s.money + reward, stage: s.stage + 1, stageComplete: false });
}
```

`index.ts`: `export { checkStage } from './stageCheck.js';`

- [ ] **Step 4: Run all sim tests**

Run: `pnpm --filter @shopflow/sim test`
Expected: PASS (existing skeleton settle test still asserts money − 1900 — unchanged since accumulators are 0 there)

- [ ] **Step 5: Commit**

```bash
git add packages/sim
git commit -m "feat(sim): real day reports and stage progression"
```

### Task 11: Balance harness

**Files:**
- Create: `packages/sim/test/harness.test.ts`

**Interfaces:**
- Consumes: everything above. A scripted bot plays stage 1 headless via public exports only.
- The three assertions from the spec: stage 1 in 900–1500 ticks; commission 5–12% of gross revenue; cumulative net positive from day 2 (reports[1] onward each ≥ 0 is too strict — assert `reports[i].net > 0` for every full day `i ≥ 1` that has sales).
- **If the harness fails on timing:** first improve the bot policy (buy more/earlier stock, second packer sooner); only touch `packages/data` numbers if the policy is clearly optimal and still out of range — and flag the data change in the commit message for review.

- [ ] **Step 1: Write the harness (it IS the test)**

```ts
// packages/sim/test/harness.test.ts
import { describe, it, expect } from 'vitest';
import { createGame, tick, makeRng, retailUnitPrice } from '../src/index.js';
import { buyRetail, buyBundle, placeEquipment } from '../src/actions.js';
import type { GameState } from '../src/types.js';

/** Bot màn 1: chiến lược đơn giản của người chơi biết chơi (spec Phần E). */
function botAct(s: GameState): GameState {
  // Thiết bị: 1 kệ + bàn thứ 2 sớm nhất có thể
  const shelfCount = s.grid.cells.filter((c) => c?.type === 'shelf').length;
  const packerCount = s.grid.cells.filter((c) => c?.type === 'packer').length;
  const empty = s.grid.cells.findIndex((c) => c === null);
  if (shelfCount === 0 && empty >= 0) return placeEquipment(s, empty, 'shelf');
  if (packerCount < 2 && s.money > 20000 && empty >= 0) return placeEquipment(s, empty, 'packer');
  if (shelfCount < 2 && s.money > 30000 && empty >= 0) return placeEquipment(s, empty, 'shelf');
  // Hàng: giữ tồn ốp lưng + cáp; xoay 2 gói sỉ khi đủ tiền
  const stock = (id: string) => s.inventory[id] ?? 0;
  const inbound = s.deliveries.reduce((a, d) => a + d.itemsTotal - Math.floor(d.itemsChecked), 0);
  if (stock('phone_case') + stock('cable') + inbound < 20) {
    if (s.money >= 12000 + 2000 + 6000) return buyBundle(s, 'electronics', 'power', 'standard');
    if (s.money >= 6000 + 2000 + 3000) return buyBundle(s, 'electronics', 'starter', 'standard');
    const unit = retailUnitPrice(s, 'phone_case');
    if (s.money >= unit * 10 + 2000) return buyRetail(s, 'phone_case', 10, 'standard');
  }
  return s;
}

describe('balance harness — màn 1 (README gate)', () => {
  it('15–25 phút thực, hoa hồng 5–12%, lãi ròng dương từ ngày 2', () => {
    const rng = makeRng(20260824);
    let s = createGame(20260824, 'electronics');
    let ticks = 0;
    const MAX = 1500; // 25 phút
    while (!s.stageComplete && ticks < MAX + 1) {
      if (ticks % 5 === 0) s = botAct(s);
      s = tick(s, 4, rng);
      ticks++;
    }
    expect(s.stageComplete, `màn 1 không xong trong 25 phút (money=${s.money}, orders=${s.completedOrders})`).toBe(true);
    expect(ticks, 'màn 1 xong quá nhanh (<15 phút)').toBeGreaterThanOrEqual(900);

    const gross = s.reports.reduce((a, r) => a + Object.values(r.revenueByChannel).reduce((x, y) => x + y, 0), 0)
      + Object.values(s.dayRevenue).reduce((a, b) => a + b, 0);
    const commission = s.reports.reduce((a, r) => a + r.commission, 0) + s.dayCommission;
    const share = commission / gross;
    expect(share).toBeGreaterThanOrEqual(0.05);
    expect(share).toBeLessThanOrEqual(0.12);

    for (let i = 1; i < s.reports.length; i++) {
      expect(s.reports[i].net, `ngày ${i + 1} lãi âm`).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the harness**

Run: `pnpm --filter @shopflow/sim exec vitest run test/harness.test.ts`
Expected: likely FAIL on first run — this is the tuning loop.

- [ ] **Step 3: Tune until green**

Iterate on the bot policy (thresholds, bundle cadence, equipment order). Diagnose with temporary `console.log` of day reports (remove before commit). Only adjust `packages/data/*.json` as a last resort, flagged in the commit message. Do not weaken the assertions.

- [ ] **Step 4: Run full suite**

Run: `pnpm test`
Expected: PASS — all packages

- [ ] **Step 5: Commit**

```bash
git add packages/sim packages/data
git commit -m "test(sim): stage-1 balance harness (15-25 min, commission 5-12%, profit from day 2)"
```

---

# Phase 2 — Web app (`apps/web`)

### Task 12: Scaffold Vite app + worker driver + store

**Files:**
- Create: `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/tailwind.config.js`, `apps/web/postcss.config.js`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/index.css`, `apps/web/src/worker/simWorker.ts`, `apps/web/src/store.ts`, `apps/web/src/format.ts`
- Modify: `apps/web/package.json`, `.claude/launch.json` (create)
- Test: `apps/web/src/store.test.ts` + boot verification in browser

**Interfaces:**
- Worker protocol (produced here, consumed by every screen):
  - main → worker: `{ type: 'init', save: string | null }` · `{ type: 'start', seed: number, industryId: string }` · `{ type: 'setPaused', paused: boolean }` · `{ type: 'action', name: ActionName, args: unknown[] }` where `ActionName = 'buyRetail'|'buyBundle'|'placeEquipment'|'upgradeEquipment'|'removeEquipment'|'expandGrid'|'openChannel'|'upgradeChannel'|'setChannelOpen'|'buySeo'|'chooseIndustry'|'advanceStage'|'expediteDelivery'`
  - worker → main: `{ type: 'state', state: GameState }` (after every tick/action) · `{ type: 'nosave' }` (no valid save at init)
- `useGame` Zustand store: `{ game: GameState | null, paused: boolean, booted: boolean, hasSave: boolean, dispatch(name, ...args), start(industryId), setPaused(p) }`
- `format.ts`: `usd(cents: number): string` (e.g. `usd(160000) === '$1,600'`), `gameTime(minute): string` (`'08:00'`), `dateStr(clock): string` (`'Ngày 6 · Tháng 1'`)
- Worker autosaves `{seed, state}` JSON to `localStorage['shopflow-save']` every 60 real seconds — actually saving happens on the **main thread** (workers lack localStorage): the store persists the latest snapshot every 60s and on `visibilitychange`.

- [ ] **Step 1: Scaffold**

```bash
pnpm approve-builds   # cho phép esbuild
```

Replace `apps/web/package.json`:

```json
{
  "name": "@shopflow/web", "version": "0.0.1", "private": true, "type": "module",
  "scripts": { "dev": "vite", "build": "tsc --noEmit && vite build", "test": "vitest run" },
  "dependencies": {
    "@shopflow/data": "workspace:*", "@shopflow/sim": "workspace:*",
    "react": "^18.3.1", "react-dom": "^18.3.1", "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@types/react": "^18.3.12", "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4", "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49", "tailwindcss": "^3.4.15",
    "typescript": "^5.9.3", "vite": "^5.4.11", "vitest": "^2.1.9",
    "jsdom": "^25.0.1"
  }
}
```

Then `pnpm install`.

`apps/web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], test: { environment: 'jsdom' } } as any);
```

`apps/web/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2022", "DOM", "DOM.Iterable"], "moduleResolution": "bundler", "noEmit": true },
  "include": ["src"] }
```

`apps/web/tailwind.config.js`:

```js
export default { content: ['./index.html', './src/**/*.{ts,tsx}'], theme: { extend: {} }, plugins: [] };
```

`apps/web/postcss.config.js`:

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`apps/web/index.html`:

```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Shopflow Tycoon</title>
  </head>
  <body class="bg-slate-100">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/web/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`apps/web/src/format.ts`:

```ts
export const usd = (cents: number): string =>
  (cents < 0 ? '-$' : '$') + Math.round(Math.abs(cents) / 100).toLocaleString('en-US');
export const gameTime = (minute: number): string => {
  const h = Math.floor(minute / 60) % 24, m = Math.floor(minute % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
export const dateStr = (c: { day: number; month: number }): string => `Ngày ${c.day} · Tháng ${c.month}`;
```

`apps/web/src/worker/simWorker.ts`:

```ts
import { createGame, tick, makeRng, type GameState, type Rng } from '@shopflow/sim';
import * as A from '@shopflow/sim';

let state: GameState | null = null;
let rng: Rng | null = null;
let paused = false;
let timer: ReturnType<typeof setInterval> | null = null;

const post = () => state && (self as any).postMessage({ type: 'state', state });

function startLoop() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (paused || !state || !rng) return;
    state = tick(state, 4, rng);
    post();
  }, 1000);
}

const ACTIONS: Record<string, (...a: any[]) => GameState> = {
  buyRetail: (...a) => A.buyRetail(state!, ...(a as [string, number, string])),
  buyBundle: (...a) => A.buyBundle(state!, ...(a as [string, string, string, string?])),
  placeEquipment: (...a) => A.placeEquipment(state!, ...(a as [number, 'shelf' | 'packer' | 'robot'])),
  upgradeEquipment: (...a) => A.upgradeEquipment(state!, ...(a as [number])),
  removeEquipment: (...a) => A.removeEquipment(state!, ...(a as [number])),
  expandGrid: () => A.expandGrid(state!),
  openChannel: (...a) => A.openChannel(state!, ...(a as [string])),
  upgradeChannel: (...a) => A.upgradeChannel(state!, ...(a as [string])),
  setChannelOpen: (...a) => A.setChannelOpen(state!, ...(a as [string, boolean])),
  buySeo: (...a) => A.buySeo(state!, ...(a as [string])),
  chooseIndustry: (...a) => A.chooseIndustry(state!, ...(a as [string])),
  advanceStage: () => A.advanceStage(state!),
  expediteDelivery: (...a) => A.expediteDelivery(state!, ...(a as [string])),
};

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    if (msg.save) {
      try {
        const { seed, state: saved } = JSON.parse(msg.save);
        state = saved; rng = makeRng(seed + (saved.completedOrders ?? 0));
        startLoop(); post(); return;
      } catch { /* save hỏng → chơi mới */ }
    }
    (self as any).postMessage({ type: 'nosave' });
  }
  if (msg.type === 'start') {
    state = createGame(msg.seed, msg.industryId);
    rng = makeRng(msg.seed);
    startLoop(); post();
  }
  if (msg.type === 'setPaused') { paused = msg.paused; }
  if (msg.type === 'action' && state && ACTIONS[msg.name]) {
    state = ACTIONS[msg.name](...(msg.args ?? []));
    post();
  }
};
```

`apps/web/src/store.ts`:

```ts
import { create } from 'zustand';
import type { GameState } from '@shopflow/sim';

const SAVE_KEY = 'shopflow-save';

interface GameStore {
  game: GameState | null;
  paused: boolean;
  booted: boolean;   // worker đã trả lời init
  hasSave: boolean;
  seed: number;
  dispatch: (name: string, ...args: unknown[]) => void;
  start: (industryId: string) => void;
  setPaused: (p: boolean) => void;
}

let worker: Worker | null = null;

export const useGame = create<GameStore>((set, get) => {
  const w = new Worker(new URL('./worker/simWorker.ts', import.meta.url), { type: 'module' });
  worker = w;
  const savedRaw = localStorage.getItem(SAVE_KEY);
  const seed = savedRaw ? JSON.parse(savedRaw).seed : (Math.floor(performance.now() * 1000) % 2 ** 31 || 1);
  w.onmessage = (ev) => {
    if (ev.data.type === 'state') set({ game: ev.data.state, booted: true, hasSave: true });
    if (ev.data.type === 'nosave') set({ booted: true, hasSave: false });
  };
  w.postMessage({ type: 'init', save: savedRaw });

  const save = () => {
    const g = get().game;
    if (g) localStorage.setItem(SAVE_KEY, JSON.stringify({ seed: get().seed, state: g }));
  };
  setInterval(save, 60_000);
  document.addEventListener('visibilitychange', () => document.hidden && save());

  return {
    game: null, paused: false, booted: false, hasSave: !!savedRaw, seed,
    dispatch: (name, ...args) => w.postMessage({ type: 'action', name, args }),
    start: (industryId) => w.postMessage({ type: 'start', seed: get().seed, industryId }),
    setPaused: (paused) => { set({ paused }); w.postMessage({ type: 'setPaused', paused }); },
  };
});
```

Note on determinism: the UI seed uses `performance.now()` — this is **UI shell code**, not sim code; the sim only ever sees the numeric seed. Resume re-derives the rng from `seed + completedOrders` (approximate replay position; acceptable for M1 — noted in code comment).

`apps/web/src/App.tsx` (placeholder until Task 13):

```tsx
import { useGame } from './store';
export default function App() {
  const { game, booted } = useGame();
  if (!booted) return <div className="p-8 text-center">Đang tải…</div>;
  return <div className="p-8 text-center font-bold">Shopflow Tycoon — {game ? 'game đang chạy' : 'chưa có game'}</div>;
}
```

`apps/web/src/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
```

`.claude/launch.json` (repo root):

```json
{ "version": "0.0.1", "configurations": [
  { "name": "web", "runtimeExecutable": "pnpm", "runtimeArgs": ["--filter", "@shopflow/web", "dev"], "port": 5173 } ] }
```

- [ ] **Step 2: Store smoke test**

```ts
// apps/web/src/store.test.ts
import { describe, it, expect } from 'vitest';
import { usd, gameTime, dateStr } from './format';

describe('format', () => {
  it('usd', () => {
    expect(usd(160000)).toBe('$1,600');
    expect(usd(-4400)).toBe('-$44');
  });
  it('gameTime/dateStr', () => {
    expect(gameTime(8 * 60)).toBe('08:00');
    expect(dateStr({ day: 6, month: 1 })).toBe('Ngày 6 · Tháng 1');
  });
});
```

Run: `pnpm --filter @shopflow/web test`
Expected: PASS

- [ ] **Step 3: Boot in browser**

Start the preview (launch config `web`), open http://localhost:5173. Expected: "chưa có game" placeholder, no console errors. Fix any worker-import or Tailwind issues now.

- [ ] **Step 4: Run full suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web .claude/launch.json pnpm-lock.yaml
git commit -m "feat(web): Vite scaffold, sim worker driver, zustand store, autosave"
```

### Task 13: App shell — C2 chọn ngành, tab bar, HUD

**Files:**
- Create: `apps/web/src/screens/IndustrySelect.tsx`, `apps/web/src/components/TabBar.tsx`, `apps/web/src/components/Hud.tsx`, `apps/web/src/components/Toast.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `useGame`, `@shopflow/data` industries, `format.ts`.
- Produces: `App` routes: no game → `IndustrySelect`; game → shell (`Hud` top, active screen, `TabBar` bottom). `App` holds `const [tab, setTab] = useState<'kho'|'nhap'|'ban'|'quangba'|'them'>('kho')`. `Toast` watches `game.lastReject` and shows it for 2.5s. Icons are emoji (📦 🚚 🛍️ 🔍 ⋯) matching the mockups.

- [ ] **Step 1: Implement**

`IndustrySelect.tsx` — the three `unlock === 'start-option'` industries as cards (icon per id: electronics 📱, fashion 👗, home 🏠; name, V as 1–5 filled bars via `'▮'.repeat(Math.round(V*3))` style spans, three product chips `name giá`), locked row of 5 remaining industries with 🔒, selected card gets `ring-2 ring-emerald-500`, confirm button "Bắt đầu với {name}" calls `start(id)`:

```tsx
import { useState } from 'react';
import { industries as IND } from '@shopflow/data';
import { useGame } from '../store';
import { usd } from '../format';

const ICONS: Record<string, string> = { electronics: '📱', fashion: '👗', home: '🏠', books: '📚', toys: '🎮', beauty: '💄', sports: '⚽', pets: '🐾' };

export default function IndustrySelect() {
  const start = useGame((s) => s.start);
  const [sel, setSel] = useState<string | null>(null);
  const starters = IND.industries.filter((i) => i.unlock === 'start-option');
  const locked = IND.industries.filter((i) => i.unlock !== 'start-option');
  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <h1 className="mb-1 text-xl font-bold">Sếp có $1,000. Sếp muốn bán gì trước?</h1>
      <p className="mb-4 text-sm text-slate-500">Đổi được trong 5 phút đầu.</p>
      <div className="space-y-3">
        {starters.map((i) => (
          <button key={i.id} onClick={() => setSel(i.id)}
            className={`w-full rounded-xl bg-white p-4 text-left shadow ${sel === i.id ? 'ring-2 ring-emerald-500' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="font-bold">{ICONS[i.id]} {i.name}</span>
              <span className="text-emerald-600" title="Tốc độ có đơn">
                {'▮'.repeat(Math.min(5, Math.round(i.V * 3)))}<span className="text-slate-200">{'▮'.repeat(Math.max(0, 5 - Math.round(i.V * 3)))}</span>
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {i.products.slice(0, 3).map((p) => (
                <span key={p.id} className="rounded bg-slate-100 px-2 py-0.5 text-xs">{p.name} {usd(p.retail)}</span>
              ))}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {locked.map((i) => (
          <span key={i.id} className="rounded-lg bg-slate-200 px-3 py-1 text-sm text-slate-500">🔒 {ICONS[i.id]} {i.name}</span>
        ))}
      </div>
      <button disabled={!sel} onClick={() => sel && start(sel)}
        className="fixed inset-x-4 bottom-4 mx-auto max-w-md rounded-xl bg-emerald-600 p-3 font-bold text-white disabled:bg-slate-300">
        {sel ? `Bắt đầu với ${starters.find((i) => i.id === sel)!.name}` : 'Chọn một ngành'}
      </button>
    </div>
  );
}
```

`Hud.tsx` — money, `gameTime`+`dateStr`, ⏸/▶ toggle (`setPaused`), chips ⭐ rating (1 decimal), 📚 `Σinventory`/`shelfCapacity`, 🔍 `unchecked` chờ kiểm, ⏳ `orders.length` đơn chờ. Use `shelfCapacity` imported from `@shopflow/sim`.

`TabBar.tsx` — fixed bottom, 5 buttons; `them` tab renders "🔒 Mở ở màn 3" screen. Active tab `text-emerald-600 font-bold`.

`Toast.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useGame } from '../store';

export default function Toast() {
  const reject = useGame((s) => s.game?.lastReject);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!reject) return;
    setMsg(reject);
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [reject]);
  if (!msg) return null;
  return <div className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white shadow-lg">{msg}</div>;
}
```

`App.tsx` — wire: `booted` gate → `game ? shell : <IndustrySelect/>`; shell = `<Hud/>` + screen switch (placeholder `<div>` per tab until later tasks) + `<TabBar/>` + `<Toast/>`.

- [ ] **Step 2: Verify in browser**

Reload http://localhost:5173 (clear localStorage first: DevTools → `localStorage.clear()`). Expected: industry cards render; picking Điện tử starts the game; HUD shows $1,000, clock advancing from 08:00, pause works; tabs switch placeholders. Compare against `docs/demo-screens/01-chon-nganh.png`.

- [ ] **Step 3: Run full suite** — `pnpm test` → PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): industry select, HUD, tab bar, toast shell"
```

### Task 14: C4 Kho screen

**Files:**
- Create: `apps/web/src/screens/Warehouse.tsx`
- Modify: `apps/web/src/App.tsx` (route `kho`)

**Interfaces:**
- Consumes: `useGame`, `stages.warehouse` data, `dispatch('placeEquipment'|'upgradeEquipment'|'removeEquipment'|'expandGrid')`, `packCapacityPerSecond`.
- Produces: process strip (1 Xe về → 2 Chờ kiểm → 3 Lên kệ → 4 Đóng gói, with live counts), CSS-grid warehouse (`grid-cols-{size}` via inline style), cell rendering: shelf = green tile with stock share, packer = blue tile with speed, robot = purple, empty = dashed border; tapping an equipped cell opens a small popup (absolute-positioned card) with Nâng cấp (price from data or "Mở ở màn N") and Gỡ ($10); tapping an empty cell with a selected equipment card places it. Equipment purchase row: Kệ $40 · Bàn đóng gói $80 · Robot $120 (🔒 màn 2) · selecting toggles placement mode. "Mở rộng kho $400" button when `stage ≥ 2 && size === 3`.

- [ ] **Step 1: Implement** — single component ~150 lines; state: `const [placing, setPlacing] = useState<'shelf'|'packer'|'robot'|null>(null)`, `const [popup, setPopup] = useState<number|null>(null)`. All prices read from `ST.warehouse`. Inventory per shelf display: show total stock/capacity in the HUD chip; shelf tiles show `📚` + level.

- [ ] **Step 2: Verify in browser** — place a shelf ($40 deducted), place second packer, tap packer → popup shows "Nâng cấp — Mở ở màn 3" and "Gỡ $10". Compare `docs/demo-screens/02-kho-hang.png`.

- [ ] **Step 3: Run full suite** — `pnpm test` → PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): warehouse screen with grid, equipment, expansion"
```

### Task 15: C5/C6/C7 Nhập screens

**Files:**
- Create: `apps/web/src/screens/Restock.tsx` (sub-tab container), `apps/web/src/screens/RestockRetail.tsx`, `apps/web/src/screens/RestockBundles.tsx`, `apps/web/src/screens/RestockInbound.tsx`
- Modify: `apps/web/src/App.tsx` (route `nhap`)

**Interfaces:**
- Consumes: `retailUnitPrice`, `pendingAuditCapacity` from `@shopflow/sim`; `suppliers`, `industries`, `calendar` data; `dispatch('buyRetail'|'buyBundle')`; `wholesaleEnvMult` for live bundle pricing.
- Produces:
  - `Restock` — sub-tab row **Nhập lẻ · Gói sỉ · Đang về** (Đang về shows a count badge of active deliveries).
  - `RestockRetail` — supplier chips (local active; regional/overseas 🔒 "Màn 2"/"Màn 3"), grade chips (B active at stage 1; A/C dimmed "Màn 2"), industry dropdown when ≥2 owned; product rows (name, tồn red `<10`, retail price, computed `retailUnitPrice`, stepper − qty +); bottom bar: `Σ qty × unit + carrier fee`, carrier `<select>` of the 3 carriers with fee and days-delta labels, Đặt hàng button ("giao hôm nay" for standard/express) → `dispatch('buyRetail', productId, qty, carrierId)` per product with qty > 0.
  - `RestockBundles` — seasonal card (orange) when an entry of `calendar.seasonalBundles` has an active window and matching owned industry AND stage ≥ 2: name, countdown "còn N ngày", `limit − bought` lượt, struck original price, −15%/−30% price, Mua → `dispatch('buyBundle', industryId, bundleId, carrierId, seasonalId)` (M1 maps seasonal ids to the industry's cheapest stage-legal bundle — note: data has no bundle-id link, so seasonal purchase buys the chosen regular bundle at the discount; comment this in code). Regular bundle cards: name, item chips, live cost via `wholesaleEnvMult` + ship + days, "Bán hết thu ~$X · lãi ≈ $Y" (X = Σ items×retail, Y = X − cost), Mua button; stage-locked dimmed "Màn 2".
  - `RestockInbound` — 4-step strip; per shipping delivery a blue card (id, contents summary, carrier, cost, progress bar `1 − daysLeft/max(1,totalDays)`, "về sau N ngày", button "Nâng lên Hỏa tốc +$20 · về sớm 1 ngày" → `dispatch('expediteDelivery', deliveryId)` hidden for express deliveries); per auditing delivery an orange card (`itemsChecked`/`itemsTotal` progress, hint "thêm bàn đóng gói để kiểm nhanh hơn" when 1 packer). Bottom note: next logistics-suspension window from calendar events with `logisticsSuspended`.

- [ ] **Step 1: Implement** the four components. Keep each under ~120 lines.

- [ ] **Step 2: Verify in browser** — buy 10 ốp lưng standard: money −$44, Đang về shows auditing card, stock appears after audit (needs a shelf from Task 14); buy Starter Bundle economy: shipping card with 2-day countdown. Compare `03-nhap-le.png`, `04-goi-si.png`, `05-dang-ve.png`.

- [ ] **Step 3: Run full suite** — `pnpm test` → PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): restock screens (retail, bundles, inbound)"
```

### Task 16: C8/C9 Bán hàng screens

**Files:**
- Create: `apps/web/src/screens/Sales.tsx` (sub-tab container: **Kênh · Đơn hàng**), `apps/web/src/screens/SalesChannels.tsx`, `apps/web/src/screens/SalesOrders.tsx`
- Modify: `apps/web/src/App.tsx` (route `ban`)

**Interfaces:**
- Consumes: `channels` data, `orderRate`, `commissionOf`, `comboBonus` from `@shopflow/sim`; `dispatch('openChannel'|'upgradeChannel'|'setChannelOpen')`; `trafficEnvMult`, `hourMult`.
- Produces:
  - `SalesChannels` — top summary card: today's orders per channel (mini bars from `dayOrders`), `Σ dayRevenue` doanh thu, `dayCommission` hoa hồng. Channel cards for all 4 defs: status line (Đang bán / Tạm ngưng vì thiếu phí (`suspended`) / Khóa Rating (`ratingLocked`) / Tạm đóng (`!open`) / 🔒 Mở ở màn N / Chưa mở), level dots (●●○), hoa hồng % (level-3 adjusted via `commissionOf`), phí/ngày, đơn/giờ hiện tại (= `Σ_industries orderRate(...) / 5 × (60/40)` scoped to just this channel — compute by calling `orderRate` on a state clone whose channels contain only this one), affinity chip for the player's strongest owned industry (`hợp ngành: 👗×1.6`), action button: Mở kênh $X / Nâng cấp $Y / Tạm đóng · Mở lại. Locked card shows the unlock condition.
  - Rate table ("Tốc độ có đơn"): owned industries × open channels, each cell ước tính đơn/giờ (same per-channel computation per industry).
  - `SalesOrders` — live queue rows: product name, channel logo emoji (🛍️ flea, 🏬 mall), `usd(value)`, SLA bar (`w-[{pct}%]`, color emerald >50%, amber >20%, red below); combo banner "Combo +{combo×100}% doanh thu" with streak progress to next step; channel filter chips. Cancelled orders surface via the rating drop + toast (Task 13's Toast covers rejects only — add a local `useEffect` diffing `orders.length + completedOrders` to detect expiry and toast "Đơn quá hạn −0.1 ⭐").

- [ ] **Step 1: Implement** the three components.

- [ ] **Step 2: Verify in browser** — with stock, orders appear in the queue and drain at packer speed; revenue ticks up; combo counter climbs; channel card shows đơn/giờ > 0. Compare `06-ban-hang-kenh.png`, `07-ban-hang-don.png`.

- [ ] **Step 3: Run full suite** — `pnpm test` → PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): sales channels and live order queue screens"
```

### Task 17: C11 Quảng bá & Lịch

**Files:**
- Create: `apps/web/src/screens/Promo.tsx`
- Modify: `apps/web/src/App.tsx` (route `quangba`)

**Interfaces:**
- Consumes: `calendar`, `upgrades` data; `activeEvents`; `dispatch('buySeo')`; `orderRate`.
- Produces: two top cards — **Thị trường** (🔒 "Chu kỳ thị trường — Mở ở màn 3") and **Sắp tới** (next event by date after today: name, dates, benefiting industries with "ngành của bạn!" badge when owned). Month calendar: 30-day grid of current month; today = dark tile, event days rose, seasonal-bundle windows amber, weekends slate; legend row; logistics-suspension note when the next event has `logisticsSuspended`. SEO section: one card per owned industry — score + progress bar (40→85 scale), "≈ {orderRate(...)  scaled}/10 giây" current rate, button "Nâng SEO $160" (next campaign cost/score from `upgrades.seoCampaigns`, disabled with 🔒 "Màn 2" at stage 1, "Màn 3" for level 3).

- [ ] **Step 1: Implement.** Calendar day classification helper inline:

```tsx
const dayClass = (m: number, d: number): string => {
  if (CAL.events.some(e => inWindow(m, d, e.from, e.to))) return 'bg-rose-200';
  if (CAL.seasonalBundles.some(b => inWindow(m, d, b.window[0], b.window[1]))) return 'bg-amber-200';
  if (CAL.weekendDays.includes(d)) return 'bg-slate-200';
  return 'bg-white';
};
```
with `inWindow(m, d, [fm, fd], [tm, td])` = the same `m*100+d` range check used in `env.ts`.

- [ ] **Step 2: Verify in browser** — calendar shows tháng 1 with New Year highlighted; SEO card locked at stage 1. Compare `06-quang-ba-lich.png`.

- [ ] **Step 3: Run full suite** — `pnpm test` → PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): promo screen with calendar and SEO campaigns"
```

### Task 18: C10 Báo cáo cuối ngày + C13/C14 hoàn thành màn

**Files:**
- Create: `apps/web/src/screens/DayReportModal.tsx`, `apps/web/src/screens/StageComplete.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `reports`, `stageComplete`, `stages` data; `dispatch('advanceStage'|'chooseIndustry')`; `setPaused`.
- Produces:
  - `DayReportModal` — App watches `game.reports.length`; when it increases, show the modal with the newest report and `setPaused(true)`; "Tiếp tục" → `setPaused(false)` and close. Layout: title `Ngày N · Tháng M`; **Thu** column: per-channel revenue rows with order counts; **Chi** column: hoa hồng, phí kênh, thuê kho, bảo trì, nhập hàng; big LÃI RÒNG line (`text-emerald-600` / `text-rose-600`); 7-day sparkline: inline SVG polyline over last 7 `reports[].net`; warning row when any channel `suspended`.
  - `StageComplete` — fullscreen emerald overlay when `game.stageComplete`: 🏆, "MÀN {stage} HOÀN THÀNH", three stat tiles (Tiền/Đơn/Rating), reward card `+{usd(reward)}`, unlock chips from `stages[stage].unlocks` (map ids → Vietnamese labels inline: `channel-mall` → 'Kênh MegaMall', `robot` → 'Robot kho', `seo-1-2` → 'SEO cấp 1–2', `supplier-regional` → 'Nguồn khu vực', `grades` → 'Hạng hàng A/B/C', `calendar` → 'Lịch & gói mùa', `grid-4x4` → 'Kho 4×4', `carriers-all` → '3 hãng ship', `industry-choice-2` → 'Ngành thứ 2'); button **Nhận thưởng & chọn ngành tiếp theo** → `dispatch('advanceStage')` then show industry picker (reuse `IndustrySelect` in "next industry" mode: exclude owned, confirm → `dispatch('chooseIndustry', id)`), or **Tiếp tục** (just `advanceStage`).
  - `IndustrySelect` gains a prop `mode?: 'start' | 'next'` for the two flows.

- [ ] **Step 1: Implement** both + the `IndustrySelect` prop.

- [ ] **Step 2: Verify in browser** — let a day roll over: modal pauses game with correct numbers; force stage completion via a fresh game and DevTools-patched save (edit localStorage: money 160000, completedOrders 50) → overlay shows, advancing pays $400 and unlocks MegaMall in Bán hàng. Compare `08-bao-cao-ngay.png`, `07-hoan-thanh-man.png`, `08-mo-khoa-man-2.png`.

- [ ] **Step 3: Run full suite** — `pnpm test` → PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): day report modal and stage completion flow"
```

### Task 19: M1 exit-criteria playthrough & polish

**Files:**
- Modify: as needed from findings; `README-SETUP.md` (update `pnpm dev` note — Vite app now exists)

**Interfaces:** none new — this is verification.

- [ ] **Step 1: Full manual playthrough in the in-app browser** against the spec's exit criteria:
  1. `localStorage.clear()` → pick Điện tử → play stage 1 honestly (buy stock, shelf, second packer, watch orders) — confirm completion lands in the 15–25 real-minute window (2x the harness confirms; spot-check ~5 minutes then fast-forward by editing nothing — trust the harness for timing, verify the *flow* manually).
  2. Stage-complete overlay → advance → open MegaMall ($200) → choose Thời trang → orders arrive on both channels, mall commission 5% visible in channel card.
  3. Mid-game reload resumes from autosave (money/day preserved).
  4. Weekend day 6: order tempo visibly rises; day report shows weekend revenue bump.
- [ ] **Step 2: Fix everything found** (each fix its own small commit).
- [ ] **Step 3: Run `pnpm test` + `pnpm -r exec tsc --noEmit`** — both green.
- [ ] **Step 4: Update `README-SETUP.md`** — mark M1 done in the roadmap line, note `pnpm dev` works.
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: M1 exit criteria verified, README updated"
```

---

## Post-plan

After Task 19: merge decision via superpowers:finishing-a-development-branch (merge `m1` → `master`). M2 (all 6 stages + events + grades/returns + relationships) gets its own brainstorm → spec → plan cycle.
