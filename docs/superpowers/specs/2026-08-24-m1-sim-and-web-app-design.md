# M1 — Sim màn 1–2 + Web App: Design Spec

*Date: 2026-08-24 · Status: approved design, pre-implementation*
*Source of truth for game rules: `docs/Kich-Ban-Game-Shopflow-Tycoon-Full.md` (spec). This document scopes M1 and records decisions; where they conflict, the game spec wins for rules, this doc wins for scope.*

## Goal

A playable stage 1→2 build: complete the pure simulation for stage 1–2 mechanics with a balance harness, then a Vietnamese, mobile-first web app (Vite + React + Zustand + Tailwind) driving the sim in a Web Worker.

## Scope

**In:** sim mechanics for stages 1–2; balance harness; screens C2 (chọn ngành), C4 (Kho), C5/C6/C7 (Nhập), C8/C9 (Bán hàng), C11 (Quảng bá), C10 (Báo cáo cuối ngày popup), C13/C14 (hoàn thành màn / mở khóa); localStorage autosave (single slot, 60s).

**Out (deferred):** C0 splash, C1 menu + 3 hồ sơ, C3 tutorial, C15 offline welcome, C16 tự động hóa, C17 lưu/cài đặt, EN locale, market cycles (màn 3), random events (màn 4), nguồn xa, upgrades vĩnh viễn (màn 3), 2x speed control (UI shows ⏸/1x; 2x locked).

## Phase 1 — Sim (`packages/sim`), TDD

All mechanics pure and deterministic: no `Date.now()`, no `Math.random()`; RNG is an injected seeded generator (mulberry32). Money integer cents; durations in game minutes. Driver contract: 1 real second → `tick(state, 4, rng)`.

### Order generation (spec B5)
- Fires every 40 game-minutes (= 10 real seconds), tracked by an accumulator in state.
- Per product of each owned industry: `r = orderRate(state, industry, seo, envMult)` (existing formula) where `envMult` = weekend(ngày 6–7, 13–14, 20–21, 27–28 ×1.3) × peak-hour (11–13h & 19–22h ×2, 0–5h ×0.5) × active calendar events for stages 1–2.
- `số đơn = floor(r/5) + Bernoulli(frac(r/5))`; each order assigned to an open, non-suspended channel by K×A weights; skipped if queue full.
- Queue cap 20 at stage 1, +10 per stage. SLA 24 game-hours (stages 1–2). Order value = product retail price × weekend(1.05) × event multiplier, captured at creation.

### Deliveries & stock (spec B2–B4)
- Actions `buyRetail(productId, qty, carrierId)` (giá sỉ ×1.2 ×nguồn ×hạng; MOQ 5 nội địa; max 100; + ship fee) and `buyBundle(bundleId, carrierId)` create `Delivery` records; money deducted immediately and tallied as `purchases` for the day report.
- Shipping: `daysLeft` decremented at each settleDay; 0-day deliveries arrive same tick. Arrival → `state: 'auditing'`, occupies pallet capacity (500/empty cell); `auditLeft = items ÷ (Σ packer×speed×20) giờ` recomputed as packers change.
- Audit completion moves items to shelf inventory, capped by Σ shelf capacity (100/200/400 per level); overflow stays as unchecked pallet.
- Grade B/C return rates deferred to M2 (grades stored, no return simulation in M1). Nguồn nội địa only.

### Packing & fulfilment (spec B4–B5)
- Per tick: capacity = `Σ packer×speed + Σ robot×speed (nếu có ≥1 kệ)` orders/real-second; robots +25% when adjacent to a shelf. Deliver oldest queued orders with stock: decrement inventory, credit `value × (1+combo) × (1−commission)` to money, accumulate revenue/commission per channel for the day report, +0.02 Rating (cap 5), `ordersDelivered++`, `completedOrders++`.
- Combo: 10 consecutive on-time deliveries → +5%, stacking to +50%; any SLA cancellation resets to 0.
- SLA countdown per tick; expiry cancels the order: −0.1 Rating (floor 1), combo reset.

### Economy actions & channels (spec B4–B6)
- `placeEquipment(cellIndex, type)` / `upgradeEquipment(cellIndex)` / `removeEquipment(cellIndex)` (búa $10) with stage-gated prices from `@shopflow/data`.
- `openChannel(id)` / `upgradeChannel(id)`: MegaMall unlocks at stage 2, auto-suspends while Rating < 3.5 (reopens after ≥3.5 for 1 full day); level 2/3 = K+25%/+50%, level 3 −1pt commission.
- `buySeo(industryId)` levels 1–2 ($160→55, $400→70). No daily decay (màn 3).
- `expandGrid()` → 4×4 for $400 at stage 2.
- `chooseIndustry(id)` adds the second industry at stage-2 unlock.
- All purchases fail cleanly (state unchanged) when money is insufficient.

### settleDay (spec B6)
Extend the existing skeleton: fold the day's accumulated revenue-by-channel, orders-by-channel, commission, and purchases into `DayReport`; `net = revenue − commission − channelFees − rent − maintenance − purchases`. Existing rent/maintenance/fee-suspension logic kept.

### Stage progression (spec B9)
- After each settleDay and delivery, check stage goals: stage 1 → $1,600 · 50 đơn · Rating 3.5; stage 2 → $6,000 · 150 · 4.0. On completion set `stageComplete` flag (UI shows C13), award bonus ($400 stage 1), bump `stage`, apply unlocks.

### Balance harness (README requirement)
Headless vitest test: a scripted bot plays stage 1 (buy retail day 1, rotate 2 gói sỉ, add shelf + 2nd packer, keep stock up). Asserts:
1. stage 1 completes within 15–25 real-minute-equivalents (900–1,500 ticks of 4 game-minutes each, i.e. ~2.5–4.2 game-days, after tutorial allowance),
2. commission is 5–12% of gross revenue,
3. net profit positive from day 2.
Harness failure fails `pnpm test`.

### State shape changes
`GameState` gains: `orderGenAccum: GameMinutes`, `stageComplete: boolean`, day accumulators (`dayRevenueByChannel`, `dayOrdersByChannel`, `dayCommission`, `dayPurchases`), `megaMallLockDays`. `Order` gains `createdAt`. All JSON-serializable (worker + save).

## Phase 2 — Web app (`apps/web`)

### Stack & architecture
- Vite + React 18 + TypeScript, Zustand store, Tailwind. Vietnamese only. Mobile-first 390×844; content column max-width on desktop.
- **Worker driver:** sim runs in a Web Worker. Every real second it calls `tick(state, 4, rng)` (paused state skips), posts the full state snapshot (plain JSON) to the main thread; Zustand store replaces its `game` slice. UI dispatches `{type: action, payload}` messages; worker applies the action creator and posts the new state. Pause/speed handled in the worker.
- **Save:** worker autosaves serialized state + seed to localStorage every 60s and on visibility change; app boots into C2 if no save, else resumes.

### Screens (spec Phần C)
- **C2 Chọn ngành:** 3 unlocked industry cards (Điện tử/Thời trang/Gia dụng) with V-bars, product chips, locked row for the rest; confirm starts the game.
- **Shell:** bottom tab bar 📦 Kho · 🚚 Nhập · 🛍️ Bán hàng · 🔍 Quảng bá · ⋯ Thêm (Thêm = locked stub "Mở ở màn 3"). Locked features show ổ khóa + "Mở ở màn N".
- **C4 Kho:** HUD (tiền, giờ–ngày, ⏸/1x, chips Rating/kệ/chờ kiểm/đơn chờ), process strip, warehouse grid with cell popups (upgrade/remove), equipment purchase row, expand button.
- **C5 Nhập lẻ:** source chips (khu vực/xa locked), grade chips, product list with steppers, order bar with carrier choice.
- **C6 Gói sỉ:** seasonal bundle card (calendar-driven), regular bundles with profit hint, stage-locked bundles dimmed.
- **C7 Đang về:** shipping cards with progress + express upgrade, auditing cards, history.
- **C8 Kênh:** today summary (mini bars), channel cards (status/level/commission/fee/đơn-giờ/affinity chip, open/upgrade/pause buttons), industry×channel rate table.
- **C9 Đơn hàng:** live queue with SLA bars (xanh→cam→đỏ), combo counter, channel filter, cancellation toasts.
- **C11 Quảng bá:** market-cycle card (locked), upcoming-event card, month calendar (events/bundle windows/weekends), SEO cards per industry.
- **C10 Báo cáo cuối ngày:** modal at 00:00 (game paused), thu/chi columns, LÃI RÒNG line, 7-day sparkline, warnings.
- **C13/C14:** fullscreen stage-complete + next-industry/unlock picker.

### Testing
Sim: vitest unit tests per mechanic + harness. UI: manual verification against `docs/demo-screens/*.png` in the in-app browser; a store-level smoke test (worker round-trip mocked). `pnpm test` stays the gate.

## Error handling
- Worker messages are versioned `{type, payload}`; unknown actions ignored with console warning.
- Corrupt/incompatible localStorage save → discard and start at C2 (log a toast).
- All sim actions validate funds/space/stage and no-op with a `rejectReason` the UI surfaces as a toast.

## Milestone exit criteria
1. `pnpm test` green including balance harness.
2. In-browser: pick Điện tử → play to stage 1 complete in 15–25 min → unlock screen → open MegaMall + second industry → orders flow on both channels.
3. Refresh mid-game resumes from autosave.
