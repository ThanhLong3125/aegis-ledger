# 🗄️ `@aegis/database` - WORM Storage & Prisma PostgreSQL Data Access Layer

> **Vị trí:** `libs/database/`  
> **Kiến trúc:** Write Once, Read Many (WORM) Datastore, Prisma ORM, PL/pgSQL Anti-Tamper Triggers, Defense-in-Depth  
> **Vai trò:** Tầng Lưu trữ Dữ liệu Bất biến (Storage Layer) quản lý các bản ghi kiểm toán, khối Epoch, Merkle Root và thực thi các luật bảo mật cấm can thiệp ở tầng nhân database cho AegisLedger.

---

## 🧭 1. Ý Nghĩa & Sứ Mệnh Cốt Lõi

Trong các hệ thống phân tán và bảo mật tài chính, cơ sở dữ liệu thường là điểm yếu nhất trước các cuộc tấn công nội bộ (**Insider Threat**): một DBA bị tha hóa hoặc kẻ tấn công chiếm quyền quản trị có thể dễ dàng chạy câu lệnh SQL:
```sql
UPDATE audit_logs SET user_id = 'victim' WHERE action = 'FRAUD_TRANSFER';
DELETE FROM audit_logs WHERE id = 'compromised-event-id';
```

Thư viện `@aegis/database` được thiết kế nhằm hiện thực hóa mô hình lưu trữ **WORM (Write Once, Read Many)** ở cấp độ công nghiệp:
1. **Trực quan hóa Dữ liệu với Prisma ORM:** Mô hình hóa toàn bộ các bảng (`AuditLog`, `EpochBlock`, `ExternalAnchor`) và mối quan hệ quan hệ thông qua cú pháp khai báo Prisma dễ đọc, type-safe, hạn chế tối đa việc viết SQL queries thô trong mã ứng dụng.
2. **Bảo vệ Cứng tại Tầng Nhân Cơ sở Dữ liệu (Engine-Level WORM):** Sử dụng các Trigger PL/pgSQL và Database Rules để chặn tuyệt đối thao tác `UPDATE` và `DELETE` trên bảng `audit_logs`, bất kể ứng dụng hay client nào cố gắng can thiệp.
3. **Atomic Batch Insertion (Tính Nguyên tử của Epoch):** Hỗ trợ đóng gói hàng loạt các log (5–10 bản ghi) và khối Merkle Epoch (`epoch_blocks`) trong **cùng 1 Database Transaction (`prisma.$transaction`)**. Không bao giờ có trường hợp log được ghi mà thiếu khối Epoch hoặc ngược lại.
4. **Sẵn sàng Hợp nhất CDC (Change Data Capture Ready):** Schema được thiết lập với `REPLICA IDENTITY FULL` để dịch vụ `tamper-watcher` bám sát luồng WAL (Write-Ahead Log) qua Logical Replication.

---

## 🏛️ 2. Mô Hình Dữ Liệu & Prisma Schema

```text
┌──────────────────────────────────────┐       ┌──────────────────────────────────────┐
│             audit_logs               │       │             epoch_blocks             │
├──────────────────────────────────────┤       ├──────────────────────────────────────┤
│ id (PK)                              │       │ epoch_number (PK)                    │
│ sequence (UNIQUE)                    │◄──────┤ start_sequence                       │
│ epoch_number ────────────────────────┼──────►│ end_sequence                         │
│ timestamp                            │       │ total_logs                           │
│ actor (JSONB)                        │       │ merkle_root                          │
│ action                               │       │ previous_epoch_root                  │
│ resource (JSONB)                     │       │ signature (Ed25519)                  │
│ payload (JSONB)                      │       │ signer_public_key                    │
│ leaf_hash (SHA-256)                  │       │ anchored (BOOLEAN)                   │
│ created_at                           │       │ anchor_tx_hash                       │
└──────────────────────────────────────┘       │ created_at                           │
                                               └──────────────────┬───────────────────┘
                                                                  │
                                                                  ▼
                                               ┌──────────────────────────────────────┐
                                               │          external_anchors            │
                                               ├──────────────────────────────────────┤
                                               │ id (PK)                              │
                                               │ epoch_number (FK)                    │
                                               │ merkle_root                          │
                                               │ anchor_type                          │
                                               │ tx_hash                              │
                                               │ anchored_at                          │
                                               └──────────────────────────────────────┘
```

File khai báo schema nằm tại [`prisma/schema.prisma`](file:///home/thanhlong/Documents/aegis-ledger-workspace/libs/database/prisma/schema.prisma):
* **`AuditLog`**: Đại diện cho lá Merkle trong chuỗi (Append-Only).
* **`EpochBlock`**: Đại diện cho khối Epoch chốt sổ chứa Merkle Root và chữ ký số Ed25519.
* **`ExternalAnchor`**: Quản lý lịch sử các mốc kiểm toán được neo ngoại vi.

---

## 🛡️ 3. Cơ Chế WORM & Bảo Vệ Đa Tầng (Defense-in-Depth)

Hệ thống bảo vệ cơ sở dữ liệu qua 3 tầng phòng vệ độc lập:

```text
┌────────────────────────────────────────────────────────┐
│ TẦNG 1: Ứng dụng & Prisma Client Layer                 │
│ Repository chỉ cung cấp hàm insertLeaf, findBySequence  │
│ KHÔNG CÓ bất kỳ hàm update/delete nào trong API        │
└──────────────────────────┬─────────────────────────────┘
                           │ (Nếu kẻ tấn công inject SQL / truy cập trực tiếp DB)
                           ▼
┌────────────────────────────────────────────────────────┐
│ TẦNG 2: PostgreSQL WORM Triggers (PL/pgSQL)            │
│ Trigger chặn đứng mọi UPDATE/DELETE ném lỗi 55000      │
└──────────────────────────┬─────────────────────────────┘
                           │ (Nếu Superuser tắt Trigger: DISABLE TRIGGER)
                           ▼
┌────────────────────────────────────────────────────────┐
│ TẦNG 3: Postgres Logical Replication (CDC)             │
│ Service "tamper-watcher" bắt WAL Stream báo động <200ms │
└────────────────────────────────────────────────────────┘
```

### 3.1. PL/pgSQL Trigger Cấm Can Thiệp trên `audit_logs`
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

---

## 📁 4. Cấu Trúc Mã Nguồn

```text
libs/database/
├── prisma/
│   ├── schema.prisma                    # Prisma Declarative Schema
│   └── worm-rules.sql                   # SQL Triggers & CDC REPLICA IDENTITY
├── src/
│   ├── index.ts                         # Public API re-export
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
│   ├── database.module.ts               # NestJS Global Database Module
│   └── database.spec.ts                 # Bộ kiểm thử tích hợp (11/11 tests passed)
├── jest.config.js                       # Cấu hình Jest & ts-jest
├── project.json                         # Cấu hình dự án Nx (@aegis/database)
├── tsconfig.lib.json                    # Cấu hình TypeScript
├── PLAN.md                              # Kế hoạch triển khai & nghiệm thu
└── README.md                            # Tài liệu hướng dẫn sử dụng này
```

---

## ⚙️ 5. Cấu Hình & Chạy Lệnh

### 5.1. Biến Môi Trường (Environment Variables)

Cấu hình nằm trong `.env`:
```env
DATABASE_URL="postgresql://aegis_admin:aegis_secure_password_2026@localhost:5432/aegis_ledger_db?schema=public"
```

### 5.2. Các Lệnh Thao Tác Cơ Sở Dữ Liệu

```bash
# Đẩy schema Prisma vào PostgreSQL
npm run db:push

# Sinh Prisma Client
npm run db:generate

# Chạy bộ test kiểm thử của database (gồm cả test WORM Trigger)
npm run test:database
```

---

## 💻 6. Mẫu Tích Hợp & Sử Dụng trong Mã Nguồn

### 6.1. Tích Hợp Vào NestJS Module
```typescript
import { Module } from '@nestjs/common';
import { DatabaseModule } from '@aegis/database';

@Module({
  imports: [DatabaseModule],
})
export class AppModule {}
```

### 6.2. Ghi Nguyên Tử Một Epoch (Atomic Batch Commit)
Trong `apps/audit-ledger`, khi gom đủ lô 5–10 logs, toàn bộ lá và khối Epoch được ghi trong 1 transaction:

```typescript
import { EpochBatchService } from '@aegis/database';
import { IAuditLogLeaf, IEpochBlock } from '@aegis/contracts';

@Injectable()
export class EpochCommitService {
  constructor(private readonly epochBatchService: EpochBatchService) {}

  async commitEpoch(logs: IAuditLogLeaf[], epochBlock: IEpochBlock): Promise<void> {
    const result = await this.epochBatchService.commitEpochBatch({
      epochBlock,
      logs,
    });
    console.log(`Epoch #${result.epochNumber} committed successfully with ${result.totalLogs} logs.`);
  }
}
```

---

## 🧪 7. Kiểm Thử & Nghiệm Thu (Acceptance Criteria)

Bộ kiểm thử của thư viện bảo đảm:
1. **Prisma Schema Sync:** Bảng, chỉ mục và quan hệ đồng bộ 100% với PostgreSQL container.
2. **Append-Only Write Test:** Bản ghi log và epoch block ghi thành công với sequence đơn điệu tăng dần.
3. **Atomic Transaction Test:** Ghi đồng thời lô logs và epoch block an toàn, rollback nếu có lỗi.
4. **WORM Policy Enforcement Test (Crucial):**
   - Khi chạy `UPDATE "audit_logs" SET "action" = 'HACKED' WHERE id = '...'` $\rightarrow$ Database ném lỗi `55000: SECURITY BREACH [WORM POLICY]`.
   - Khi chạy `DELETE FROM "audit_logs" WHERE id = '...'` $\rightarrow$ Database từ chối và rollback.
   - Khi cố tình sửa các trường mật mã (`merkle_root`) trên `epoch_blocks` $\rightarrow$ Database từ chối.
   - Cập nhật trạng thái neo (`anchored`) trên `epoch_blocks` $\rightarrow$ Được phép.
