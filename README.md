# Nexus Exchange — Giao diện HTML/CSS/JS

Dựng lại 6 màn hình thiết kế Stitch (design system **Obsidian Amber**) bằng HTML/CSS/JS thuần, không framework, không build. Dữ liệu lấy từ file mock JSON trong `data/`.

**Demo:** https://xtruozg.github.io/nexus-web/ (GitHub Pages, tự cập nhật mỗi lần push lên `main`)

## Chạy local

Trình duyệt chặn `fetch()` khi mở file trực tiếp (`file://`), nên cần một server tĩnh:

```bat
start.bat
```

hoặc `python -m http.server 5500` / `npx serve -l 5500 .` rồi mở http://localhost:5500

## Trang

| File | Màn hình | Dữ liệu |
|---|---|---|
| `index.html` | Trang chủ — Thị trường crypto, bảng cấp VIP | `data/markets.json` |
| `trade.html` | Giao dịch phái sinh / Spot | `data/trade.json` |
| `history.html` | Lịch sử giao dịch & Báo cáo thuế | `data/history.json` |
| `wallet.html` | Vốn — Nạp / Rút tài sản | `data/wallet.json` |
| `profile.html` | Trung tâm người dùng | `data/profile.json` |
| `register.html` | Đăng ký tài khoản | `data/register.json` |
| `login.html` | Đăng nhập + xác thực 2FA | `data/login.json` |

Tài khoản demo đăng nhập: `trader@nexus.finance` / `Nexus@2024`, mã 2FA `246810` (hoặc bấm "Điền tài khoản demo").

`data/common.json` chứa thông tin dùng chung: user, menu, ngôn ngữ, footer, bảng `routes` ánh xạ key → trang.

## Cấu trúc

```
assets/css/tokens.css      biến màu, radius, spacing theo DESIGN.md
assets/css/base.css        reset, thang chữ (.t-*), màu (.c-*), helper layout
assets/css/layout.css      shell: header, dropdown, footer, mobile nav, dock, toast
assets/css/components.css  panel, button, chip, badge, tabs, input, table, progress, modal
assets/css/pages/*.css     style riêng từng trang
assets/js/core.js          Nexus.boot(): tải JSON, render shell, helper format/DOM
assets/js/pages/*.js       render + tương tác từng trang
docs/DESIGN.md             design system Obsidian Amber
docs/designs/*.png         ảnh thiết kế gốc (Stitch) của từng trang để đối chiếu
```

Mỗi trang khai báo `<body data-page="..." data-shell="app|bare">`, rồi gọi:

```js
Nexus.boot(['markets.json'], ({ common, data }) => { /* render data.markets */ });
```

Đổi số liệu chỉ cần sửa file JSON tương ứng, không phải sửa HTML.
