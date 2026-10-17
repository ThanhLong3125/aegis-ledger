# 📋 Kế Hoạch Triển Khai `@aegis/database` (Implementation Plan)

> **Mã thư viện:** `@aegis/database`  
> **Vị trí:** `libs/database/`  
> **Mục tiêu:** Xây dựng Tầng Lưu Trữ WORM (Write Once, Read Many), Schema Quản lý Kiểm toán Bất biến & Migration Security Rules cho PostgreSQL.  
> **Công nghệ chính:** **Prisma ORM (v6.x)** + PostgreSQL 16 + PL/pgSQL Anti-Tamper Triggers + NestJS  
> **Trạng thái:** ✅ **Đã phê duyệt & Đã hoàn thành triển khai 100% (Completed & Verified)**

---

## 🎯 1. Mục Tiêu & Phạm Vi Triển Khai (Objectives & Scope)

Theo lộ trình tại [ROADMAP.md](../../ROADMAP.md) (**Bước 4 / Phase 3**), `@aegis/database` là tầng lưu trữ dữ liệu trung tâm phục vụ toàn bộ hệ sinh thái AegisLedger:
1. **Dữ liệu trực quan hóa & Type-Safe với Prisma ORM:**
   - Định nghĩa `schema.prisma` trực quan, rõ ràng, dễ hình dung cấu trúc dữ liệu và mối quan hệ quan hệ (Relations).
   - Hạn chế tối đa việc viết câu lệnh SQL query thô trong logic ứng dụng; tận dụng Prisma Client type-safe APIs cho toàn bộ thao tác CRUD và Transaction.
2. **Cơ chế WORM (Write Once, Read Many) tại tầng Database Engine:**
   - Tạo **PostgreSQL Trigger / Rules** (`fn_enforce_audit_logs_worm`, `fn_enforce_epoch_blocks_immutability`) chặn cứng câu lệnh `UPDATE` và `DELETE` trên bảng `audit_logs` ngay tại tầng nhân CSDL.
   - Ngăn chặn chỉnh sửa các trường mật mã cốt lõi trên `epoch_blocks` (`merkle_root`, `previous_epoch_root`, `signature`, `epoch_number`), chỉ cho phép cập nhật trạng thái neo (`anchored`, `anchor_tx_hash`).
3. **Đảm bảo tính Atomic Transaction cho Epoch Batching:** Cung cấp `EpochBatchService` thực thi lưu trữ đồng thời một lô (5–10 logs) vào `audit_logs` và 1 bản ghi vào `epoch_blocks` trong duy nhất một `prisma.$transaction`.
4. **Sẵn sàng cho CDC (Change Data Capture) ở Bước 8:** Cấu hình `REPLICA IDENTITY FULL` trên cả 2 bảng để dịch vụ `tamper-watcher` bám sát luồng WAL qua Logical Replication.

---

## 🏗️ 2. Lựa Chọn Công Nghệ: Prisma ORM

Theo quyết định của người dùng, **Prisma ORM** được lựa chọn làm công nghệ truy cập dữ liệu chính:
* **Tính trực quan (Declarative Schema):** Định nghĩa cấu trúc bảng trong `prisma/schema.prisma` rõ ràng, có chú thích chi tiết, tự động quản lý quan hệ bảng (Relations) và Foreign Keys.
* **Hạn chế Raw SQL Queries:** Toàn bộ nghiệp vụ truy vấn đọc/ghi (Append-Only) được thực hiện thông qua Prisma Client type-safe (`findUnique`, `findMany`, `create`, `createMany`, `$transaction`).
* **Trigger WORM PL/pgSQL:** Độc lập quản lý qua script SQL (`worm-rules.sql`) và được `WormManagerService` áp dụng tự động lên PostgreSQL khi khởi tạo.

---

## 🗄️ 3. Thiết Kế Chi Tiết Prisma Schema (`prisma/schema.prisma`)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

/// Bảng lưu vết các lá Merkle (Append-Only WORM)
model AuditLog {
  id          String   @id @default(uuid()) @db.VarChar(36)
  sequence    BigInt   @unique
  epochNumber BigInt   @map("epoch_number")
  timestamp   DateTime @db.Timestamptz(6)
  actor       Json     @db.JsonB
  action      String   @db.VarChar(100)
  resource    Json     @db.JsonB
  payload     Json     @db.JsonB
  leafHash    String   @map("leaf_hash") @db.VarChar(64)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  epochBlock  EpochBlock @relation(fields: [epochNumber], references: [epochNumber], onDelete: Restrict)

  @@index([epochNumber], name: "idx_audit_logs_epoch_number")
  @@index([leafHash], name: "idx_audit_logs_leaf_hash")
  @@index([timestamp], name: "idx_audit_logs_timestamp")
  @@map("audit_logs")
}

/// Bảng lưu các khối Epoch (Merkle Root & Chữ ký số Ed25519)
model EpochBlock {
  epochNumber       BigInt   @id @map("epoch_number")
  startSequence     BigInt   @map("start_sequence")
  endSequence       BigInt   @map("end_sequence")
  totalLogs         Int      @map("total_logs")
  merkleRoot        String   @map("merkle_root") @db.VarChar(64)
  previousEpochRoot String   @map("previous_epoch_root") @db.VarChar(64)
  signature         String   @db.VarChar(128)
  signerPublicKey   String   @map("signer_public_key") @db.VarChar(64)
  anchored          Boolean  @default(false)
  anchorTxHash      String?  @map("anchor_tx_hash") @db.VarChar(128)
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  auditLogs         AuditLog[]
  externalAnchors   ExternalAnchor[]

  @@index([merkleRoot], name: "idx_epoch_blocks_merkle_root")
  @@index([anchored], name: "idx_epoch_blocks_anchored")
  @@map("epoch_blocks")
}

/// Bảng lưu vết các mốc kiểm toán được neo ngoại vi
model ExternalAnchor {
  id          String   @id @default(uuid()) @db.VarChar(36)
  epochNumber BigInt   @map("epoch_number")
  merkleRoot  String   @map("merkle_root") @db.VarChar(64)
  anchorType  String   @map("anchor_type") @db.VarChar(50)
  txHash      String   @map("tx_hash") @db.VarChar(128)
  anchoredAt  DateTime @default(now()) @map("anchored_at") @db.Timestamptz(6)

  epochBlock  EpochBlock @relation(fields: [epochNumber], references: [epochNumber], onDelete: Restrict)

  @@index([epochNumber], name: "idx_external_anchors_epoch_number")
  @@index([merkleRoot], name: "idx_external_anchors_merkle_root")
  @@map("external_anchors")
}
```

---

## 🛡️ 4. Cơ Chế WORM Security Policy & Defense-in-Depth

### 4.1. Lớp Phòng Thủ 1: PostgreSQL WORM Trigger (Cấm UPDATE & DELETE)

Tại tầng cơ sở dữ liệu, PL/pgSQL Function và Trigger gắn vào bảng `audit_logs`:

```sql
CREATE OR REPLACE FUNCTION fn_enforce_audit_logs_worm()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY BREACH [WORM POLICY]: Table "audit_logs" is strictly Append-Only. Operation "%" is forbidden by AegisLedger security kernel.', TG_OP
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_worm_guard
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION fn_enforce_audit_logs_worm();
```

### 4.2. Lớp Phòng Thủ Cho `epoch_blocks`: Khóa Cứng Thuộc Tính Mật Mã

Trên bảng `epoch_blocks`, chỉ cho phép cập nhật trạng thái neo (`anchored`, `anchor_tx_hash`), tuyệt đối cấm sửa các trường mật mã (`merkle_root`, `previous_epoch_root`, `signature`, `signer_public_key`, `epoch_number`...):

```sql
CREATE OR REPLACE FUNCTION fn_enforce_epoch_blocks_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'SECURITY BREACH [WORM POLICY]: Deleting records from "epoch_blocks" is strictly forbidden.'
        USING ERRCODE = '55000';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.epoch_number <> NEW.epoch_number OR
           OLD.merkle_root <> NEW.merkle_root OR
           OLD.previous_epoch_root <> NEW.previous_epoch_root OR
           OLD.signature <> NEW.signature OR
           OLD.signer_public_key <> NEW.signer_public_key OR
           OLD.start_sequence <> NEW.start_sequence OR
           OLD.end_sequence <> NEW.end_sequence OR
           OLD.total_logs <> NEW.total_logs THEN
            RAISE EXCEPTION 'SECURITY BREACH [WORM POLICY]: Modifying cryptographic properties of an epoch block is strictly forbidden.'
            USING ERRCODE = '55000';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 📁 5. Cấu Trúc Mã Nguồn Triển Khai Trong `libs/database`

```text
libs/database/
├── prisma/
│   ├── schema.prisma                    # Prisma Declarative Schema
│   └── worm-rules.sql                   # SQL Triggers & CDC REPLICA IDENTITY
├── src/
│   ├── index.ts                         # Public API Barrel Export
│   ├── client/
│   │   ├── prisma.service.ts            # NestJS Injectable PrismaClient wrapper
│   │   └── index.ts
│   ├── repositories/
│   │   ├── audit-log.repository.ts      # Repository lưu log, query sequence, verify range
│   │   ├── epoch-block.repository.ts    # Repository lưu epoch, lấy previous root, update anchor
│   │   ├── external-anchor.repository.ts# Repository quản lý các mốc neo ngoại vi
│   │   └── index.ts
│   ├── services/
│   │   ├── epoch-batch.service.ts       # Service thực thi Atomic Transaction cho Epoch
│   │   ├── worm-manager.service.ts      # Service kích hoạt và kiểm tra WORM triggers
│   │   └── index.ts
│   ├── database.module.ts               # NestJS Global Module xuất toàn bộ Repositories
│   └── database.spec.ts                 # Bộ kiểm thử tích hợp (11/11 tests passed)
├── jest.config.js                       # Cấu hình Jest cho database lib
├── project.json                         # Cấu hình dự án Nx (@aegis/database)
├── tsconfig.lib.json                    # Cấu hình TypeScript
├── PLAN.md                              # Bản kế hoạch này
└── README.md                            # Tài liệu hướng dẫn sử dụng & kiến trúc
```

---

## 🧪 6. Kết Quả Kiểm Thử (Testing Results)

Đã chạy toàn bộ bộ kiểm thử tích hợp trên PostgreSQL container:
- `should have WORM triggers active in PostgreSQL information_schema`: ✅ PASS
- `should create and retrieve an EpochBlock`: ✅ PASS
- `should insert audit logs and retrieve by sequence and range`: ✅ PASS
- `should mark an epoch as anchored successfully`: ✅ PASS
- `should commit epoch block and multiple logs in a single atomic transaction`: ✅ PASS
- `should reject batch commit if logs count does not match totalLogs`: ✅ PASS
- `should FORBID and THROW on SQL UPDATE on audit_logs (Trigger Level)`: ✅ PASS
- `should FORBID and THROW on SQL DELETE on audit_logs (Trigger Level)`: ✅ PASS
- `should FORBID deleting epoch_blocks`: ✅ PASS
- `should FORBID modifying cryptographic fields on epoch_blocks`: ✅ PASS
- `should ALLOW updating anchor status on epoch_blocks`: ✅ PASS

**Tổng kết:** **11/11 tests passed** (100% thành công).
