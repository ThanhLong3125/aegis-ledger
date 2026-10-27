# Aegis Audit Dashboard (`apps/audit-dashboard`)

Ứng dụng Visual Merkle Tree Explorer, Hash Chain Monitor & Live Security Siren thời gian thực phục vụ giám sát toàn diện hệ thống phòng thủ mật mã Aegis Ledger.

---

## 1. Tính năng cốt lõi

- **Interactive Merkle Tree Explorer (SVG Visualization):**
  - Trực quan hóa cấu trúc cây Merkle phân tầng (Root, Intermediate nodes, Leaves) theo đường cong Bézier mềm mại.
  - Tương tác chọn Node để kiểm tra chi tiết: Leaf Hash, Payload, Actor, Resource, Timestamp.
  - Trực quan hóa đường đi xác minh Merkle Proof ($O(\log N)$ Sibling Proof path) được highlight màu xanh neon nổi bật.

- **Real-time SSE Event Stream (`/api/stream`):**
  - Lắng nghe sự kiện Server-Sent Events khi có Audit Log mới, Epoch được niêm phong, hoặc cờ đỏ tự vệ kích hoạt.
  - Tự động cập nhật giao diện không cần reload trang.

- **Hash Chain & Epoch Timeline:**
  - Khám phá chuỗi Epoch liên kết ngược qua `previousEpochRoot`.
  - Kiểm tra chữ ký Ed25519 của Validator và trạng thái Anchor trên mạng Blockchain công khai.

- **Live Security Siren & Active Defense Control:**
  - Hiệu ứng đèn cảnh báo an ninh (Red Siren / Alert Flash) khi phát hiện hành vi giả mạo WAL hoặc tấn công cơ sở dữ liệu.
  - Nút **Reset Active Defense Lock** cho phép Admin/SOC hạ cờ đỏ tự vệ sau khi cô lập và xử lý sự cố.

---

## 2. Cấu trúc REST API

| Phương thức | Endpoint | Mô tả |
| :--- | :--- | :--- |
| `GET` | `/api/overview` | Lấy các chỉ số tổng quan (Tổng Epoch, Tổng Logs, Số Epoch đã Anchor, Trạng thái Khóa Tự Vệ). |
| `GET` | `/api/epochs` | Danh sách các khối Epoch đã niêm phong kèm thông tin External Anchor. |
| `GET` | `/api/epochs/:epochNumber/tree` | Trích xuất toàn bộ các tầng (layers) và các node của cây Merkle cho Epoch được chỉ định. |
| `GET` | `/api/proof/:sequence` | Sinh Merkle Sibling Proof cho một bản ghi sequence và kiểm tra tính hợp lệ toán học. |
| `GET` | `/api/security/status` | Kiểm tra trạng thái cờ đỏ tự vệ Active Defense (`AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS`). |
| `POST` | `/api/security/reset` | Dỡ bỏ cờ đỏ tự vệ trên Redis và thông báo broadcast SSE. |
| `GET` | `/api/stream` | Server-Sent Events (SSE) stream các sự kiện thời gian thực. |

---

## 3. Chạy ứng dụng

### Khởi động Dashboard:
```bash
npm run dashboard
```
Truy cập giao diện Web UI tại: `http://localhost:3333`

### Chạy kiểm thử tự động:
```bash
npm run test:dashboard
```
