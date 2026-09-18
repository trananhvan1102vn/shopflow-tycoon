# M2b — Màn 4: Design Spec

*Date: 2026-09-18 · Status: approved design, pre-implementation*
*Source of truth for game rules: `docs/Kich-Ban-Game-Shopflow-Tycoon-Full.md` (spec). Where the game spec is silent (custom pricing formula, "chiến giá"), this document defines the rule. Builds on the M2a spec (`2026-09-17-m2a-stage3-and-core-ux-design.md`) and the M2b-prep plan (`plans/2026-09-18-m2b-prep-pacing-skipday-header.md`).*

## Goal

Make stage 4 playable: the Website channel with loyalty, per-product custom pricing, six random events including a price war, logistics suspension on the calendar's flagged days, the 5×5 grid and robot level 2 (data already present), the fourth industry, stage-4 quests, and a stage-4 balance harness.

## Scope

**In (sim/data):** random-event engine driven by a data table and applied through `modifiers()`; KOL rating boost apply/revert; customs strike on overseas lots; crisis immunity from relationship level 5; custom pricing state, action, elasticity in `orderRate` and order value; price-war event with win tracking; Website loyalty K; logistics suspension in `advanceShipping`; `chooseIndustry` numeric unlocks; stage-4 quests; quest-bonus re-proportioning for stages 2–4; `fastForward` summary lists random events; harness stage 4.

**In (web):** Bán ▸ Giá bán sub-tab; "Đang diễn ra" event card on Quảng bá; event start/end toasts; Website loyalty line on its channel card; suspension tag on inbound cards; stage-4 industry picker; welcome-back summary lists random events.

**Out (deferred to M2c / later):** automation, level-3 equipment, 6×6, achievements, purchasable industries 6–8, leaderboard, sound, cloud save, EN locale.

## Decisions taken during brainstorming

| Question | Decision |
|---|---|
| Undefined mechanics | Design custom pricing and the price war now (both in M2b). |
| Pricing granularity | Per product, on a new Bán ▸ Giá bán sub-tab, bounds and elasticity in data. |
| Event architecture | Data-driven event table folded into the modifier pipeline; new events later are data only. |
| Price war | A sixth random event; won by matching or beating the rival price on every product of the targeted industry while delivering ≥ `minOrders` of that industry's orders during the war. |
| Quest bonuses | Re-proportioned to ≈2% of each stage's money goal (stage 2 $120 each, stage 3 $600, stage 4 $3,000). |
| Stage-4 pacing | Harness window 35–60 real minutes after stage 3 (proposal, tuned by adjusting the stage-4 goal, not the window). |

## Phase 1 — Sim (`packages/sim`), TDD

All mechanics pure and deterministic; RNG only through the injected `Rng`; money integer cents; durations in game minutes.

### 1.1 Data

`calendar.json` — replace `randomEvents` with:

```json
"randomEvents": {
  "fromStage": 4, "dailyChance": 0.10, "maxActive": 1,
  "defs": [
    { "id": "flash_sale",     "name": "Flash Sale",           "days": 2, "weight": 1, "effects": { "retailMult": 2.0 } },
    { "id": "supply_crisis",  "name": "Khủng hoảng nguồn",    "days": 3, "weight": 1, "effects": { "wholesaleMult": 1.5, "deliveryDaysDelta": 1 } },
    { "id": "kol_review",     "name": "KOL Review",           "days": 2, "weight": 1, "effects": { "ratingDelta": 0.5 } },
    { "id": "golden_hour",    "name": "Giờ Vàng",             "days": 1, "weight": 1, "effects": { "trafficMult": 3.0 } },
    { "id": "customs_strike", "name": "Đình công hải quan",   "days": 4, "weight": 1, "effects": { "overseasDaysDelta": 3 } },
    { "id": "price_war",      "name": "Chiến giá",            "days": 3, "weight": 1, "effects": { "rivalPriceMult": 0.85, "abovePriceTrafficMult": 0.5 }, "targetIndustry": "owned", "minOrders": 20 }
  ]
}
```

`stages.json` — add `"pricing": { "min": 0.7, "max": 1.3, "step": 0.05, "elasticity": 1.5 }`; add `quests["4"] = [{ "id": "web_100_orders", "bonus": 300000 }, { "id": "win_price_war", "bonus": 300000 }]`; re-proportion `quests["2"]` bonuses to `12000` each and `quests["3"]` to `60000` each. `validate.mjs`: every `defs[].id` unique; `weight > 0`; `days ≥ 1`; `pricing.min < 1 < pricing.max`; `step > 0`.

Data already present and used as is: `channels.website.loyalty { kPerOrders: 0.1, ordersStep: 100, maxK: 1.4 }`, stage-4 `sla: 720`, `queueCap: 50`, grid 5×5 `unlockStage: 4`, robot level 2 `unlockStage: 4`, calendar `logisticsSuspended` / `logisticsSuspendedRange`, `relationship.levels[4].crisisImmune`, `industries.books.unlock = 4`.

### 1.2 State (`types.ts`, `SAVE_VERSION` → 3)

```ts
activeRandomEvents: { id: string; endsDay: number; industryId?: string; ordersDuring: number }[];
priceMult: Record<string, number>;   // productId → multiplier, absent = 1
priceWarsWon: number;
```

`createGame` initialises `[]`, `{}`, `0`. `validateSave` requires `Array.isArray(activeRandomEvents)`. Version-2 saves are discarded with the existing notice (no migration), as in M2a.

### 1.3 Random events (`events.ts`, new)

- `rollRandomEvent(s, rng): GameState` — called at the end of `settleDay` when `s.stage ≥ fromStage`: first `expireEvents` (remove entries with `endsDay ≤ absDay(clock)`, applying end hooks), then if `activeRandomEvents.length < maxActive` and `rng.next() < dailyChance`, pick a def by weight (one draw), start it: `endsDay = absDay + days`; `industryId` = a random owned industry when `targetIndustry === 'owned'` (one draw); start hooks. Draw order is fixed: chance, def, industry.
- Start/end hooks: `ratingDelta` → `rating += delta` at start (cap `rating.max`), storing the amount actually applied as `ActiveRandomEvent.ratingApplied` (it is smaller than `delta` at the cap); at end `rating −= (ratingApplied ?? delta)` (floor `rating.min`), so an event can never be a net rating loss. Price war end → `won = every unlocked product of industryId ((unlockStage ?? 1) ≤ s.stage) has (priceMult ?? 1) ≤ rivalPriceMult && ordersDuring ≥ minOrders`; if won, `priceWarsWon++`. Stage-locked products are excluded because `setPrice` refuses them and the Giá bán tab hides them. Because `ordersDuring` only counts deliveries made at or below the rival price (below), the win requires matching the rival *during* the war, not only at expiry — a last-day price drop does not win it (decisions table).
- `activeEventDefs(s)` helper returns the defs of active entries; `modifiers()` folds `trafficMult`, `retailMult`, `wholesaleMult` multiplicatively and `deliveryDaysDelta` additively into a new `Modifiers.deliveryDaysDelta`; `overseasDaysDelta` into `Modifiers.overseasDaysDelta`. `modifiers(s, { supplierId })` skips `supply_crisis` effects when `relationshipPerks(s, supplierId).crisisImmune` (add that boolean to `relationshipPerks`).
- `deliveryDays` adds `deliveryDaysDelta` and, for `supplierId === 'overseas'`, `overseasDaysDelta` after the multiplier.
- `fulfilOrders` increments `ordersDuring` on the active price-war entry when the delivered order's `industryId` matches **and** the order's product was sold at or below the rival (`priceMultOf(s, productId) ≤ rivalPriceMult`); deliveries made while priced above the rival never count. Refunded (returned) orders still count, consistent with `completedOrders`.

### 1.4 Custom pricing

- `setPrice(s, productId, mult)`: stage ≥ 4; product owned and unlocked; clamp to `[min, max]`, snap to `step` (round to nearest); store `priceMult[productId]` (delete the key when the result is 1). `lastReject` on failure.
- `orderRate` becomes per-product aware: `genOrders` passes the product's `mult`; rate `× mult^(−elasticity)`; order `value = round(retail × mult × retailEnv × mod.retail)`.
- Price-war penalty: while an event with `rivalPriceMult` targets the product's industry and `(priceMult ?? 1) > rivalPriceMult`, rate `× abovePriceTrafficMult`.

### 1.5 Website loyalty

`levelK(def, level, ordersDelivered)`: for defs with `loyalty`, base `trafficK + kPerOrders × floor(ordersDelivered / ordersStep)`, capped at `maxK`, then the level multipliers. `channelWeights` and `orderRate` pass the channel state's `ordersDelivered`.

### 1.6 Logistics suspension

`env.ts` gains `logisticsSuspended(month, day): boolean` from `events[].logisticsSuspended` (whole event window) and `logisticsSuspendedRange`. `advanceShipping` returns deliveries unchanged (no countdown, no risk resolution) on suspended days.

### 1.7 Industry choice and quests

`chooseIndustry` accepts `unlock === 'start-option'` or `Number(unlock) ≤ s.stage`. Quest predicates: `web_100_orders` (website channel `ordersDelivered ≥ 100`), `win_price_war` (`priceWarsWon ≥ 1`). `QUEST_PREDICATE_IDS` test keeps covering all ids.

### 1.8 fastForward summary

`OfflineSummary` gains `randomEventsStarted: string[]`, `randomEventsEnded: string[]` from diffing `activeRandomEvents` ids before/after.

### 1.9 Harness

Bot extended for stage 4: choose the fourth industry, open the Website, keep prices at 1, place the robot level-2 upgrade when affordable, expand to 5×5. Window: stage 4 completes 2,100–3,600 ticks after stage 3 (35–60 real min). If the window fails, retune the stage-4 goal (money/orders, reward 20%), not the window; record final numbers in game spec B9 and here.

Measured 2026-09-18 (seed 20260917, `packages/sim/test/harness.test.ts`, describe "balance harness — màn 4"): with the untested ×5 extrapolation ($300,000 / 4,000 orders), the bot reached only $235,702 by tick 3,600 (window max) — cumulative completed orders and rating were already far past goal (orders ≥4,000 and rating 4.5 are met within the first ~300 ticks of stage 4, carried over from stages 1–3; money is the only binding constraint). Retuned per the tuning rule, keeping the ratio near 7,500 cents/order: goal `money: 22,000,000` ($220,000), `orders: 2,900`, reward `4,400,000` ($44,000, 20% of goal money). Stage 4 now completes at **tick 2,967** (well inside the 2,100–3,600 window), money=$220,056.73, orders=18,989, rating=5.0, no channel suspended for unpaid fees.

## Phase 2 — Web app (`apps/web`)

- **Bán ▸ Giá bán** (`screens/SalesPricing.tsx`, stage 4; locked stub "Mở ở màn 4" before): one card per owned, unlocked product: name, list price, current price (`retail × mult`) with −/+ stepper over the data range, "≈ N đơn/giờ" (pure helper reusing the channel estimate with the product's mult), "lãi/đơn" (price − wholesale), "Về giá niêm yết" when mult ≠ 1. During a price war the targeted industry's cards show "Đối thủ: $X" and a red "đắt hơn đối thủ" tag while above it.
- **Quảng bá**: "Đang diễn ra" card for the active random event (name, effect line with real numbers from `effects`, days left); price war adds the rival price and "N/20 đơn để thắng". Toasts on start ("⚡ {name} bắt đầu") and end ("{name} kết thúc", "Thắng chiến giá!" / "Thua chiến giá") via `EventToasts` watching `activeRandomEvents` ids and `priceWarsWon`.
- **Bán ▸ Kênh**: Website card line "khách ×{K} · +0.1 mỗi 100 đơn ({n}/100)".
- **Đang về**: "⛔ Ngưng vận chuyển tới {d}/{m}" tag on suspended days.
- **Industry picker**: stage-4 picker lists industries with numeric `unlock ≤ stage`.
- **Welcome-back**: random events appear in the events lines.
- `SAVE_VERSION = 3`.

## Error handling

`setPrice` rejects out-of-range or unknown products with a Vietnamese `lastReject`; event defs missing from data are ignored at roll time and flagged by `validate.mjs`; `fastForward` unchanged in its clamps.

## Testing

Sim: seeded tests per 1.3–1.7 (roll/no-roll, expiry, maxActive, KOL apply/revert with caps, customs delta overseas-only, crisis immunity, pricing clamp/snap/elasticity, price-war penalty and win/lose, loyalty K and cap, suspension, numeric unlocks, quest predicates, summary diff). Harness stage 4. Web: pure helpers for the price estimate/margin and event card text; `save.test.ts` v3. Browser verification by the controller for every screen.

## Milestone exit criteria

1. `pnpm test`, `pnpm typecheck`, Pages build green.
2. Browser at stage 4 (save-staged): fourth industry pickable; Website opens and shows loyalty; Giá bán sub-tab steps a price and the estimate moves; a staged random event shows the card and toasts; a staged price war is winnable; inbound shows the suspension tag on 1/1.
3. Deployed to GitHub Pages and verified live.
