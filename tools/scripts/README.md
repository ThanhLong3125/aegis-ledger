# AegisLedger - Showcase Attack Demo Scripts (`tools/scripts/`)

Thư mục chứa toàn bộ kịch bản tự động mô phỏng các cuộc tấn công an ninh mạng cấp độ cao nhất (Insider Threat, Rogue DBA, SQL Injection, State-Level Historical Rewrite) phục vụ cho buổi phỏng vấn, quay video showcase kỹ thuật hoặc kiểm tra tính sẵn sàng an ninh thực chiến.

---

## 1. Danh sách kịch bản & Mục đích

| Kịch bản | Lệnh thực thi | Mô tả chi tiết |
| :--- | :--- | :--- |
| **Dọn dẹp & Khởi tạo Genesis** | `npm run seed:demo` | Dọn sạch dữ liệu cũ, sinh cặp khóa Validator Ed25519, khởi tạo 2 Epochs (10 giao dịch nạp/chuyển/rút tiền), tạo External Anchor Ethereum Sepolia & RFC 3161 TSA, và mở khóa Redis. |
| **Tấn công #1: Sửa đổi dữ liệu** | `npm run demo:modify` | Hacker có đặc quyền DBA bypass Trigger WORM sửa số tiền của Alice từ 1,000 USD thành 1,000,000 USD. CDC bắt trong $< 1\text{ms}$, kích hoạt Active Defense khóa rút tiền trên Redis, `wallet-core` chặn với HTTP 423 Locked, và `audit-cli verify` vạch trần vi phạm `LEAF DATA TAMPERED`. |
| **Tấn công #2: Xóa log phi tang** | `npm run demo:delete` | Hacker xóa Sequence #4 để xóa dấu vết chuyển tiền. CDC bắt quả tang sự kiện DELETE. `audit-cli verify` bắt quả tang lỗi gãy sequence `[SEQUENCE GAP]` và thiếu lá `[LOGS COUNT MISMATCH]`. |
| **Tấn công #3: Tái viết lịch sử** | `npm run demo:rewrite` | Hacker sửa log đồng thời ghi đè giá trị `merkle_root` trong `epoch_blocks` để hợp thức hóa dữ liệu nội bộ. `audit-cli verify` lập tức phát hiện 3 lớp phòng vệ sụp đổ: Chữ ký số Ed25519 bị vô hiệu (`SIGNATURE FORGERY`), Hash Chain liên kết khối kế tiếp bị đứt (`HASH CHAIN BROKEN`), và sai khác với mốc neo Blockchain (`ANCHOR MISMATCH`). |
| **Khôi phục trạng thái chuẩn** | `npm run demo:reset` | Tự động gọi `seed-demo-data.ts` và quét lại bằng `audit-cli verify` để đưa toàn bộ sổ cái về trạng thái an toàn 100% màu xanh. |

---

## 2. Hướng dẫn trình diễn Showcase từng bước (Live Demo Walkthrough)

### Bước chuẩn bị:
1. Đảm bảo hạ tầng Docker đang hoạt động:
   ```bash
   npm run docker:status
   ```
2. Khởi tạo sổ cái chuẩn:
   ```bash
   npm run seed:demo
   ```
3. Mở sẵn Audit Dashboard trên trình duyệt:
   ```bash
   npm run dashboard
   # Truy cập http://localhost:3333
   ```

---

### Demo Kịch bản 1: Sửa dữ liệu (Unauthorized Update)
```bash
npm run demo:modify
```
**Điểm nhấn quan sát:**
- Quan sát bảng `audit_logs` trước và sau khi bị lệnh SQL can thiệp.
- Quan sát cờ đỏ Redis `AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS=true`.
- Tin nhắn cảnh báo SOS được gửi tức thì về Telegram Bot và Kafka stream.
- Trên Dashboard (hoặc terminal), lệnh `audit-cli verify` báo đỏ cảnh báo gian lận `LEAF DATA TAMPERED`.

---

### Demo Kịch bản 2: Xóa log phi tang (Unauthorized Delete)
```bash
npm run demo:delete
```
**Điểm nhấn quan sát:**
- Dòng Sequence #4 bị xóa khỏi DB.
- Khi kiểm toán viên chạy verify, thuật toán phát hiện ngay khoảng hở giữa Sequence #3 và #5:
  `[SEQUENCE GAP] Kỳ vọng #4 nhưng gặp #5`.
- Số lượng log trong DB không khớp với `totalLogs: 5` đã cam kết trong Epoch Block Header.

---

### Demo Kịch bản 3: Tái viết lịch sử & Giả mạo Merkle Root (Historical Rewrite)
```bash
npm run demo:rewrite
```
**Điểm nhấn quan sát:**
- Hacker không thể giả mạo chữ ký số Ed25519 của Validator nếu không có Private Key độc quyền.
- Khối Epoch #1 kế tiếp lập tức bị đứt gãy vì `previousEpochRoot` trỏ tới Root nguyên bản.
- Mốc neo ngoại vi đã gửi lên Ethereum Sepolia là bất biến không thể bị xóa bỏ bởi DBA.

---

### Bước kết thúc: Khôi phục hệ thống về trạng thái 100% Xanh
```bash
npm run demo:reset
```
Toàn bộ sổ cái sẽ được tái tạo, chữ ký hợp lệ và `audit-cli verify` trả về kết luận:
`🟢 TOÀN BỘ SỔ CÁI NGUYÊN VẸN 100% (KHÔNG PHÁT HIỆN GIAN LẬN/SỬA ĐỔI)`.
