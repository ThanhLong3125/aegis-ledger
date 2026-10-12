# 📜 `@aegis/contracts` - AegisLedger Domain Contracts & Schemas

> **Vị trí:** `libs/contracts/`  
> **Kiến trúc:** Clean DTO Pattern (`class-validator` + `class-transformer` + TypeScript Interfaces)  
> **Vai trò:** Hợp đồng Dữ liệu & Single Source of Truth (SSOT) cho toàn bộ hệ thống AegisLedger.

---

## 🧭 1. Ý Nghĩa & Mục Tiêu Cốt Lõi

Trong hệ thống phân tán gồm 5 microservices độc lập (`wallet-core`, `audit-ledger`, `tamper-watcher`, `audit-cli`, `audit-dashboard`), thư viện `contracts` đóng vai trò là **"Hiến pháp"**:
1. **Loại bỏ Schema Drift:** Ngăn chặn tuyệt đối tình trạng service này gửi sai tên hoặc sai kiểu dữ liệu của service kia.
2. **Bảo vệ Tính Bất Biến Mật Mã Học:** Trong các thuật toán băm (SHA-256) và cây Merkle, chỉ cần sai lệch một kiểu dữ liệu nhỏ (`number` vs `string`, `null` vs `undefined`), chuỗi Merkle Tree sẽ bị gãy vụn.
3. **Chuẩn Phong Cách NestJS:** Sử dụng TypeScript Interfaces làm chuẩn abstraction và Class DTOs có Decorators (`class-validator`, `class-transformer`) giúp validate tự động tại các Ingestion Controller, Kafka Consumer Handlers và CLI.

---

## 🏛️ 2. Các Miền Dữ Liệu (Domain Models) Đã Triển Khai

Dữ liệu di chuyển qua 5 tầng hợp đồng:

```text
[AuditEventDto] ──► [AuditLogLeafDto] ──► [EpochBlockDto] ──► [MerkleProofDto] & [TamperAlertDto]
(Kafka Ingestion)   (Bản ghi DB/Lá)       (Khối Merkle/Chữ ký) (Kiểm toán O(log N)) (CDC Active Defense)
```

### 2.1. Ingestion Event (`AuditEventDto` / `IAuditEvent`)
Định dạng sự kiện thô mà các service nghiệp vụ (ví dụ: `wallet-core`) phát sinh và đẩy vào Kafka topic:
* `eventId`: UUID chuỗi duy nhất của sự kiện.
* `streamKey`: Key phân vùng Kafka (ví dụ: `walletId`) để hỗ trợ scale đa partition.
* `timestamp`: Chuỗi thời gian chuẩn ISO-8601 UTC.
* `actor`: Thông tin người thực hiện (`userId`, `role`, `ipAddress`, `userAgent`).
* `action`: Hành động nghiệp vụ thuộc `AuditAction` enum (ví dụ: `WALLET_TRANSFER`, `USER_LOGIN_FAILED`).
* `resource`: Đối tượng chịu tác động (`type`, `id`).
* `payload`: Dữ liệu giao dịch nhạy cảm (`amount`, `currency`, `balanceBefore`, `balanceAfter`).

### 2.2. Audit Log Leaf (`AuditLogLeafDto` / `IAuditLogLeaf`)
Bản ghi sau khi `audit-ledger` tiếp nhận, gán số thứ tự liên tục `sequence` và tính mã băm của chính nó:
* `id`: Định danh bản ghi log.
* `sequence`: Số nguyên dương tăng dần liên tục không được nhảy cóc (`1, 2, 3...`).
* `epochNumber`: Định danh Epoch mà lá này thuộc về.
* `leafHash`: Mã băm SHA-256 được tính từ nội dung chuẩn hóa (Canonical JSON) của log.
* Kế thừa toàn bộ thông tin `actor`, `action`, `resource`, `payload`.

### 2.3. Epoch Block (`EpochBlockDto` / `IEpochBlock`)
Khối đóng gói một lô lá cây (ngưỡng: **5–10 logs HOẶC 2 giây**):
* `epochNumber`: Số thứ tự của Epoch (1, 2, 3...).
* `startSequence` & `endSequence`: Dải sequence trong Epoch (ví dụ: #1 đến #7).
* `totalLogs`: Số lượng log trong epoch.
* `merkleRoot`: Mã băm 32 bytes của Gốc cây Merkle (tổng hợp từ toàn bộ `leafHash`).
* `previousEpochRoot`: Merkle Root của Epoch liền trước (tạo xích liên tục).
* `signature`: Chữ ký số Ed25519 được ký trên: `SHA-256(epochNumber + merkleRoot + previousEpochRoot)`.
* `signerPublicKey`: Public key dùng để kiểm định chữ ký.
* `anchored`: Trạng thái đã neo ra môi trường bất biến (Blockchain/WORM) hay chưa.
* `anchorTxHash`: Mã băm transaction ngoại vi (nếu có).

### 2.4. Merkle Audit Proof (`MerkleProofDto` / `IMerkleProof`)
Cấu trúc dữ liệu tinh gọn dành riêng cho kiểm toán viên và người dùng xác minh tính toàn vẹn của một giao dịch theo độ phức tạp $O(\log N)$:
* `sequence`: Số thứ tự log cần kiểm toán.
* `epochNumber`: Epoch chứa log.
* `leafHash`: Mã băm của log.
* `merkleRoot`: Gốc Merkle công khai của Epoch.
* `proof`: Mảng các bước băm trung gian kèm vị trí (`position: 'left' | 'right'`, `hash: string`).

### 2.5. Tamper Breach Alert (`TamperAlertDto` / `ITamperAlert`)
Sự kiện cảnh báo khi `tamper-watcher` bắt được hành vi can thiệp trái phép qua PostgreSQL CDC (Logical Replication):
* `alertId`: UUID của cảnh báo.
* `severity`: Mức độ cảnh báo (`INFO`, `WARNING`, `HIGH`, `CRITICAL`).
* `breachType`: Loại vi phạm thuộc `BreachType` enum:
  * `UNAUTHORIZED_UPDATE`: Bắt quả tang lệnh SQL `UPDATE` vào bảng Append-Only.
  * `UNAUTHORIZED_DELETE`: Bắt quả tang lệnh SQL `DELETE`.
  * `HISTORICAL_REWRITE`: Merkle Root trong DB nội bộ lệch so với External Anchor.
  * `SIGNATURE_FORGERY`: Chữ ký Ed25519 giả mạo.
* `targetTable`: Bảng bị tác động (`audit_logs` hoặc `epoch_blocks`).
* `affectedId`: ID hoặc sequence bị can thiệp.
* `message`: Mô tả chi tiết hành vi tấn công.

---

## 📁 3. Cấu Trúc Mã Nguồn

```text
libs/contracts/
├── src/
│   ├── index.ts                     # Barrel export toàn bộ Enums, Interfaces, DTOs
│   ├── enums/
│   │   └── index.ts                 # AuditAction, BreachType, AlertSeverity
│   ├── interfaces/
│   │   └── index.ts                 # Toàn bộ TypeScript Interfaces
│   ├── dto/
│   │   ├── audit-event.dto.ts       # AuditEventDto, ActorDto, ResourceDto
│   │   ├── audit-leaf.dto.ts        # AuditLogLeafDto
│   │   ├── epoch-block.dto.ts       # EpochBlockDto
│   │   ├── audit-proof.dto.ts       # MerkleProofDto, MerkleProofStepDto
│   │   ├── tamper-alert.dto.ts      # TamperAlertDto
│   │   └── index.ts                 # Barrel export DTOs
│   └── contracts.spec.ts            # Unit Test kiểm thử validation (Jest)
├── jest.config.js                   # Cấu hình Jest & ts-jest
├── project.json                     # Cấu hình Nx Library (@aegis/contracts)
├── tsconfig.lib.json                # TypeScript Config kế thừa tsconfig.base.json
└── README.md
```

---

## 🧪 4. Hướng Dẫn Sử Dụng & Kiểm Thử

### 4.1. Import sử dụng trong các App:
Nhờ cấu hình path alias trong `tsconfig.base.json`, bạn có thể import từ bất cứ đâu trong workspace:

```typescript
import {
  AuditEventDto,
  EpochBlockDto,
  AuditAction,
  BreachType,
  AlertSeverity,
} from '@aegis/contracts';
```

### 4.2. Chạy Unit Test:
```bash
npx jest --config libs/contracts/jest.config.js libs/contracts/src/contracts.spec.ts
```
*Kết quả:* **5/5 tests passed** (đảm bảo tính hợp lệ của tất cả các DTOs).
