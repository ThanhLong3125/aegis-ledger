# 📖 Giải Mã `@aegis/database`: Từ Tư Duy Mongoose (NoSQL) Đến PostgreSQL, Prisma Schema & WORM Security Rules

> **Mục tiêu tài liệu:** Dành riêng cho các kỹ sư quen thuộc với MongoDB/Mongoose lần đầu tiếp cận Cơ sở dữ liệu Quan hệ (SQL), Prisma ORM và kiến trúc bảo mật chống giả mạo tại tầng nhân cơ sở dữ liệu.  
> **Tài liệu trả lời:**  
> 1. *Tại sao Prisma không viết schema bằng code TypeScript như Mongoose?*  
> 2. *Từng dòng cú pháp trong `schema.prisma` và `worm-rules.sql` có ý nghĩa gì?*  
> 3. *Client, Repository, Service là gì và phân vai trong hệ thống thế nào?*  
> 4. *Bảng đối chiếu cú pháp 1:1 giữa Mongoose và Prisma.*

---

## 🧭 PHẦN 1: Chuyển Dịch Tư Duy Từ Mongoose (MongoDB) Sang Prisma (PostgreSQL)

### 1.1. Sự khác biệt cốt lõi: NoSQL vs RDBMS

* **MongoDB (NoSQL):** Là cơ sở dữ liệu dạng tài liệu (Document-based). Bảng trong MongoDB gọi là **Collection**, bản ghi gọi là **Document** (thực chất là một JSON/BSON). MongoDB rất linh hoạt, không bắt buộc các document phải có cấu trúc giống hệt nhau.
* **PostgreSQL (RDBMS - SQL):** Là cơ sở dữ liệu quan hệ chặt chẽ. Dữ liệu được tổ chức thành các **Bảng (Tables)**, gồm các **Cột (Columns)** có kiểu dữ liệu cứng (`BIGINT`, `VARCHAR`, `TIMESTAMPTZ`) và các **Hàng (Rows)**. Mọi hàng đều phải tuân thủ 100% cấu trúc đã định nghĩa, không được tùy tiện lệch kiểu.

### 1.2. Tại sao Prisma lại dùng file `.prisma` riêng thay vì viết thẳng code TypeScript như Mongoose?

Trong Mongoose, bạn thường làm:
```typescript
// Mongoose: Schema được viết bằng code JavaScript/TypeScript
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  age: { type: Number }
});
```

**Nhược điểm của cách làm này:**
1. Code TypeScript và cấu trúc Database bị trộn lẫn vào nhau.
2. Bạn phải viết thủ công 2 lần: viết Schema cho Mongoose, rồi lại viết Interface TypeScript (`interface IUser`) để IDE hiểu, rất dễ bị lệch kiểu (Type Drift).

**Cách tiếp cận ưu việt của Prisma:**
Prisma thiết kế một ngôn ngữ mô tả dữ liệu chuyên biệt cực kỳ trực quan gọi là **PSL (Prisma Schema Language)** đặt trong file [`prisma/schema.prisma`](file:///home/thanhlong/Documents/aegis-ledger-workspace/libs/database/prisma/schema.prisma):
```text
┌─────────────────────────┐
│  prisma/schema.prisma   │  ◄── Bạn chỉ cần thiết kế bảng ở duy nhất 1 nơi trực quan này
└────────────┬────────────┘
             │ Chạy lệnh: npx prisma generate
             ▼
┌─────────────────────────┐
│     @prisma/client      │  ◄── Prisma tự động dịch ra 100% TypeScript Types & Model Classes
└─────────────────────────┘
```
👉 Bạn **không cần phải tự tay gõ lại bất kỳ interface hay model nào**. Khi bạn gõ `prisma.auditLog.` trong VS Code, toàn bộ thuộc tính, kiểu dữ liệu, gợi ý phím (autocomplete) sẽ hiện ra chính xác tuyệt đối!

---

## 📐 PHẦN 2: Giải Mã Từng Dòng Code Trong `prisma/schema.prisma`

Hãy cùng bóc tách từng khối lệnh trong file [`schema.prisma`](file:///home/thanhlong/Documents/aegis-ledger-workspace/libs/database/prisma/schema.prisma):

### 2.1. Khối Cấu hình Hạ Tầng

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
```
* `datasource db`: Nói cho Prisma biết bạn đang dùng hệ quản trị nào (`postgresql`) và chuỗi kết nối lấy từ biến môi trường `DATABASE_URL` (ví dụ: `postgresql://aegis_admin:pass@localhost:5432/db`).
* `generator client`: Chỉ thị cho Prisma tự động sinh ra thư viện TypeScript `@prisma/client` để code ứng dụng sử dụng.

---

### 2.2. Model `AuditLog` (Tương đương Mongoose Schema `AuditLog`)

```prisma
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
```

**Giải thích từng từ khóa:**
1. `id String @id @default(uuid())`:
   * `@id`: Khai báo đây là Khóa chính (Primary Key - giống `_id` trong MongoDB).
   * `@default(uuid())`: Nếu lúc tạo không truyền `id`, Prisma sẽ tự động sinh UUID v4 ngẫu nhiên.
2. `sequence BigInt @unique`:
   * `BigInt`: Số nguyên 64-bit cực lớn (từ $-2^{63}$ đến $2^{63}-1$). Chúng ta **không dùng kiểu `Int` (32-bit)** vì số lượng audit log trong hệ thống tài chính có thể lên tới hàng trăm triệu hoặc hàng tỷ bản ghi. Kiểu `Int` thường chỉ đếm tới 2.1 tỷ là bị tràn số (Overflow crash).
   * `@unique`: Đảm bảo không bao giờ có 2 log trùng số thứ tự `sequence`.
3. `@map("epoch_number")`:
   * Trong code TypeScript, ta thích đặt tên theo chuẩn camelCase (`epochNumber`).
   * Nhưng trong cơ sở dữ liệu PostgreSQL, chuẩn đặt tên là snake_case (`epoch_number`).
   * `@map` giúp kết nối hai thế giới này mượt mà mà bạn không cần phải đổi thói quen viết code.
4. `actor Json @db.JsonB` và `payload Json @db.JsonB`:
   * Trong MongoDB, bạn có thể lưu Object lồng nhau tự do. Trong PostgreSQL, kiểu `JSONB` (Binary JSON) cho phép bạn lưu toàn bộ một object JavaScript vào một cột duy nhất, vừa linh hoạt như MongoDB, vừa có tốc độ đọc cực nhanh vì đã được nén dạng nhị phân.
5. `@relation(...)` (Quan hệ Khóa Ngoại - Foreign Key):
   * Đây là điểm khác biệt lớn nhất so với MongoDB:
   * Trong MongoDB, nếu bạn xóa 1 `Epoch`, các `AuditLog` con có thể bị bỏ quên biến thành rác (Orphan documents).
   * Trong PostgreSQL, `@relation` quy định: Trường `epochNumber` của log **bắt buộc phải tồn tại trong bảng `EpochBlock`**. Nếu không, cơ sở dữ liệu sẽ từ chối ngay. Cờ `onDelete: Restrict` cấm tuyệt đối việc xóa Epoch nếu bên trong nó vẫn còn chứa logs!
6. `@@index(...)`:
   * Tạo cây chỉ mục (B-Tree Index) giúp câu lệnh tìm kiếm log theo `leafHash` hoặc `sequence` chạy trong tích tắc ($O(\log N)$) thay vì phải quét toàn bộ hàng triệu dòng trong ổ cứng.
7. `@@map("audit_logs")`: Đặt tên bảng vật lý thực tế trong PostgreSQL là `audit_logs`.

---

## 🔒 PHẦN 3: Giải Mã File `prisma/worm-rules.sql` (Chiếc Ổ Khóa Tại Tầng Nhân)

File [`worm-rules.sql`](file:///home/thanhlong/Documents/aegis-ledger-workspace/libs/database/prisma/worm-rules.sql) không phải là code ứng dụng, mà là các câu lệnh SQL cài trực tiếp vào bộ não của cơ sở dữ liệu PostgreSQL.

### 3.1. Tại sao cần có WORM Trigger khi đã có code TypeScript?

Hãy hình dung một kịch bản tấn công nguy hiểm:
* Trong code TypeScript của chúng ta, ta chỉ viết hàm `insertLeaf()`, không hề viết hàm `update()` hay `delete()`.
* **Nhưng nếu:** Một DBA nội bộ bị mua chuộc, hoặc một hacker tìm ra mật khẩu Admin của PostgreSQL, họ sẽ **không dùng code TypeScript của bạn nữa**. Họ mở terminal lên, gõ trực tiếp vào PostgreSQL:
  ```sql
  DELETE FROM audit_logs WHERE id = 'compromised-event-id';
  ```
* Nếu không có Trigger ở tầng nhân cơ sở dữ liệu, câu lệnh trên sẽ xóa sạch dữ liệu kiểm toán mà code ứng dụng không hề hay biết!

### 3.2. Bóc tách từng đoạn trong `worm-rules.sql`:

#### Đoạn 1: Bật `REPLICA IDENTITY FULL` cho CDC
```sql
ALTER TABLE IF EXISTS "audit_logs" REPLICA IDENTITY FULL;
```
* **Ý nghĩa:** Ở Bước 8 ([ROADMAP.md](../../ROADMAP.md)), dịch vụ `tamper-watcher` sẽ bám vào luồng ghi nhật ký giao dịch WAL (Write-Ahead Log) của PostgreSQL để giám sát tức thì.
* Cờ `REPLICA IDENTITY FULL` bắt buộc PostgreSQL khi có bất kỳ ai tác động vào dòng dữ liệu thì phải ghi lại **toàn bộ giá trị cũ (OLD) và giá trị mới (NEW)** vào log để `tamper-watcher` có đầy đủ bằng chứng bắt quả tang trong $< 200\text{ms}$.

#### Đoạn 2: Trigger cấm tiệt `UPDATE` và `DELETE` trên `audit_logs`
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
* `TG_OP`: Là biến đặc biệt của PostgreSQL lưu tên thao tác vừa chạy (`UPDATE` hoặc `DELETE`).
* `BEFORE UPDATE OR DELETE`: Trước khi PostgreSQL kịp ghi đè hoặc xóa bất kỳ byte dữ liệu nào, chiếc phanh này lập tức kích hoạt.
* `RAISE EXCEPTION ... USING ERRCODE = '55000'`: Lập tức ngắt kết nối, hủy bỏ toàn bộ câu lệnh và quẳng ra mã lỗi bảo mật `55000`. Dữ liệu được bảo toàn nguyên vẹn 100%!

#### Đoạn 3: Trigger khóa cứng thuộc tính mật mã trên `epoch_blocks`
```sql
CREATE OR REPLACE FUNCTION fn_enforce_epoch_blocks_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'SECURITY BREACH [WORM POLICY]: Deleting records from "epoch_blocks" is strictly forbidden.';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.epoch_number <> NEW.epoch_number OR
           OLD.merkle_root <> NEW.merkle_root OR
           OLD.signature <> NEW.signature THEN
            RAISE EXCEPTION 'SECURITY BREACH [WORM POLICY]: Modifying cryptographic properties is strictly forbidden.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```
* Khối Epoch cần được phép cập nhật khi đã neo ra Blockchain ngoại vi (`anchored = true`).
* Do đó, đoạn code trên so sánh giá trị cũ (`OLD`) và giá trị mới (`NEW`): **Nếu ai đó dám sửa đổi `merkle_root` hoặc chữ ký `signature`, database sẽ chặn ngay lập tức**. Nhưng nếu chỉ cập nhật trạng thái neo mốc (`anchored`), nó sẽ cho qua!

---

## 🏛️ PHẦN 4: Phân Tích Kiến Trúc: Client, Repositories, Services Trong Code TypeScript

Trong thư mục [`libs/database/src`](file:///home/thanhlong/Documents/aegis-ledger-workspace/libs/database/src), code được chia thành 4 lớp rõ ràng:

```text
┌────────────────────────────────────────────────────────┐
│                   DatabaseModule                       │
│    (Đóng gói NestJS Module, xuất Service & Repo)       │
└──────────────────────────┬─────────────────────────────┘
                           │
       ┌───────────────────┴───────────────────┐
       ▼                                       ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│       Services Layer         │ │      Repositories Layer      │
│  - EpochBatchService         │ │  - AuditLogRepository        │
│  - WormManagerService        │ │  - EpochBlockRepository      │
│                              │ │  - ExternalAnchorRepository  │
└──────────────┬───────────────┘ └──────────────┬───────────────┘
               │                                │
               └───────────────┬────────────────┘
                               ▼
               ┌──────────────────────────────┐
               │         Client Layer         │
               │  - PrismaService             │
               └───────────────┬──────────────┘
                               ▼
               ┌──────────────────────────────┐
               │    PostgreSQL Database 16    │
               └──────────────────────────────┘
```

### 4.1. Lớp Client (`PrismaService`)
* **File:** [`src/client/prisma.service.ts`](file:///home/thanhlong/Documents/aegis-ledger-workspace/libs/database/src/client/prisma.service.ts)
* **Ý nghĩa:** Kế thừa trực tiếp từ `PrismaClient` của thư viện Prisma.
* **Nhiệm vụ:**
  * Quản lý kết nối tới PostgreSQL khi ứng dụng bật (`onModuleInit` gọi `$connect()`).
  * Đóng kết nối an toàn khi ứng dụng tắt (`onModuleDestroy` gọi `$disconnect()`).
  * Cung cấp helper dọn dẹp dữ liệu khi chạy Unit/Integration Test (`cleanDatabaseForTesting()`).
* *Tương đương trong Mongoose:* Đoạn code `mongoose.connect()` và cấu hình Connection Pool.

---

### 4.2. Lớp Repositories (`AuditLogRepository`, `EpochBlockRepository`)
* **Ý nghĩa mẫu thiết kế (Repository Pattern):** Là lớp đứng giữa che giấu các chi tiết vụn vặt của database. Các lập trình viên viết logic nghiệp vụ chỉ cần gọi các hàm có ý nghĩa rõ ràng như `auditLogRepo.insertLeaf(...)` mà không cần quan tâm bên dưới database dùng câu lệnh gì.
* **Nhiệm vụ chính:**
  1. **Triệt tiêu các hàm nguy hiểm:** Repository chỉ chứa các hàm thêm và đọc dữ liệu (`insertLeaf`, `findBySequence`, `findByEpoch`). Hoàn toàn không có hàm `update` hay `delete`.
  2. **Chuyển đổi kiểu dữ liệu (DTO Mapping):**
     * Trong PostgreSQL, trường `sequence` là kiểu `BigInt` (ví dụ: `1n`).
     * Nhưng trong chuẩn giao tiếp API của toàn monorepo ([`@aegis/contracts`](file:///home/thanhlong/Documents/aegis-ledger-workspace/libs/contracts)), `sequence` là kiểu `number` để các web client dễ dùng.
     * Hàm `toContract()` trong Repository sẽ tự động chuyển đổi qua lại:
       ```typescript
       public toContract(record: AuditLog): IAuditLogLeaf {
         return {
           id: record.id,
           sequence: Number(record.sequence), // Chuyển từ BigInt sang Number
           epochNumber: Number(record.epochNumber),
           timestamp: record.timestamp.toISOString(),
           ...
         };
       }
       ```

---

### 4.3. Lớp Services (`EpochBatchService`, `WormManagerService`)
* **Khác gì với Repository?**
  * Repository chỉ tập trung vào **1 bảng dữ liệu duy nhất** (ví dụ: `AuditLogRepository` chỉ lo bảng `audit_logs`).
  * Service là nơi giải quyết **nghiệp vụ phức tạp liên quan đến nhiều bảng cùng lúc** hoặc các logic điều phối hệ thống.

* **Ví dụ thực tế trong `EpochBatchService`:**
  * Khi service `apps/audit-ledger` gom đủ 5–10 logs, nó cần lưu cả 10 logs đó và 1 khối Epoch vào cơ sở dữ liệu.
  * Nếu lưu lần lượt từng cái: lỡ lưu được 5 logs thì server bị cúp điện, DB sẽ bị dở dang, chuỗi Merkle bị gãy!
  * `EpochBatchService` giải quyết việc này bằng **Database Transaction Nguyên tử (Atomic)**:
    ```typescript
    await this.prisma.$transaction(async (tx) => {
      // 1. Tạo khối Epoch
      await this.epochBlockRepo.create(epochBlock, tx);

      // 2. Lưu toàn bộ 10 logs
      await this.auditLogRepo.insertLeaves(logs, tx);
    });
    ```
    Toàn bộ hành động trên được gom thành một thể thống nhất: Hoặc cả khối và 10 logs cùng được lưu thành công, hoặc nếu có bất kỳ lỗi nào xảy ra thì tất cả lập tức bị hủy bỏ (Rollback), đảm bảo tính toàn vẹn tuyệt đối.

---

## 🚀 PHẦN 5: Bảng Tra Cứu Cú Pháp Nhanh (Mongoose vs Prisma)

Khi bạn bắt tay vào code các service tiếp theo, hãy dùng bảng tra cứu này:

| Nhu cầu thao tác | Mongoose (MongoDB) | Prisma (PostgreSQL) |
| :--- | :--- | :--- |
| **Tạo 1 bản ghi** | `await LogModel.create({ ... })` | `await prisma.auditLog.create({ data: { ... } })` |
| **Tạo nhiều bản ghi** | `await LogModel.insertMany([ ... ])` | `await prisma.auditLog.createMany({ data: [ ... ] })` |
| **Tìm theo Khóa chính/Unique** | `await LogModel.findById(id)` | `await prisma.auditLog.findUnique({ where: { id } })` |
| **Tìm theo điều kiện** | `await LogModel.find({ epochNumber: 1 })` | `await prisma.auditLog.findMany({ where: { epochNumber: 1 } })` |
| **Tìm kèm sắp xếp (Sort)** | `LogModel.find().sort({ sequence: -1 })` | `prisma.auditLog.findMany({ orderBy: { sequence: 'desc' } })` |
| **Phân trang (Pagination)** | `LogModel.find().skip(10).limit(20)` | `prisma.auditLog.findMany({ skip: 10, take: 20 })` |
| **Đếm số lượng** | `await LogModel.countDocuments()` | `await prisma.auditLog.count()` |
| **Lấy kèm dữ liệu bảng liên quan** | `LogModel.find().populate('epochBlock')` | `prisma.auditLog.findMany({ include: { epochBlock: true } })` |

---

## 🎯 Tóm Lại Cho Bạn

1. **Prisma Schema (`schema.prisma`)** là bản vẽ thiết kế trung tâm. Bạn sửa bản vẽ, chạy `npm run db:push`, toàn bộ bảng trong PostgreSQL và types trong code TypeScript sẽ tự động cập nhật theo.
2. **WORM Trigger (`worm-rules.sql`)** là ổ khóa bảo mật tại nhân database, bảo vệ hệ thống trước các cuộc tấn công cấp quản trị viên.
3. **Repository & Service** là các lớp TypeScript chuẩn mực giúp mã nguồn rõ ràng, an toàn, dễ bảo trì và mở rộng.
