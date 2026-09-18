# Shopflow Tycoon — Dev Workspace

Monorepo TypeScript: sim thuần (không framework) + data JSON + web app.
Spec: `docs/Kich-Ban-Game-Shopflow-Tycoon-Full.md` (phần B = hệ thống, phần C = màn hình C0–C17).
Mockup: `docs/demo-screens/` + canvas https://claude.ai/code/artifact/0a90f645-d8a0-480c-b715-0acda2ba751d

## Cài đặt
1. Node ≥ 20, pnpm ≥ 9 (`npm i -g pnpm`)
2. `pnpm install`
3. `pnpm test` — chạy unit test sim + harness cân bằng
4. `pnpm dev` — chạy web app thật (Vite + React, đã có từ M1)

## Cấu trúc
```
packages/data   # MỌI con số của game — chỉnh cân bằng ở đây, không sửa code
packages/sim    # mô phỏng thuần: tick() 1 giây, settleDay() 00:00, action creators
apps/web        # React + Vite + Zustand (M1)
docs            # kịch bản + mockup PNG
```

## Nguyên tắc
- Sim tách UI: `tick(state, dtGameMinutes, rng)` thuần túy, seed RNG để replay/test.
- Không hard-code số liệu — import từ @shopflow/data.
- Tiền dùng số nguyên cent (tránh float). SLA/giờ tính bằng phút game.
- Mọi PR chạy `pnpm test`; harness fail nếu màn 1 lệch khỏi 15–25 phút.
- Harness cân bằng: màn 1 = 15–25 phút thực; màn 2 ≈ 15–30 phút, màn 3 ≈ 25–45 phút (cửa sổ chính xác trong test/harness.test.ts, xem spec M2a §1.9).

## Lộ trình
M0 scaffold ✅ → M1 sim màn 1–2 + UI Kho/Nhập/Bán hàng ✅ (hoàn thành 2026-08-25) → M2a màn 3 + hướng dẫn/offline/Thêm ✅ (hoàn thành 2026-09-17) → M2b màn 4 + sự kiện → M2c màn 5–6 → M3 Capacitor iOS/Android + cloud save → M4 beta → M5 launch.

## Deploy (GitHub Pages)
- Repo: https://github.com/trananhvan1102vn/shopflow-tycoon — mỗi lần push lên `master`, workflow `.github/workflows/deploy.yml` chạy `pnpm test`, build web app với `BASE_PATH=/shopflow-tycoon/` rồi publish `apps/web/dist`.
- URL: https://trananhvan1102vn.github.io/shopflow-tycoon/
- Lần đầu: nếu workflow báo lỗi Pages chưa bật → Settings → Pages → Source: **GitHub Actions**, rồi chạy lại workflow.
- Build local giống Pages: `BASE_PATH=/shopflow-tycoon/ pnpm --filter @shopflow/web build` (không đặt BASE_PATH thì base là `/`, dùng cho `pnpm dev`).
