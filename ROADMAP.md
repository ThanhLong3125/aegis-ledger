# 🗺️ AegisLedger - Lộ Trình & Thứ Tự Triển Khai Hệ Thống (Architecture Roadmap)

> **Dự án:** AegisLedger - Autonomous Cryptographic Audit Trail & Tamper-Detection Engine  
> **Kiến trúc:** Nx Monorepo, Event-Driven Architecture, Applied Cryptography & Database CDC  
> **Tài liệu:** Kim chỉ nam quy định thứ tự ưu tiên triển khai từng thành phần (Phase-by-Phase Execution Plan).

---

## 🧭 1. Triết Lý Thiết Kế & Nguyên Tắc Xác Định Thứ Tự Ưu Tiên

Trong kiến trúc **Nx Monorepo** và **Distributed Systems**, thứ tự xây dựng các thành phần **bắt buộc** phải tuân theo nguyên lý:
> **"Bottom-Up & Dependency-Inversion" (Từ gốc rễ phụ thuộc thấp nhất đi lên)**

1. **Hạ tầng trước (Docker / Storage / Message Broker):** Không thể viết và test code database/Kafka nếu container chưa có sẵn.
2. **Hợp đồng dữ liệu (Contracts) làm nền móng:** Định nghĩa chuẩn giao tiếp trước để mọi service nói chung một ngôn ngữ, tránh sai lệch mã băm mật mã.
3. **Thư viện lõi (Core Libraries) độc lập:** Thư viện mật mã toán học và truy cập database phải hoàn chỉnh 100% trước khi ghép vào ứng dụng.
4. **Ứng dụng nghiệp vụ (Microservices):** Xây dựng theo đúng chiều chảy của dòng dữ liệu (*Ingestion $\rightarrow$ Batching/Signing $\rightarrow$ Storage $\rightarrow$ Real-time Watcher $\rightarrow$ Visual Dashboard*).
5. **Kịch bản tấn công (Attack Scripts & CLI):** Thực hiện sau cùng để kiểm chứng năng lực tự vệ của toàn bộ hệ thống.

---

## 📊 2. Sơ Đồ Tổng Quan Thứ Tự Triển Khai (Phase Workflow)

```mermaid
flowchart TD
    subgraph Phase 1: Nền tảng & Hạ tầng [ĐÃ HOÀN THÀNH]
        DOK["1. tools/docker<br>(Postgres WAL Logical, Redis, Kafka KRaft)"]
        CTR["2. libs/contracts<br>(Enums, DTOs, Interfaces, Zod/Class-validator)"]
    end

    subgraph Phase 2: Trái tim Mật mã học [ĐÃ HOÀN THÀNH]
        CRY["3. libs/crypto-core<br>(Canonical JSON, SHA-256, Merkle Tree, Ed25519)"]
    end

    subgraph Phase 3: Tầng Dữ liệu & Truyền thông [ĐÃ HOÀN THÀNH]
        DB["4. libs/database<br>(Prisma WORM Datastore, Triggers cấm UPDATE/DELETE) [ĐÃ XONG]"]
        BUS["5. libs/event-bus<br>(Kafka Producer/Consumer wrapper với stream key) [ĐÃ XONG]"]
    end

    subgraph Phase 4: Microservices Xử lý Lõi
        LED["6. apps/audit-ledger<br>(Ingestion, Buffer 5-10 logs hoặc 2s, Merkle Tree & Ký số) [ĐÃ XONG]"]
        WAL["7. apps/wallet-core<br>(Mock Service tạo giao dịch chuyển tiền bắn Kafka)"]
    end

    subgraph Phase 5: Giám sát Tức thì & Tự vệ Chủ động
        WAT["8. apps/tamper-watcher<br>(Lắng nghe CDC Postgres WAL, Telegram Alert trong <200ms)"]
        CLI["9. apps/audit-cli<br>(CLI kiểm toán O(log N) Merkle Proof, đối chiếu Anchor)"]
    end

    subgraph Phase 6: Trực quan hóa & Kịch bản Tấn công
        DSH["10. apps/audit-dashboard<br>(Web Next.js/Vite Real-time Merkle Visualizer)"]
        ATK["11. tools/scripts<br>(demo-attack-modify, delete, rewrite)"]
    end

    DOK --> CTR --> CRY --> DB --> BUS --> LED --> WAL --> WAT --> CLI --> DSH --> ATK
```

---

## 🔍 3. Chi Tiết Từng Bước (Steps), Lý Do "Vì Sao" & Tiêu Chí Nghiệm Thu (Acceptance Criteria)

---

### ✅ BƯỚC 1: `tools/docker` (Hạ tầng Ảo hóa) - [ĐÃ XONG]
* **Mục đích:** Cung cấp môi trường chạy cơ sở dữ liệu và message broker tại local.
* **Vì sao làm trước:** Nếu không có PostgreSQL hỗ trợ `wal_level=logical` và Kafka, các service phía sau không thể chạy hay kiểm thử tích hợp (Integration Test).
* **Thành phần:**
  * `docker-compose.postgres.yml`: Postgres 16 cấu hình Logical Replication cho CDC.
  * `docker-compose.redis.yml`: Redis cache & cờ Active Defense (`LOCK_WITHDRAWALS`).
  * `docker-compose.kafka.yml`: Kafka 3.7 KRaft mode (siêu nhẹ, không cần Zookeeper).
  * `docker-compose.yml`: File master include 3 file trên.

---

### ✅ BƯỚC 2: `libs/contracts` (Giao ước Dữ liệu & Single Source of Truth) - [ĐÃ XONG]
* **Mục đích:** Định nghĩa Enums, TypeScript Interfaces và Class DTOs có Decorators (`class-validator`).
* **Vì sao làm trước:** 
  * Cả 5 service (`wallet-core`, `audit-ledger`, `tamper-watcher`, `audit-cli`, `audit-dashboard`) đều phụ thuộc vào schema này.
  * Đảm bảo tính nhất quán của dữ liệu đầu vào. Chỉ cần lệch kiểu dữ liệu hoặc thứ tự trường, mã băm SHA-256 sẽ sai khác và làm sụp đổ toàn bộ cây Merkle.
* **Tiêu chí nghiệm thu:** Unit test kiểm tra validation DTOs đạt 100% (5/5 passed).

---

### ✅ BƯỚC 3: `libs/crypto-core` (Trái tim Mật mã học) - [ĐÃ XONG]
* **Mục đích:** Xây dựng toàn bộ thuật toán toán học mật mã độc lập với framework.
* **Vì sao làm ở bước này:**
  * Đây là **"vũ khí cốt lõi"** chứng minh năng lực Security Engineering.
  * Không phụ thuộc vào Database hay Kafka. Chỉ thuần túy là thuật toán Node.js `crypto` và logic dựng cây.
  * Có thể viết Unit Test kiểm thử toán học 100% trước khi nối vào app.
* **Các module cần xây dựng:**
  1. `canonical-json`: Thuật toán chuẩn hóa chuỗi JSON (sắp xếp key alphabet, tránh lỗi nhảy key trong JS).
  2. `hasher`: SHA-256 Hasher chuẩn RFC 6234.
  3. `merkle-tree`:
     * Dựng cây nhị phân Bottom-Up từ danh sách lá (`leafHashes`).
     * Tự động nhân đôi lá lẻ khi số lượng lá không chia hết cho 2.
     * Hàm lấy `getRoot()`.
     * Hàm sinh đường dẫn chứng minh `getProof(index)` độ phức tạp $O(\log N)$.
     * Hàm kiểm tra độc lập `verifyProof(leafHash, proof, expectedRoot)`.
  4. `signer-ed25519`:
     * Sinh cặp khóa Ed25519 (`private_key.pem`, `public_key.pem`).
     * Ký số lên Merkle Root: `signRoot(root, privateKey)`.
     * Xác minh chữ ký: `verifySignature(root, signature, publicKey)`.
* **Tiêu chí nghiệm thu:** Bộ Unit Test Jest với 100% coverage cho Merkle Tree & Ed25519 signing.

---

### ✅ BƯỚC 4: `libs/database` (Kho Lưu Trữ WORM & Prisma Schema) - [ĐÃ XONG]
* **Mục đích:** Cung cấp tầng truy cập dữ liệu trực quan bằng Prisma ORM cho PostgreSQL kết hợp WORM Security Rules.
* **Vì sao làm ở bước này:**
  * `audit-ledger` cần schema bảng để lưu log; `tamper-watcher` cần schema để parse CDC; `audit-cli` cần schema để đọc dữ liệu kiểm toán.
* **Các module đã xây dựng:**
  1. Định nghĩa Prisma Schema cho 3 bảng:
     * `audit_logs` (Lá Merkle - Append-Only).
     * `epoch_blocks` (Khối Epoch chứa Root và Chữ ký số Ed25519).
     * `external_anchors` (Mốc neo kiểm toán ngoại vi).
  2. **WORM Security Rules & CDC:**
     * Viết Trigger PL/pgSQL chặn cứng quyền `UPDATE` và `DELETE` trên bảng `audit_logs` ngay tại tầng nhân DB (mã lỗi `55000`).
     * Trigger bảo vệ tính bất biến của các trường mật mã trên `epoch_blocks` (`merkle_root`, `signature`...).
     * Trigger cấm UPDATE và DELETE trên `external_anchors` bảo vệ mốc neo ngoại vi.
     * Kích hoạt `REPLICA IDENTITY FULL` cho PostgreSQL CDC.
     * Cung cấp `EpochBatchService` thực thi Atomic Transaction cho Epoch chốt sổ.
* **Tiêu chí nghiệm thu:** Bộ Unit/Integration Test Jest chạy trên PostgreSQL container đạt **100% (13/13 passed)**; thử chạy lệnh SQL `UPDATE` / `DELETE` bị database từ chối ngay lập tức.

---

### ✅ BƯỚC 5: `libs/event-bus` (Hạ tầng Giao tiếp Message Stream) - [ĐÃ XONG]
* **Mục đích:** Đóng gói thư viện Kafka Client (KafkaJS) chuẩn hóa.
* **Vì sao làm ở bước này:** Tránh việc mỗi app phải tự cấu hình Kafka producer/consumer lặp đi lặp lại.
* **Các module đã xây dựng:**
  * `KafkaProducerService`: Bắn sự kiện `AuditEvent` vào topic kèm `streamKey` (ví dụ `walletId`) để phân chia partition, hỗ trợ Idempotent Producer và Distributed Tracing headers.
  * `KafkaConsumerService`: Consumer wrapper hỗ trợ tự động deserialize và validate bằng DTO của `libs/contracts`, cơ chế Poison Pill Protection chuyển hướng sang Dead Letter Queue (`.dlq`).
  * `EventBusModule`: Dynamic Module NestJS hỗ trợ `forRoot()` và `forRootAsync()`.
* **Tiêu chí nghiệm thu:** Bộ Unit Test Jest với **100% coverage (8/8 tests passed)** kiểm thử thành công Producer, Consumer DTO validation, DLQ routing và Dynamic Module.

---

### ✅ BƯỚC 6: `apps/audit-ledger` (Microservice Xử lý Ingestion & Epoch Engine) - [ĐÃ XONG]
* **Mục đích:** Trọng tâm xử lý của toàn bộ hệ sinh thái AegisLedger.
* **Vì sao làm ở bước này:** Sau khi đã có `libs/crypto-core`, `libs/database`, `libs/event-bus`, ta ghép chúng lại thành Ingestion Pipeline.
* **Các module đã xây dựng:**
  * `inbound/`: `AuditEventConsumer` lắng nghe Kafka topic `audit.events`, validate schema `AuditEventDto`, cách ly poison pills vào DLQ.
  * `buffer/`: `SlidingWindowService` với cơ chế Dual-Trigger (ngưỡng dung lượng 5-10 logs hoặc timeout 2s), `BufferMutex` chống race-condition.
  * `engine/`: `EpochEngineService` tính toán Leaf Hashes (SHA-256 kèm domain separation `0x00`), dựng Merkle Tree nhị phân, ký số Ed25519; `SequenceTrackerService` đảm bảo sequence tăng dần liên tục ($1, 2, 3 \dots$).
  * `keys/`: `ValidatorKeyProvider` quản lý cặp khóa Ed25519 và sinh raw hex 64 ký tự tương thích cột `signer_public_key`.
  * `outbound/`: `EpochPersistenceService` gọi `EpochBatchService` commit nguyên tử mảng logs và epoch block vào PostgreSQL WORM; `EpochBroadcasterService` phát sự kiện real-time.
  * `main.ts`: Bootstrap NestJS Application Context kèm hook Graceful Shutdown bảo toàn 100% dữ liệu trong buffer khi tắt service.
* **Tiêu chí nghiệm thu:** Toàn bộ 3 test suites với **100% tests passed (9/9 passed)** gồm Unit test Buffer, Unit test Epoch Engine, và E2E Integration test trên PostgreSQL container thực tế.

---

### ✅ BƯỚC 7: `apps/wallet-core` (Microservice Nghiệp vụ Giả lập & Active Defense) - [ĐÃ XONG]
* **Mục đích:** Mô phỏng ứng dụng tài chính thực tế để phát sinh giao dịch, đồng thời là điểm thực thi cơ chế tự vệ chủ động (Active Defense).
* **Vì sao làm ở bước này:** Khi `audit-ledger` đã sẵn sàng đón nhận dữ liệu, `wallet-core` sẽ là nguồn phát sinh dữ liệu thử nghiệm, đồng thời kiểm chứng khả năng đóng băng giao dịch rút tiền khi hệ thống bị tấn công.
* **Các module đã xây dựng:**
  * `config/`: Quản lý cấu hình Kafka, Redis (`AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS`), HTTP Port thông qua `WalletConfigService`.
  * `defense/`:
    * `RedisDefenseService`: Kết nối Redis kiểm tra và cập nhật cờ tự vệ chủ động.
    * `ActiveDefenseGuard`: Intercept các endpoint nguy hiểm, quăng ngoại lệ **HTTP 423 Locked** khi cờ tự vệ được kích hoạt.
  * `common/`: Decorator `@ClientInfo()` trích xuất IP, User-Agent, Device-Id từ HTTP Request Headers.
  * `auth/`:
    * `POST /auth/login`: Xác thực tài khoản, bắn sự kiện `USER_LOGIN_SUCCESS` hoặc `USER_LOGIN_FAILED` vào Kafka.
    * `POST /auth/logout`: Đăng xuất, bắn sự kiện `USER_LOGOUT` vào Kafka.
  * `wallets/`:
    * `WalletStore`: Lưu trữ in-memory trạng thái ví và lịch sử giao dịch (seed sẵn ví `wal_alice_usd` và `wal_bob_usd`).
    * `POST /wallets`: Khởi tạo ví mới.
    * `GET /wallets/:id`: Tra cứu thông tin và số dư ví.
    * `POST /wallets/deposit`: Nạp tiền, tăng số dư, phát sự kiện `WALLET_DEPOSIT`.
    * `POST /wallets/withdraw`: Rút tiền, bảo vệ bởi `ActiveDefenseGuard`, phát sự kiện `WALLET_WITHDRAW`.
    * `POST /wallets/transfer`: Chuyển khoản nội bộ giữa 2 ví, bảo vệ bởi `ActiveDefenseGuard`, phát sự kiện `WALLET_TRANSFER`.
    * `GET /wallets/:id/history`: Tra cứu lịch sử biến động số dư.
  * `main.ts` & `app.module.ts`: Khởi động NestJS Express Server với `ValidationPipe` toàn cục.
* **Tiêu chí nghiệm thu:** Bộ Unit và E2E Integration tests đạt **100% (25/25 tests passed)**, xác minh chặn đứng giao dịch khi có cờ đỏ Redis và thông suốt khi hệ thống an toàn.

---

### ⏳ BƯỚC 8: `apps/tamper-watcher` (Autonomous Active Defense qua Postgres CDC)
* **Mục đích:** Giám sát thời gian thực, phát hiện xâm nhập và tự vệ trong `< 200ms`.
* **Vì sao làm ở bước này:** Cần có dữ liệu thực tế đang ghi vào PostgreSQL thì Watcher mới có luồng WAL để giám sát.
* **Cơ chế hoạt động:**
  1. Gắn vào PostgreSQL Logical Replication Stream.
  2. Bảng `audit_logs` là Append-Only, do đó:
     * Thấy event `INSERT` $\rightarrow$ Tính nhẩm lại `leafHash` xem có đúng không.
     * Thấy event **`UPDATE`** hoặc **`DELETE`** $\rightarrow$ **LẬP TỨC BÁO ĐỘNG ĐỎ TRONG < 200MS**:
       * Bắn tin nhắn khẩn cấp qua **Telegram Bot**.
       * Gửi tín hiệu WebSocket cảnh báo sang Web Dashboard.
       * Set cờ Redis: `LOCK_WITHDRAWALS=true` (Active Defense: đóng băng cổng rút tiền).

---

### ⏳ BƯỚC 9: `apps/audit-cli` (Công cụ Kiểm toán Độc lập)
* **Mục đích:** Công cụ dòng lệnh dành cho kiểm toán viên bên thứ ba hoặc người dùng tự xác minh tính toàn vẹn.
* **Lệnh hỗ trợ:**
  * `audit-cli verify`: Quét toàn bộ chuỗi Epoch và đối chiếu với External Anchor.
  * `audit-cli prove --seq <number>`: Xuất bằng chứng mật mã Merkle Proof $O(\log N)$ cho một giao dịch cụ thể để người dùng tự kiểm tra trên máy cá nhân.

---

### ⏳ BƯỚC 10: `apps/audit-dashboard` (Giao diện Web Trực quan Real-time)
* **Mục đích:** Trực quan hóa toàn bộ hệ thống bằng Next.js/Vite + Socket.io.
* **Tính năng hiển thị:**
  * Sơ đồ tương tác Cây Merkle (Visual Merkle Tree View).
  * Hiển thị trạng thái các Epoch nối xích với nhau (màu xanh lá).
  * Khi có cuộc tấn công sửa DB: Khối bị sửa lập tức nhấp nháy chuyển sang **MÀU ĐỎ**, còi báo động hú trên trình duyệt.

---

### ⏳ BƯỚC 11: `tools/scripts` (Bộ Kịch bản Tấn công Demo Showcase)
* **Mục đích:** Bộ script chuẩn bị sẵn cho buổi phỏng vấn hoặc quay video demo kỹ thuật.
* **Các kịch bản:**
  * `demo-attack-modify.sh`: Hacker chạy lệnh SQL sửa số tiền ở Block cũ $\rightarrow$ Watcher bắt trong < 200ms qua CDC.
  * `demo-attack-delete.sh`: Hacker chạy SQL xóa 1 dòng log $\rightarrow$ Watcher báo gãy chuỗi sequence.
  * `demo-attack-rewrite.sh`: Hacker sửa data và tự tính lại Root nội bộ $\rightarrow$ Bị bắt quả tang khi đối chiếu với External Anchor.

---

## 📌 Bảng Tóm Tắt Trạng Thái & Kế Hoạch Tiếp Theo

| Bước | Thành phần | Trạng thái | Nhiệm vụ chính |
| :---: | :--- | :---: | :--- |
| **1** | `tools/docker` |  **Hoàn thành** | Postgres WAL logical, Redis, Kafka KRaft |
| **2** | `libs/contracts` |  **Hoàn thành** | Enums, DTOs (`class-validator`), Interfaces, Unit tests passed |
| **3** | `libs/crypto-core` | ✅ **Hoàn thành** | Canonical JSON, SHA-256, Merkle Tree $O(\log N)$, Ed25519 Signing (24/24 tests passed) |
| **4** | `libs/database` | ✅ **Hoàn thành** | Prisma WORM Datastore, PostgreSQL Triggers chặn UPDATE/DELETE trên cả 3 bảng (13/13 tests passed) |
| **5** | `libs/event-bus` | ✅ **Hoàn thành** | Kafka Producer/Consumer wrappers, DTO auto-validation, DLQ routing (8/8 tests passed) |
| **6** | `apps/audit-ledger` | ✅ **Hoàn thành** | Ingestion pipeline, Dual-trigger Buffer (size/time), Merkle Tree, Ed25519, PostgreSQL WORM atomic commit (9/9 tests passed) |
| **7** | `apps/wallet-core` | 🎯 **Ưu tiên tiếp theo** | Mock API nạp/chuyển tiền bắn Kafka |
| **8** | `apps/tamper-watcher`| ⏳ Chờ | CDC Logical Replication, Telegram Alert, Active Defense |
| **9** | `apps/audit-cli` | ⏳ Chờ | CLI verify chuỗi & sinh Merkle Proof |
| **10**| `apps/audit-dashboard`| ⏳ Chờ | Web giao diện cây Merkle real-time |
| **11**| `tools/scripts` | ⏳ Chờ | 3 kịch bản demo tấn công |

---

*Tài liệu này là kim chỉ nam chính thức điều hướng toàn bộ quá trình phát triển của dự án AegisLedger.*
