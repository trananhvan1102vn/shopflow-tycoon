# M2a — Màn 3 + Core UX: Design Spec

*Date: 2026-09-17 · Status: approved design, pre-implementation*
*Source of truth for game rules: `docs/Kich-Ban-Game-Shopflow-Tycoon-Full.md` (spec). This document scopes M2a and records decisions; where they conflict, the game spec wins for rules, this doc wins for scope. Builds on the M1 spec (`2026-08-24-m1-sim-and-web-app-design.md`).*

## Goal

Make stage 3 playable end to end and close the four UX gaps that make the current build hard to pick up: no tutorial, no visible goal, no way to restart, and a game that keeps running while the player is away.

M2 as a whole (stages 3–6 + events) is decomposed into three sub-milestones. This spec covers only **M2a**:

- **M2a (this spec):** stage 3 mechanics + tutorial, goal strip, Thêm menu, offline pause/catch-up, 2x speed.
- **M2b (later):** stage 4 — Website channel + loyalty, custom pricing, 5 random events, 5×5 grid, logistics suspension, "price war".
- **M2c (later):** stages 5–6 — automation, level-3 equipment, 6×6, achievements, purchasable industries 6–8. Leaderboard needs a backend → M3+.

## Scope

**In (sim):** supplier + grade selection on purchases (fixes an M1 gap: `makeDelivery` hard-codes local/B); supplier relationships; overseas supplier with risk; grade returns; modifier pipeline; six permanent upgrades; market cycle; SEO level 3 + daily decay; SocialShop with ×3 peak; stage-3 SLA/queue (data-driven, verify); `fastForward`; tutorial state + reward; quests with bonuses; new harness tests for stages 2 and 3.

**In (web):** HUD speed control + goal strip + quest chip; live supplier/grade chips; relationship panel; Thêm menu (Nâng cấp · Báo cáo · Cài đặt); tutorial coach-mark; "Chào mừng trở lại" modal; quest toasts; stage-complete quest list; pause-on-hide + catch-up + save on `pagehide`.

**Out (deferred):** everything in M2b/M2c; EN locale; sound/haptics; cloud save; C1 main menu with 3 profiles; positive money-float feedback; tab badges; day-report auto-continue; desktop 3-column layout; save migration from version 1 (old saves are discarded with the existing toast).

## Decisions taken during brainstorming

| Question | Decision |
|---|---|
| Offline behaviour | Pause when hidden; on return replay elapsed real ticks (cap 8 h) and show C15 summary. |
| Stage checklists | Soft quests with a money bonus; stages still complete on money/orders/rating only. |
| Architecture | Sim owns modifiers, fast-forward, tutorial state, quests. UI renders state and dispatches actions. |
| Old saves | Not migrated. `SAVE_VERSION` → 2. |
| Grade tracking | Per-product grade mix used only for the return roll; flat `inventory` count unchanged. |
| RNG in purchases | None. Supplier risk resolves on the first night inside `settleDay(s, rng)`. |
| 2x speed | Two 4-minute ticks per real second; balance identical to 1x. |
| Stage-1 checklist | Is the tutorial. Quests with bonuses start at stage 2. |

## Phase 1 — Sim (`packages/sim`), TDD

All mechanics stay pure and deterministic. Money integer cents; durations in game minutes. Driver contract unchanged: 1 real second → `tick(state, 4, rng)` (×2 at 2x).

### 1.1 State shape changes (`types.ts`)

`GameState` gains:

```ts
inventoryGrades: Record<string, { A: number; B: number; C: number }>; // mix for the return roll
marketCycleDaysLeft: number;      // 0 before stage 3
cancelledOrders: number;          // SLA expiries, all time
returnedOrders: number;           // returns, all time
profitStreakDays: number;         // consecutive settled days with net > 0
recessionClean: boolean;          // no unpaid-fee suspension since the current recession began
tutorial: { step: number; done: boolean; rewarded: boolean }; // step 0..8
questsDone: string[];             // quest ids already rewarded
dayRefunds: Cents; dayQuestBonus: Cents; // day accumulators, reset at settle
survivedRecession: boolean; retailLotsBought: number; bundleLotsBought: number; // added in plan Task 1 for quest/tutorial predicates
```

`Delivery` gains `riskResolved: boolean` and `risk?: 'delay' | 'customs' | 'loss'`. `DayReport` gains `refunds: Cents` (informational) and `questBonus: Cents` (folded into `net`).

Absolute day index helper: `absDay(clock) = (year − 1) × 360 + (month − 1) × 30 + day`.

`createGame` initialises the new fields (`marketCycle: 'stable'`, `marketCycleDaysLeft: 0`, `tutorial: { step: 0, done: false, rewarded: false }`, empty maps/arrays, `recessionClean: true`, zero counters).

### 1.2 Purchases with supplier and grade (`actions.ts`)

Signatures change to an options object:

```ts
buyRetail(s, productId, qty, { carrierId, supplierId, grade })
buyBundle(s, industryId, bundleId, { carrierId, supplierId, grade, seasonalId? })
```

Validation, in order: industry owned; product/bundle `unlockStage ≤ stage`; supplier `unlockStage ≤ stage`; grade allowed for supplier (`tiers[].grades`, and `gradesStage1` while stage = 1); carrier exists; MOQ `moqLocal` (5) for local, `moqImport` (20) otherwise; max 100 per order; funds; audit-space check for 0-day arrivals (existing rule).

Pricing:

```
unit    = wholesale × retail.priceMult (1.2, retail only) × supplier.costMult × gradeCostMult × (1 − relDiscount)
bundle  = bundle.cost × supplier.costMult × gradeCostMult × (1 − relDiscount) × wholesaleEnvMult × mod.wholesale × (1 − seasonal.discount)
ship    = carrier.fee × mod.shipping × (industry.traits.shipMult ?? 1)   // Gia dụng / Thể thao ×1.5 per spec B2; add the trait to industries.json
days    = max(0, round((bundleDays + supplier.extraDays + carrier.daysDelta − (relLevel ≥ 4 ? 1 : 0)) × mod.deliveryDays))
```

`gradeCostMult` = `grades[grade].costMult`, except grade A costs `grades.B.costMult` when the supplier relationship is level ≥ 3 (the spec's "gói độc quyền" perk, modelled as a price perk instead of a new bundle type). Retail purchases have `bundleDays = 0`.

A pure `quote(s, kind, id, qty, opts)` helper exposes unit price, ship fee, and days so the UI never re-implements pricing.

`makeDelivery` records `supplierId`, `grade`, `riskResolved: daysLeft === 0` (same-day lots skip risk). Money and `dayPurchases` unchanged.

Relationship XP: after a successful purchase, `relationships[supplierId].xp += floor(cost / xpPerCents)` and `lastPurchaseDay = absDay`. Level = index of the highest `relationship.levels[i].xp ≤ xp`. Discount from that level.

### 1.3 Supplier risk and relationship decay (`logistics.ts`, `settleDay.ts`)

`settleDay(s, rng)` now takes the RNG. `advanceShipping(s, rng)` resolves risk once per lot on its first night (`riskResolved === false`):

- regional: `rng < delayChance (0.05)` → `daysLeft += delayDays (1)`, `risk = 'delay'`.
- overseas: `rng < customsChance (0.10)` → `daysLeft += customsDays (2)`, `risk = 'customs'`; independently `rng < lossChance (0.03)` → each item count `× (1 − lossPct)` rounded down (min 0), `itemsTotal` recomputed, `risk = 'loss'` (customs wins the tag if both fire).

Sets `riskResolved = true`, then applies the normal one-day decrement.

Relationship decay at settle: for each supplier with `absDay − lastPurchaseDay ≥ decayAfterIdleDays (30)` and level ≥ 1, set `xp` to the previous level's threshold and `lastPurchaseDay = absDay` (one level per 30 idle days).

### 1.4 Grade mix and returns (`logistics.ts`, `fulfil.ts`)

- `runAudits` adds checked units to `inventoryGrades[pid][delivery.grade]` alongside `inventory[pid]`.
- `fulfilOrders` gets `rng`. For each delivered unit: pick grade from `inventoryGrades[pid]` weighted by count (fallback B if the mix is empty or inconsistent), decrement it. Then `returnRate = grades[g].returnRate + (industry.traits.returnRateBonus ?? 0)`; if `rng < returnRate`:
  - No revenue, no commission, no rating gain. `returnedOrders++`, `dayRefunds += value` (report line only; money was never credited).
  - Grade A: unit back to `inventory` and the mix. Grade B/C: destroyed; rating −0.02 (B) / −0.05 (C), floor `rating.min`.
  - The order leaves the queue and **counts** toward `completedOrders` and channel `ordersDelivered` (delivered, then refunded). Combo streak unaffected.
- `removeEquipment`'s "kệ còn hàng" check keeps using the flat count.

### 1.5 Modifier pipeline (`modifiers.ts`, new)

```ts
interface Modifiers {
  traffic: number; retail: number; wholesale: number; shipping: number;
  deliveryDays: number; robotSpeed: number; commissionDelta: number;
  cancelPenaltyMult: number; ratingRegenPerHour: number;
}
export function modifiers(s: GameState): Modifiers
```

Sources, multiplied together (deltas added):

| Source | traffic | retail | wholesale | shipping | deliveryDays | robotSpeed | commissionΔ | cancelPenalty | ratingRegen/h |
|---|---|---|---|---|---|---|---|---|---|
| market cycle state | ×traffic | ×retail | ×wholesale | ×shipping | | | | | |
| routing | | | | | ×0.7 | | | | |
| seo_pro | ×1.3 | | | | | | | | |
| robot_fast | | | | | | ×1.5 | | | |
| cs | | | | | | | | ×0.5 | +0.01 |
| wholesale | | | ×0.85 | | | | | | |
| negotiator | | | | | | | −0.02 | | |

All numbers come from `upgrades.json` / `calendar.json.marketCycle`; nothing hard-coded. M2b random events add rows to this same function.

Consumers: `orderRate` (× `mod.traffic`), order `value` (× `mod.retail`), purchase cost / ship / days (1.2), `packCapacityPerSecond` (robot speed × `mod.robotSpeed`), `commissionOf` (+ `mod.commissionDelta`, floor 0), `expireSla` (`perCancelled × mod.cancelPenaltyMult`), `tick` (rating `+= ratingRegenPerHour × dt/60`, cap `rating.max`). Weekend / hour / calendar multipliers remain in `env.ts`.

### 1.6 Market cycle, SEO decay, SocialShop, upgrades

- **Market cycle** (`settleDay`): if `stage ≥ 3`: when `marketCycleDaysLeft ≤ 0`, roll a state weighted by `p`, set `marketCycleDaysLeft = periodDays (5)`; else decrement. Entering `recession` sets `recessionClean = true`. Any unpaid-fee suspension while in `recession` sets `recessionClean = false`. Leaving `recession` with `recessionClean` still true completes the `survive_recession` quest. Before stage 3 the state stays `stable`.
- **SEO decay** (`settleDay`): if `stage ≥ costs.seoDecayFromStage`: `seo[ind] = max(seoFloor, seo[ind] − seoDecayPerDay)` for each owned industry. `buySeo` level 3 is already gated by `unlockStage: 3` in data (verify with a test).
- **SocialShop peak**: `env.hourMult` splits into `nightMult(minute)` (global ×0.5 at night) and `peakMultFor(channelDef, minute)` (channel `peakHourMult` during peak hours, else 1). `channelWeights` and `orderRate` use `levelK × affinity × peakMultFor`. Assignment weights therefore shift toward SocialShop at peak, matching "đơn dồn giờ cao điểm ×3".
- **Upgrades**: `buyUpgrade(s, id)`: stage ≥ 3, id exists, not already owned, funds. Appends to `upgrades`, deducts cost, adds to `dayPurchases`.
- **Stage 3 data already in place** (verify with tests, no code expected): SLA 1080, queue cap 40, `equipment-l2` via `levels[].unlockStage`, `chooseIndustry` allowing a third industry, SocialShop `unlockStage: 3`.

### 1.7 Fast-forward (`fastForward.ts`, new)

```ts
interface OfflineSummary {
  ticks: number; ordersDelivered: number; ordersCancelled: number; ordersReturned: number;
  netRevenue: Cents;                       // money credited from deliveries, after commission
  daysSettled: number; feesPaid: Cents;    // rent + maintenance + channel fees over settled days
  eventsStarted: string[]; eventsEnded: string[];
  lowStock: string[];                      // product ids with inventory < 10 at the end
  stageCompleted: boolean;
}
export function fastForward(s: GameState, ticks: number, rng: Rng): { state: GameState; summary: OfflineSummary }
```

`ticks` clamped to `[0, 28800]`. Loops `tick(state, 4, rng)`. Summary derived from counter diffs (`completedOrders`, `cancelledOrders`, `returnedOrders`, `reports.length`, report sums, `activeEvents` before/after, `stageComplete`). `netRevenue` = Σ over new reports of (revenue − commission) plus the change in the current partial day's `dayRevenue − dayCommission`. Stops early when `stageComplete` flips true so the player sees C13 on return.

### 1.8 Tutorial and quests (`tutorial.ts`, `quests.ts`, new)

- Tutorial steps 1–8 (spec C3). The sim stores only `tutorial.step`, `done`, `rewarded`. Actions: `tutorialAdvance(s)` (step +1, max 8), `tutorialSkip(s)` (`done = true`, no reward), `tutorialClaim(s)` (requires `step === 8 && !rewarded`; `money += ST.tutorialReward`, `done = true`, `rewarded = true`), `tutorialReset(s)` (`step = 0`, `done = false`; `rewarded` untouched, so replaying never pays twice). Predicates that decide when a step is complete live in the web app (some depend on which tab is open); pure and unit-tested there.
- Quests defined in `stages.json`:

```json
"quests": {
  "2": [ { "id": "open_mall", "bonus": 5000 }, { "id": "buy_seasonal", "bonus": 5000 }, { "id": "place_robot", "bonus": 5000 }, { "id": "run_seo", "bonus": 5000 } ],
  "3": [ { "id": "relationship_3", "bonus": 20000 }, { "id": "survive_recession", "bonus": 20000 }, { "id": "profit_5_days", "bonus": 20000 } ]
}
```

`checkQuests(s)` runs inside every action creator's `ok()` and at the end of `settleDay`. Predicates: `open_mall` (mall in `channels`), `buy_seasonal` (any `seasonalBought > 0`), `place_robot` (a robot cell exists), `run_seo` (any `seo > seoStart`), `relationship_3` (any supplier level ≥ 3), `survive_recession` (flag set in 1.6), `profit_5_days` (`profitStreakDays ≥ 5`, streak updated in `settleDay` from `report.net`). Only quests of the current stage are checked; completing one pays the bonus once, appends the id, and adds to `dayQuestBonus`. `stageComplete` is unaffected by quests.

### 1.9 Balance harness (`test/harness.test.ts`)

Stage-1 test unchanged. Bot extended with stage-2/3 behaviour (`botAct2`, active from stage ≥ 2): open MegaMall/SocialShop, expand the warehouse grid, place shelves/packers/robots, buy SEO, pick the second/third industry, use regional then overseas supplier with grade B, buy `wholesale` and `routing` upgrades when affordable, and restock every active industry from an emergency local-supplier top-up (needed because `genOrders` only spawns demand for a product while its on-hand stock is `> 0` — a bot that lets stock hit zero between multi-day bundle deliveries stalls order generation entirely, not just fulfilment). New assertions, run via a shared `runStage` helper that tracks whether any channel was ever `suspended`:

- Stage 2 completes within a real-time window after stage 1.
- Stage 3 completes within a real-time window after stage 2.
- No channel is ever suspended for unpaid fees in either stage.

**2026-09-18 update (Task 1, M2b-prep) — windows fixed by product decision, goals retuned to fit.** The original proposal (stage 2: 20–40 min / 1,200–2,400 ticks; stage 3: 30–60 min / 1,800–3,600 ticks) assumed a much slower ramp-up than the sim actually produces: measured with `botAct2` (seed `20260917`) against the old $6,000/150-order and $20,000/400-order goals, stage 2 completed at tick 323 and stage 3 at tick 505 — and a same-day pass down to 4–10 / 6–13 minute windows still read too short for a paced idle game. The product decision fixed new target windows directly instead: stage 2 **15–30 real minutes (900–1,800 ticks)** after stage 1, stage 3 **25–45 real minutes (1,500–2,700 ticks)** after stage 2. Only `packages/data/stages.json` stage 2–5 `goal.money`, `goal.orders`, and `reward` changed (`reward` = 20% of money); `goal.rating`, SLA, queue caps, unlocks, quests, and the bots are untouched, and the money:orders ratio was held at the original ~4,000 cents/order (stage 2) and ~5,000 cents/order (stage 3). The brief's starting guess — multiply stage 2 by 4 and stage 3 by 5 — landed inside both windows on the first harness run, so no further bisection was needed: with the unchanged `botAct2` (seed `20260917`), stage 2 now completes at **tick 1,035** (goal $24,000 / 600 orders, reward $4,800) and stage 3 at **tick 2,339** (goal $100,000 / 2,000 orders, reward $20,000), and no channel is ever suspended. Stages 4–5 (not yet reachable by a bot) were scaled by the same ×5 factor as stage 3 and rounded to clean numbers: stage 4 $300,000 / 4,000 orders / $60,000 reward, stage 5 $800,000 / 7,500 orders / $160,000 reward.

Windows are a proposal; tune in the test constants if the bot proves them wrong, and record the change in this spec.

## Phase 2 — Web app (`apps/web`)

### 2.1 Worker and store

- Worker messages gain `setSpeed(1|2)` (interval stays 1 s; the loop runs `speed` ticks) and `resume(elapsedMs)` → `fastForward(state, min(floor(elapsedMs / 1000), 28800), rng)`; posts `{ type: 'state', state, offline?: OfflineSummary }` with `offline` present only when `elapsedMs ≥ 60_000`.
- Store: on `visibilitychange` hidden → save + `setPaused(true)` + `hiddenAt = Date.now()`; visible → `resume(Date.now() − hiddenAt)` then unpause unless a modal is open. On `pagehide` → save. Save blob adds `savedAt`; boot with a valid save sends `resume(Date.now() − savedAt)`.
- Store holds `speed`, `offlineSummary | null`, and UI-only selections (`supplierId`, `grade`).
- `SAVE_VERSION = 2`; `validateSave` additionally requires a `tutorial` object and `Array.isArray(questsDone)`.
- The day-report modal is suppressed while `offlineSummary` is pending; the summary covers those days.

### 2.2 HUD

- Control cluster ⏸ · 1x · 2x. 2x disabled with 🔒 until `stage ≥ 3`.
- Goal strip under the chips: three mini bars (money / orders / rating vs `stages[stage − 1].goal`), each with current / target text. From stage 2 a "Nhiệm vụ n/m" chip opens a bottom sheet listing the stage's quests with ✓ and bonus.

### 2.3 Nhập

- Supplier chips set the store's `supplierId`; grade chips set `grade`. Locked combinations are disabled with "Màn N". Prices, MOQ, ship fee, and ETA in the order bar come from the sim's `quote()`.
- Selected-supplier panel: relationship level, XP bar to the next level, current discount, perks unlocked (L3 grade-A price, L4 −1 day). Overseas shows its risk line.
- Đang về: cards show supplier / grade and a risk tag (Trễ +1 ngày / Hải quan +2 ngày / Mất 10% lô).

### 2.4 Bán, Quảng bá

- SocialShop card unlocks at stage 3 with the ×3 peak note; affinity chip as today.
- Orders: toast "Hoàn trả · −$X" on a return (from the `returnedOrders` delta).
- Quảng bá: market-cycle card live from stage 3 (state, four multipliers, days left); SEO cards show the level-3 button and a decay warning from stage 3.

### 2.5 Thêm (new screen)

Menu with three entries, each a sub-screen with a back button:

- **Nâng cấp** (C12): six cards from `upgrades.json`: name, cost, effect sentence with the real number (e.g. "Ngày giao ×0.7"), Mua → `buyUpgrade`, ✓ when owned. Locked with "Mở ở màn 3" before stage 3.
- **Báo cáo**: list of `reports` newest first (day, net coloured), tap → opens the existing report modal in read-only mode; header shows the 30-day net total.
- **Cài đặt**: Chơi mới (confirm dialog → clear save, terminate worker, reload to industry select), Chơi lại hướng dẫn (`tutorialReset`), version line.

### 2.6 Overlays

- **Tutorial coach-mark**: fixed card above the tab bar while `!tutorial.done`. Shows "Bước n/8", a one-line instruction, a pointer to the relevant tab (highlighted tab icon), and Bỏ qua. Predicates (pure, tested):
  1 Nhập tab opened · 2 `deliveries` contains a retail lot · 3 a bundle lot · 4 a shelf placed · 5 ≥ 2 packers · 6 Bán tab opened · 7 `completedOrders ≥ 1` · 8 a day report has been shown.
  When the current step's predicate holds, dispatch `tutorialAdvance`. Earlier steps' predicates are re-evaluated so out-of-order play catches up. At step 8 the card shows "Nhận +$200" → `tutorialClaim`, brief celebration.
- **Chào mừng trở lại** (C15): modal with elapsed time, orders delivered / cancelled / returned, revenue, fees, events, low-stock list, Nhận → clears `offlineSummary` and unpauses.
- **Quest toast**: "✓ Nhiệm vụ: … +$X".
- **Stage complete** (C13): adds a ticked list of the finished stage's quests.

## Error handling

- New actions reject with `lastReject` on funds, stage, invalid ids, invalid supplier / grade combos.
- `fastForward` clamps ticks to `[0, 28800]`; missing `savedAt` / `hiddenAt` → no catch-up.
- Saves that fail `validateSave` (corrupt, or an older `SAVE_VERSION`) are discarded and the worker
  answers `init` with `{ type: 'nosave', reason: 'invalid' }`. The store keeps that as `saveInvalid`
  and the industry-select screen (`mode='start'`) shows a one-line amber notice above the cards —
  "Bản lưu cũ không tương thích với phiên bản này nên đã được bỏ — sếp bắt đầu lại từ đầu." — so the
  player is told why they are starting over. A plain `{ type: 'nosave' }` (no save at all) shows nothing.
- The tutorial never blocks input; skip is always available.
- The worker ignores unknown messages with a console warning (existing).

## Testing

- Sim: unit tests per 1.2–1.8; seeded RNG for every probabilistic path including the no-risk branch; `fastForward(N)` equals N single ticks for the same seed; summary counters match diffs; cap enforced.
- Web: `save.test.ts` for version 2 + `savedAt`; `tutorial.test.ts` for the predicate table; `quote()` snapshot for a few supplier / grade / level combos.
- Screens verified in the in-app browser against spec Phần C text.
- `pnpm test` remains the gate; a harness failure fails the build and blocks the Pages deploy.

## Milestone exit criteria

1. `pnpm test` and `pnpm typecheck` green, including the three harness tests.
2. Browser: a new game shows the tutorial; completing it pays $200; the goal strip tracks progress; the quest chip appears at stage 2.
3. Browser: reach stage 3 (playing the harness bot's strategy by hand is acceptable): SocialShop opens; an overseas grade-C purchase arrives with a visible risk tag; buying an upgrade changes a visible number; the market-cycle card shows a state and countdown.
4. Hide the tab ≥ 2 minutes, return: the welcome modal shows a plausible summary, game paused until Nhận.
5. Thêm ▸ Cài đặt ▸ Chơi mới returns to industry select.
6. Deployed to GitHub Pages by the existing workflow.
