# Shopflow Tycoon — Kịch Bản Game Đầy Đủ

*Tài liệu thiết kế hoàn chỉnh cho bản demo: kinh tế USD, bối cảnh toàn cầu, một hồ sơ người chơi. Gồm toàn bộ hệ thống (nhập hàng, kho, **bán hàng qua kênh**, **chi phí vận hành**, quảng bá, sự kiện) và đặc tả **từng màn hình**. Mọi con số nằm trong bảng dữ liệu JSON, chỉnh không cần sửa code.*

---

## PHẦN A — TỔNG QUAN

### A1. Ý tưởng

Người chơi mở một e-shop với **$1,000** và một ngành hàng tự chọn. Vòng chơi: **nhập hàng → kho xử lý → bán qua các kênh → thu tiền → trả chi phí vận hành → tái đầu tư**. Game thắng theo màn (mục tiêu tiền + đơn + Rating), kết thúc là sandbox đa ngành, đa kênh.

### A2. Vòng lặp cốt lõi

```
        NHẬP HÀNG (lẻ / gói sỉ / gói mùa)
              │  xe về 0–4 ngày
              ▼
   KIỂM HÀNG ──► LÊN KỆ (tồn kho)
              ▼
   KÊNH BÁN HÀNG sinh đơn theo ngành ──► BÀN ĐÓNG GÓI giao ──► DOANH THU
              ▲                                                   │
   SEO · Sự kiện · Chu kỳ · Rating                                ▼
              ▲                                     CHI PHÍ VẬN HÀNH (cuối ngày)
              └──────────────── tái đầu tư ◄── LÃI RÒNG ◄─────────┘
```

### A3. Thời gian

| Mục | Giá trị |
|---|---|
| 1 giây thực | +4 phút game (1 ngày = 6 phút thực) |
| Tháng / năm | 30 ngày / 12 tháng |
| Điều khiển | Tạm dừng · 1x · 2x (2x mở màn 3) |
| Sinh đơn | mỗi 10 giây thực |
| Đóng gói | mỗi 1 giây thực |
| Kết toán chi phí | 00:00 mỗi ngày game (Báo cáo cuối ngày) |
| Cuối tuần | ngày 6–7, 13–14, 20–21, 27–28: khách ×1.3, giá lẻ ×1.05, giá sỉ ×0.95 |
| Giờ cao điểm | 11–13h, 19–22h khách ×2 · 0–5h khách ×0.5 |
| Offline | tối đa 8 giờ, tính theo công suất kho và kênh đang mở |

---

## PHẦN B — HỆ THỐNG

### B1. Ngành hàng & tốc độ có đơn

8 ngành; mỗi ngành có **tốc độ có đơn cơ bản** (hệ số V — đơn nhanh hay chậm), giá trị đơn trung bình và luật riêng. Demo mở 3 ngành đầu.

| Ngành | V (tốc độ đơn) | Giá trị đơn TB | Luật riêng |
|---|---|---|---|
| 📱 Điện tử | 1.0 ★★★ | $35 | Trả hàng +3% |
| 👗 Thời trang | 1.2 ★★★★ (đúng mùa ×1.3, trái mùa ×0.6) | $28 | Sản phẩm gắn nhãn mùa |
| 🏠 Gia dụng | 0.6 ★★ | $85 | Chiếm 2 chỗ kệ, ship gói ×1.5 |
| 📚 Sách & VPP | 1.5 ★★★★★ | $16 | Tồn kho bền |
| 🎮 Đồ chơi | 0.8 ★★ (sự kiện tới ×3.5) | $42 | Bùng nổ dịp lễ |
| 💄 Mỹ phẩm | 1.1 ★★★ | $30 | Hạn dùng 90 ngày, biên lãi cao nhất |
| ⚽ Thể thao | 0.8 ★★ (hè ×1.2) | $38 | Đồ lớn chiếm 2 chỗ |
| 🐾 Thú cưng | 1.0 ★★★ | $26 | +0.03 Rating/đơn, thức ăn hạn 120 ngày |

Sản phẩm (giá bán / giá sỉ chuẩn): Điện tử — Ốp lưng $8/$2 · Cáp $16/$4 · Sạc dự phòng $40/$10 · Tai nghe $60/$15 · Đồng hồ $160/$40. Thời trang — Áo thun $20/$5 · Tất $10/$2.5 · Hoodie $40/$10 · Jeans $50/$12 · Sneakers $100/$25. Gia dụng — Máy sấy $25/$6 · Ấm $30/$8 · Hút bụi $120/$30 · Lò vi sóng $180/$45 · Lọc khí $280/$70. (5 ngành còn lại cùng khuôn 5 sản phẩm.)

### B2. Nguồn nhập hàng

| Nguồn | Giá | Ngày | Hạng có | Rủi ro | Mở |
|---|---|---|---|---|---|
| 🏠 Nội địa | ×1.00 | +0 | B (A từ màn 2) | — | Màn 1 |
| 🚢 Khu vực | ×0.80 | +2 | A/B/C | 5% trễ 1 ngày | Màn 2 |
| ✈️ Xa | ×0.65 | +4 | B/C | 10% hải quan +2 ngày, 3% mất 10% lô | Màn 3 |

**Hạng hàng:** A ×1.10 giá, 1% trả · B ×1.00, 4% · C ×0.85, 10%. Trả hàng = hoàn tiền; hạng B/C hủy sản phẩm và −0.02/−0.05 Rating.
**Quan hệ nguồn:** $100 chi = 1 XP; cấp 2/3/4/5 (10/30/80/200 XP) giảm 3/6/10/15%, cấp 3 mở gói độc quyền, cấp 4 −1 ngày giao, cấp 5 miễn nhiễm khủng hoảng nguồn. 30 ngày không mua tụt 1 cấp.
**Vận chuyển:** Economy $12 (+1 ngày) · Standard $20 (+0) · Express $40 (−1). Gia dụng/Thể thao ×1.5.

### B3. Nhập hàng

* **Nhập lẻ** (ngày 1): giá sỉ × **1.2** × nguồn × hạng × quan hệ; MOQ 5 nội địa / 20 nhập khẩu; tối đa 100/lần; ship theo lần đặt.
* **Gói sỉ thường**: 4 gói/ngành, mở theo màn (VD Điện tử: Starter $60 · Power $120 · Audio $200 · Mega $300).
* **Gói mùa**: xuất hiện theo lịch trước sự kiện, −15%, giới hạn 3 lượt/mùa (Valentine, Back-to-School, Black Friday −30% mua 1 lần, Holiday…).
* **Gói độc quyền**: quan hệ cấp 3, hàng hạng A giá hạng B.
* Công thức: `tiền hàng = giá gói × nguồn × chu kỳ × sự kiện × cuối tuần(0.95) × hợp đồng sỉ(0.85)`; `ngày giao = ngày gói + nguồn + hãng ship`.

### B4. Kho

* Lưới 3×3 → 4×4 ($400, màn 2) → 5×5 ($1,200, màn 4) → 6×6 ($4,000, màn 5). Một bàn đóng gói có sẵn.
* **Kệ** $40 — chứa 100/200/400 SP theo cấp (cấp 2 $200, cấp 3 $600). **Bàn đóng gói** $80 — tốc độ 1.0/2.0/4.0 ($400/$800); vừa kiểm hàng vừa đóng gói giao. **Robot** $120 (màn 2) — 0.5/1.0/2.5 ($400/$1,000), +25% khi cạnh kệ. **Búa gỡ** $10.
* Ô trống chứa pallet chờ kiểm 500 SP/ô. Kiểm = `SP ÷ (Σ bàn×tốc độ×20)` giờ.
* Công suất giao = `Σ bàn×tốc độ + Σ robot×tốc độ (khi có ≥1 kệ)` đơn/giây.

### B5. BÁN HÀNG — Kênh bán

Người chơi mở và nâng cấp các kênh; **mỗi đơn phát sinh trên một kênh cụ thể** và chịu hoa hồng + phí của kênh đó.

| Kênh | Phí mở | Phí/ngày | Hoa hồng | Hệ số khách (K) | Đặc điểm | Mở |
|---|---|---|---|---|---|---|
| 🛍️ Chợ Trời Online | $0 | $0 | 12% | 1.0 | Có sẵn, đơn nhỏ lẻ đều đặn | Màn 1 |
| 🏬 Sàn MegaMall | $200 | $5 | 5% | 1.5 | Khách đông; đòi Rating ≥ 3.5, tụt dưới là tạm khóa gian | Màn 2 |
| 📣 SocialShop | $150 | $3 | 2% | 1.2 | Đơn dồn giờ cao điểm ×3 (thay vì ×2) | Màn 3 |
| 🌐 Website riêng | $400 | $8 | 0% | 0.6 → 1.4 | K tăng +0.1 mỗi 100 đơn giao qua web (khách quen), không hoa hồng | Màn 4 |

**Độ hợp kênh–ngành (hệ số A):**

| | Chợ Trời | MegaMall | SocialShop | Website |
|---|---|---|---|---|
| Điện tử | 1.0 | **1.3** | 0.9 | 1.0 |
| Thời trang | 0.9 | 1.1 | **1.6** | 1.0 |
| Gia dụng | 1.0 | **1.3** | 0.8 | 1.1 |
| Sách & VPP | 1.2 | 1.0 | 0.9 | **1.3** |
| Đồ chơi | 1.0 | 1.1 | **1.4** | 0.9 |
| Mỹ phẩm | 0.8 | 1.0 | **1.7** | 1.1 |
| Thể thao | 1.0 | **1.2** | 1.1 | 1.0 |
| Thú cưng | 1.1 | 1.0 | 1.0 | **1.4** |

**Cấp kênh:** mỗi kênh nâng tối đa cấp 3 (giá = 2× và 4× giá gốc nâng cấp; giá gốc = phí mở, riêng kênh mở miễn phí dùng giá gốc riêng): cấp 2 K +25%, cấp 3 K +50% và −1 điểm % hoa hồng. Chợ Trời Online (phí mở $0) có giá gốc nâng cấp **$25** → cấp 2 $50, cấp 3 $100 — nâng cấp không bao giờ cho không.

**Sinh đơn mỗi 10 giây, cho từng sản phẩm:**

```
r = (SEO/5) × V ngành × Σ_kênh(K kênh × A kênh-ngành)
    × (0.6 + 0.1×Rating) × chu kỳ × sự kiện × giờ × cuối tuần
số đơn = floor(r/5) + ngẫu nhiên phần lẻ; mỗi đơn gán vào 1 kênh theo trọng số K×A
```

Đơn có **SLA 24 giờ game** (màn 1–2; 18h màn 3; 12h màn 4+), hàng đợi tối đa 20 (+10 mỗi màn). Quá hạn: hủy, −0.1 Rating (−0.05 có CSKH). Giao xong: +0.02 Rating, doanh thu về ví **sau khi trừ hoa hồng kênh**:

```
doanh thu/đơn = giá bán × sự kiện × chu kỳ × cuối tuần(1.05) × (1 + combo) × (1 − hoa hồng kênh)
```

**Combo:** 10 đơn đúng hạn liên tiếp = +5% doanh thu, cộng dồn tối đa +50%, hủy 1 đơn về 0.

### B6. CHI PHÍ VẬN HÀNH

Kết toán lúc 00:00 mỗi ngày, hiện **Báo cáo cuối ngày**:

| Khoản | Công thức |
|---|---|
| Thuê kho | $2 × số ô lưới (3×3 = $18/ngày) |
| Bảo trì thiết bị | $1 × (kệ + bàn + robot) × cấp |
| Phí kênh | Σ phí/ngày các kênh đang mở |
| Hoa hồng | đã trừ theo đơn trong ngày (hiện tổng để đối chiếu) |
| SEO hao hụt | từ màn 3: điểm SEO −1/ngày về 40 |
| Tự động hóa | $8/ngày (màn 5, khi bật) |
| Sự kiện chi phí | Khủng hoảng nguồn, đình công hải quan… nếu đang diễn ra |

* **Lãi ròng ngày = doanh thu − hoa hồng − chi phí cố định − tiền nhập hàng đã chi.**
* Nếu tiền mặt không đủ trả phí ngày: các kênh có phí bị **tạm ngưng** (mất khách của kênh đó) cho tới khi thanh toán; không có phá sản cứng.
* Kênh MegaMall tự khóa gian khi Rating < 3.5 (mở lại khi ≥ 3.5 trong 1 ngày).

### B7. Quảng bá, lịch, chu kỳ, sự kiện

* **SEO theo ngành:** khởi điểm 40; cấp 1 $160 → 55, cấp 2 $400 → 70, cấp 3 $800 (màn 3) → 85. Từ màn 3 giảm 1 điểm/ngày.
* **Chu kỳ thị trường** (màn 3, đổi mỗi 5 ngày): Ổn định 40% (×1) · Hưng thịnh 25% (khách 1.25, giá lẻ 1.15, giá sỉ 1.1, ship 1.2) · Trầm lắng 20% (0.9/0.95/0.9/0.9) · Suy thoái 15% (0.75/0.85/0.8/0.85).
* **Lịch sự kiện:** New Year 1–2/1 (toàn sàn ×1.5 lẻ, ×2 khách, **ngưng vận chuyển**) · Valentine 14–15/2 (Thời trang, Mỹ phẩm ×1.5 lẻ, ×2.5 khách) · Spring Sale 20–25/3 · Mother's Day 10–11/5 · Children's Day 1–2/6 (Đồ chơi ×2, ×3.5) · Summer Sale 1–7/7 · Back to School 20–31/8 (Sách, Điện tử ×1.8, ×3) · Halloween 30–31/10 · Singles' Day 11/11 (toàn sàn ×1.3, khách ×4) · Black Friday 24–27/11 (giá sỉ ×0.75, khách ×2.5) · Christmas 18–25/12 (Đồ chơi, Điện tử, Gia dụng ×1.5, ×2.5; **ngưng vận chuyển 24–26/12**) · Ngày đôi mỗi tháng (×2 lẻ, ×3 khách).
* **Sự kiện ngẫu nhiên** (màn 4, 10%/ngày): Flash Sale (lẻ ×2, 2 ngày) · Khủng hoảng nguồn (sỉ ×1.5, +1 ngày, 3 ngày) · KOL Review (+0.5 Rating, 2 ngày) · Giờ Vàng (khách ×3, 1 ngày) · Đình công hải quan (nguồn xa +3 ngày, 4 ngày).

### B8. Nâng cấp vĩnh viễn (màn 3)

Định Tuyến Vận Tải $160 (ngày giao ×0.7) · Đột Phá SEO $300 (khách ×1.3) · Robot Siêu Tốc $500 (robot ×1.5) · CSKH Chuyên Nghiệp $600 (phạt hủy ÷2, Rating hồi +0.01/giờ) · Hợp Đồng Sỉ $1,000 (giá sỉ ×0.85) · Đàm Phán Kênh $800 (hoa hồng mọi kênh −2 điểm %).

### B9. Màn chơi & mở khóa

| Màn | Mở khóa | Tiền | Đơn | Rating | Checklist |
|---|---|---|---|---|---|
| 1 🌱 | 1 ngành, nhập lẻ, 2 gói sỉ, kệ + bàn gói, nguồn nội địa, kênh Chợ Trời | $1,600 | 50 | 3.5 | Nhập lẻ · mua 1 gói · đặt kệ · thêm bàn gói · giao 50 đơn |
| 2 👗 | Ngành 2, kênh MegaMall, robot, SEO 1–2, nguồn khu vực + hạng, lịch & gói mùa, kho 4×4, 3 hãng ship | $24,000 | 600 | 4.0 | Mở MegaMall · mua gói mùa · đặt robot · chạy SEO |
| 3 🏠 | Ngành 3, kênh SocialShop, nguồn xa, quan hệ nguồn, nâng cấp, chu kỳ, 2x | $100,000 | 2,000 | 4.2 | Quan hệ cấp 3 · sống sót Suy thoái · lãi ròng dương 5 ngày liên tiếp |
| 4 📚 | Ngành 4, Website riêng, tự đặt giá, sự kiện ngẫu nhiên, kho 5×5 | $300,000 | 4,000 | 4.5 | 100 đơn qua Website · thắng 1 chiến giá |
| 5 🎮 | Ngành 5, tự động hóa, thiết bị cấp 3, kho 6×6, thành tựu | $800,000 | 7,500 | 4.7 | Bật tự động nhập · combo +50% · 4 kênh cùng mở |
| 6 🏆 | Ngành 6–8 (mua $2,000/ngành), bảng xếp hạng mùa | Tự do | — | — | — |

Thưởng qua màn: $400 / $4,800 / $20,000 / $60,000 / $160,000. Không có phá sản; hết tiền chỉ chặn mua sắm và tạm ngưng kênh có phí.

Mục tiêu màn 2–5 được hiệu chỉnh ngày 2026-09-18 theo harness: màn 2 ≈ 15–30 phút thực, màn 3 ≈ 25–45 phút.

---

## PHẦN C — ĐẶC TẢ MÀN HÌNH

Điện thoại dọc 390×844 là chuẩn; máy tính bảng/desktop dùng bố cục 3 cột. Thanh điều hướng dưới (từ khi vào game): **📦 Kho · 🚚 Nhập · 🛍️ Bán hàng · 🔍 Quảng bá · ⋯ Thêm** (Thêm chứa Nâng cấp, Báo cáo, Tự động hóa, Lưu/Cài đặt). Tab chưa mở hiện ổ khóa + "Mở ở màn N".

### C0. Splash / Tải game
Logo, thanh tiến trình, phiên bản. Tải xong tự chuyển C1.

### C1. Menu chính
* **Thành phần:** logo + tagline; nút **Tiếp tục** (hồ sơ gần nhất, hiện tiền + màn + thời gian chơi), **Chơi mới**, 3 ô hồ sơ (mỗi ô: ngành khởi đầu, màn, tiền, nút Xóa có xác nhận), nút ngôn ngữ VI/EN, nút cài đặt (âm thanh, rung, đăng nhập cloud).
* **Hành động:** Chơi mới → C2. Tiếp tục → C4.

### C2. Chọn ngành khởi đầu
* **Thành phần:** lời dẫn "Sếp có $1,000. Sếp muốn bán gì trước?"; 3 thẻ ngành (icon, tên, 1 điểm mạnh xanh, 1 điểm khó xám, độ khó ★, 3 chip sản phẩm + giá, **chỉ báo tốc độ có đơn** dạng 5 vạch); hàng ổ khóa 5 ngành mở sau; nút xác nhận "Bắt đầu với …"; ghi chú "đổi được trong 5 phút đầu".
* **Hành động:** chọn thẻ → viền xanh + nút đổi tên; xác nhận → C3.

### C3. Hướng dẫn (overlay trong game, 8 bước, bỏ qua được, thưởng $200)
1. Mở tab **Nhập** → 2. Nhập lẻ 10 sản phẩm đầu (giao ngay) → 3. Mua **gói sỉ** đầu tiên (xe 1 ngày) → 4. Về **Kho**, đặt Kệ → 5. Đặt thêm Bàn đóng gói → 6. Mở tab **Bán hàng**: "Chợ Trời Online đã bật sẵn — mỗi đơn mất 12% hoa hồng" → 7. Hàng lẻ về, đơn đầu tiên chạy → 8. Xem **Báo cáo cuối ngày** đầu tiên: thu, chi, lãi. Kết: +$200.

### C4. Kho hàng (tab mặc định)
* **HUD trên:** Tiền · giờ–ngày + nút ⏸/1x/2x · hàng chip: ⭐ Rating · Kệ dùng/sức chứa · Chờ kiểm · ⏳ Đơn chờ.
* **Dải quy trình:** 1 Xe về → 2 Chờ kiểm → 3 Lên kệ → 4 Đóng gói → giao.
* **Lưới kho** (3×3…6×6): ô kệ (xanh, hiện tồn), ô bàn đóng gói (xanh dương, hiện tốc độ), ô robot, ô pallet chờ kiểm (cam), ô trống nét đứt. Chạm ô có thiết bị → popup nâng cấp/gỡ.
* **Dãy thiết bị:** thẻ Kệ $40 · Bàn đóng gói $80 · Robot $120 (khóa màn 2) · Búa $10; câu giải thích vai trò kệ/bàn.
* **Nút Mở rộng kho** khi đủ điều kiện màn.

### C5. Nhập hàng ▸ Nhập lẻ
* Sub-tab: **Nhập lẻ · Gói sỉ · Đang về**. Hàng chip nguồn (3 nguồn, nguồn khóa hiện ổ + "Màn N"; nguồn chọn hiện cấp quan hệ và % giảm). Hàng chip hạng A/B/C kèm % trả.
* Danh sách sản phẩm ngành đang chọn (dropdown ngành khi có ≥2): icon, tên, tồn (đỏ khi <10), giá bán, giá nhập lẻ đã tính, stepper − số +.
* Thanh tổng dưới: tóm tắt món × giá + ship, chọn hãng ship, nút **Đặt hàng** (ghi "giao hôm nay" nếu 0 ngày).

### C6. Nhập hàng ▸ Gói sỉ
* Hàng nguồn rút gọn (đổi nguồn). **Thẻ gói mùa** nổi bật (cam): tên, nội dung, đếm ngược, giới hạn lượt, giá gạch − giá giảm, nút mua.
* Danh sách gói thường: tên, chip nội dung, giá + ship + ngày giao, dòng "Bán hết thu $X · lãi ≈ $Y", nút **Mua**; gói khóa mờ + "Màn N". Gói độc quyền hiện khi quan hệ cấp 3.

### C7. Nhập hàng ▸ Đang về
* Dải 4 bước (Vận chuyển → Kiểm → Lên kệ → Bán ra).
* Thẻ **Đang vận chuyển** (xanh dương): mã lô, gói, nguồn/hãng/hạng/giá, thanh tiến độ + giờ còn lại, ngày về, nút "Nâng lên Hỏa tốc +$… · về sớm 1 ngày".
* Thẻ **Đang kiểm** (cam): tiến độ X/Y món, gợi ý thêm bàn.
* Lịch sử mờ: lô xong, giờ lên kệ, số trả về. Cuối trang: nhắc kỳ ngưng vận chuyển kế tiếp.

### C8. BÁN HÀNG ▸ Kênh (tab mới, màn 1)
* **Thẻ tổng quan** trên cùng: tổng đơn hôm nay theo kênh (mini bar), doanh thu hôm nay, hoa hồng đã trừ.
* **Danh sách thẻ kênh**, mỗi thẻ: logo + tên, trạng thái (Đang bán / Tạm ngưng vì thiếu phí / Khóa Rating / Chưa mở), cấp kênh (1–3), hoa hồng %, phí/ngày, chỉ số **đơn/giờ hiện tại**, chip "hợp ngành: 👗×1.6" cho ngành mạnh nhất người chơi đang có, nút hành động: **Mở kênh $…** / **Nâng cấp $…** / **Tạm đóng** (tiết kiệm phí ngày, mất khách kênh).
* Thẻ kênh khóa hiện điều kiện: "Mở ở màn 2" hoặc "Cần Rating ≥ 3.5".
* **Khu "Tốc độ có đơn"**: bảng nhỏ ngành × kênh đang mở, hiển thị đơn/giờ ước tính từng ô — người chơi thấy ngay ngành nào nên đẩy kênh nào.

### C9. BÁN HÀNG ▸ Đơn hàng
* Hàng đợi đơn trực tiếp: mỗi dòng = sản phẩm, kênh (logo nhỏ), giá trị, thanh SLA (xanh → cam → đỏ). Đơn quá hạn rơi khỏi hàng với toast −Rating.
* Bộ đếm combo (+% doanh thu hiện tại). Bộ lọc theo kênh.

### C10. Báo cáo cuối ngày (popup 00:00, xem lại trong Thêm ▸ Báo cáo)
* Tiêu đề "Ngày N · Tháng M". Cột **Thu**: doanh thu theo kênh (4 dòng, kèm số đơn). Cột **Chi**: hoa hồng, phí kênh, thuê kho, bảo trì, nhập hàng, SEO/tự động hóa.
* Dòng to **LÃI RÒNG** (xanh/đỏ). Sparkline lãi 7 ngày. Cảnh báo nếu kênh sắp bị tạm ngưng vì thiếu tiền. Nút "Tiếp tục" (game tạm dừng khi popup mở).

### C11. Quảng bá & Lịch
* Hai thẻ: **Thị trường** (chu kỳ, hệ số, còn N ngày — khóa tới màn 3) và **Sắp tới** (sự kiện gần nhất + ngành lợi).
* **Lịch tháng**: ô hôm nay đen, sự kiện hồng, cửa sổ gói mùa cam, cuối tuần xám; chú giải; dòng nhắc ngưng vận chuyển.
* **Chiến dịch SEO theo ngành**: mỗi thẻ = ngành, điểm SEO + thanh, "≈ X đơn/10 giây", nút nâng cấp giá tiếp theo; cảnh báo hao hụt điểm (màn 3+); gợi ý "chạy trước sự kiện".

### C12. Nâng cấp (Thêm ▸)
6 thẻ nâng cấp vĩnh viễn: icon, tên, giá, mô tả hiệu ứng đúng số; đã mua = dấu tích xanh. Khu "Thiết bị": nâng cấp kệ/bàn/robot theo cấp (điều kiện màn hiện rõ).

### C13. Hoàn thành màn (fullscreen)
Nền xanh lá + hiệu ứng; cúp; "MÀN N HOÀN THÀNH"; 3 ô Tiền/Đơn/Rating; checklist đã tích; thẻ thưởng +$; chip các thứ mở khóa; nút **Chọn ngành tiếp theo** (→ C14) hoặc **Tiếp tục**.

### C14. Mở khóa màn mới / Chọn ngành tiếp theo
Thẻ các ngành còn lại (2 cột): icon, tên, tốc độ đơn ★, gợi ý "Đúng mùa" nếu sự kiện của ngành sắp tới; danh sách "Cũng mở khóa ở màn này" (kênh mới, nguồn mới, thiết bị…); nút xác nhận.

### C15. Chào mừng trở lại (offline)
"Sếp vắng X giờ": đơn đã giao, doanh thu (đã trừ hoa hồng), chi phí ngày đã trừ, sự kiện đã qua/đang diễn ra, cảnh báo tồn kho thấp. Nút Nhận.

### C16. Tự động hóa (Thêm ▸, màn 5)
Bật/tắt ($8/ngày): tự nhập khi tồn ngành ≤ 10/20/30/50%, tự chạy lại SEO khi < 55, tự nâng Hỏa tốc trước sự kiện. Mỗi quy tắc một hàng bật/tắt.

### C17. Lưu / Cài đặt (Thêm ▸)
3 ô hồ sơ + tự lưu 60 giây; ngôn ngữ; âm thanh/nhạc/rung; tốc độ mặc định; đăng nhập & đồng bộ cloud; nút chơi lại hướng dẫn.

---

## PHẦN D — KỊCH BẢN TRẢI NGHIỆM DEMO (≈ 25–30 phút)

1. **C1 → C2:** chọn Điện tử (★☆☆, tốc độ đơn ★★★).
2. **C3 hướng dẫn 8 bước** — điểm mới: bước 6 mở tab Bán hàng thấy Chợ Trời 12% hoa hồng; bước 8 đọc Báo cáo cuối ngày đầu tiên (thu $54 · chi $24 · lãi +$30) để học khái niệm chi phí vận hành.
3. **Chơi tự do màn 1 (~10 phút):** giữ tồn kho bằng nhập lẻ + 2 gói sỉ xoay vòng; thấy rõ 12% hoa hồng ăn vào lãi → động lực mở MegaMall ở màn 2. Cuối tuần ngày 6–7 khách ×1.3. Đạt $1,600 · 50 đơn · Rating 3.5 → **C13**.
4. **C14 mở màn 2:** chọn Thời trang (Valentine còn 8 ngày, SocialShop ×1.6 sẽ nhá hàng "màn 3"); mở MegaMall $200 → thấy đơn/giờ nhảy từ 9 lên 21; mua Valentine Gift Bundle.
5. **Kết demo:** popup "Phần còn lại tùy sếp!" + tóm tắt các hệ thống sẽ mở (nguồn xa, chu kỳ, website riêng, tự động hóa).

## PHẦN E — CÂN BẰNG NHANH MÀN 1

| Khoản ngày đầu | $ |
|---|---|
| Nhập lẻ 10 ốp + ship | −44 |
| Starter Bundle + ship | −78 |
| Kệ + bàn gói thứ 2 | −120 |
| Thuê kho + bảo trì (3×3, 4 thiết bị) | −22/ngày |
| Bán 20 đơn đầu (TB $14, trừ 12% hoa hồng) | +246 |

Lãi ròng ngày 1 ≈ $0–30 (học phí); từ ngày 2 khi Power Bundle về, lãi ≈ $150–200/ngày → đạt $1,600 sau ~3 ngày game (≈ 12 phút thực sau hướng dẫn), khớp mục tiêu 50 đơn.

## PHẦN F — GHI CHÚ TRIỂN KHAI

* Toàn bộ bảng ở Phần B là JSON trong `data/` (industries, channels, suppliers, calendar, stages, upgrades); màn hình Phần C là spec cho UI.
* Kênh là module độc lập trong sim: `channels[].tick()` sinh trọng số đơn; `settleDay()` tạo Báo cáo cuối ngày — dễ thêm kênh thứ 5 (Livestream event) sau này.
* Số liệu cần kiểm bằng harness: thời lượng màn 1 (15–25 phút), tỉ trọng hoa hồng/doanh thu (mục tiêu 5–12%), lãi ròng dương từ ngày 2.
