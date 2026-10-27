# 🛡️ AegisLedger: Immutable Cryptographic Audit Ledger & Autonomous Active Defense

[![Nx Monorepo](https://img.shields.io/badge/Nx-Monorepo-blue.svg?style=flat-square&logo=nx)](https://nx.dev)
[![NestJS](https://img.shields.io/badge/NestJS-11.x-ea2849.svg?style=flat-square&logo=nestjs)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![PostgreSQL WORM](https://img.shields.io/badge/PostgreSQL-16_WORM-336791.svg?style=flat-square&logo=postgresql)](https://www.postgresql.org)
[![Kafka KRaft](https://img.shields.io/badge/Apache_Kafka-3.7_KRaft-231f20.svg?style=flat-square&logo=apachekafka)](https://kafka.apache.org)
[![Redis](https://img.shields.io/badge/Redis-7_Alpine-dc382d.svg?style=flat-square&logo=redis)](https://redis.io)
[![Ed25519](https://img.shields.io/badge/Cryptography-RFC_8032_Ed25519-green.svg?style=flat-square)](https://datatracker.ietf.org/doc/html/rfc8032)
[![Tests Passed](https://img.shields.io/badge/Tests-125%2F125_Passed_(100%25)-brightgreen.svg?style=flat-square)](https://jestjs.io)
[![Defense Latency](https://img.shields.io/badge/Active_Defense-<1ms_SLA-gold.svg?style=flat-square)](https://redis.io)

---

## 📌 1. Giới Thiệu & Vấn Đề Thực Tiễn (Problem Statement)

Trong các hệ sinh thái tài chính, ngân hàng số và Fintech, **Audit Trail (Nhật ký kiểm toán)** là tuyến phòng thủ tối thượng để phục hồi sau sự cố, phân xử tranh chấp và đối soát tuân thủ pháp lý (PCI-DSS, ISO 27001, SOC 2).

Tuy nhiên, các giải pháp lưu trữ nhật ký truyền thống trong cơ sở dữ liệu quan hệ (RDBMS) thường gặp các lỗ hổng chí mạng:
1. **Rogue DBA / Insider Threat:** Quản trị viên cơ sở dữ liệu với quyền `SUPERUSER` hoặc hacker chiếm quyền qua SQL Injection có thể âm thầm chạy lệnh `UPDATE`/`DELETE` để sửa số dư, xóa lịch sử rút tiền mà không để lại bất kỳ dấu vết nào.
2. **Thiếu tính xác thực toán học độc lập:** Kiểm toán viên bên thứ ba buộc phải "tin tưởng mù quáng" vào cơ sở dữ liệu của doanh nghiệp mà không có bằng chứng mật mã học chứng minh dữ liệu chưa từng bị can thiệp.
3. **Phản ứng bị động (Passive Alerting):** Hầu hết các hệ thống SIEM/SOC chỉ phát hiện sai lệch sau nhiều ngày hoặc hàng tuần khi tiến hành đối soát, thời điểm mà kẻ gian đã hoàn tất việc tẩu tán tài sản.

**AegisLedger** được phát triển để giải quyết triệt để 3 bài toán trên thông qua **Kiến trúc Sổ cái Mật mã học Bất biến (Immutable Cryptographic Ledger)** kết hợp cơ chế **Phòng thủ Chủ động Tự trị (Autonomous Active Defense)** với độ trễ phản ứng **$< 1\text{ms}$**.

---

## 🏛️ 2. Kiến Trúc Tổng Thể Hệ Thống (System Architecture)

```
                                ┌────────────────────────────────────────────────────────┐
                                │              NGHIỆP VỤ TÀI CHÍNH (CLIENT)              │
                                │   apps/wallet-core (REST API: Deposit/Withdraw/Transfer)│
                                └──────────────────────────┬─────────────────────────────┘
                                                           │ (Async Event Ingestion)
                                                           ▼
                                ┌────────────────────────────────────────────────────────┐
                                │             HẠ TẦNG MESSAGE STREAMING                  │
                                │   Apache Kafka (KRaft) -> Topic: aegis.audit.events    │
                                └──────────────────────────┬─────────────────────────────┘
                                                           │
                                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        MICROSERVICE XỬ LÝ LÕI: apps/audit-ledger                       │
│  1. Ingestion Sliding Window Buffer (Dual-Trigger: Dung lượng 5-10 logs hoặc timeout 2s)│
│  2. RFC 8785 Canonical JSON Serialization (Chuẩn hóa thứ tự key tất định)              │
│  3. Domain-Separated Leaf Hashing (0x00 || SHA-256 chống Pre-image Attack)             │
│  4. Nhị phân hóa Cây Merkle (RFC 6962 Binary Merkle Tree O(log N))                     │
│  5. Ký số Ed25519 Validator trên Root & Hash Chain liên kết khối: H(Root_n || Root_n-1)│
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │ (Atomic DB Commit)
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      TẦNG LƯU TRỮ BẤT BIẾN WORM: libs/database                         │
│  • PostgreSQL 16 WORM Triggers: Chặn cứng UPDATE/DELETE ngay tại nhân DB (Mã lỗi 55000)│
│  • Bảng audit_logs (Append-Only), epoch_blocks (Hash Chain), external_anchors          │
│  • PostgreSQL Write-Ahead Log (WAL) Logical Replication Stream                         │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │ (WAL Change Data Capture Stream)
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                 BỘ GIÁM SÁT & TỰ VỆ CHỦ ĐỘNG: apps/tamper-watcher                     │
│  1. CDC Logical Replication Listener (Bắt quả tang mọi lệnh can thiệp WAL trong < 1ms) │
│  2. Active Defense Service: Ghi đè khóa Redis trong 0.02ms (SLA < 200ms)               │
│     -> Khóa tức thì cổng rút tiền trên apps/wallet-core (Trả về HTTP 423 Locked)       │
│  3. Alert Dispatcher: Bắn tin khẩn cấp Telegram SOS Bot & Kafka aegis.tamper.alerts   │
│  4. Cryptographic Scanner: Quét gãy Sequence, đứt xích Hash Chain & chữ ký giả mạo     │
└────────────────────────────────────────────────────────────────────────────────────────┘
            │                                                      │
            ▼                                                      ▼
┌──────────────────────────────┐              ┌──────────────────────────────────────────┐
│   CÔNG CỤ KIỂM TOÁN ĐỘC LẬP  │              │    GIAO DIỆN GIÁM SÁT SOC THỜI GIAN THỰC │
│       apps/audit-cli         │              │          apps/audit-dashboard            │
│ • verify: Quét toàn bộ chuỗi │              │ • Visual Merkle Tree Explorer (SVG)      │
│ • prove: Xuất Merkle Proof   │              │ • Live Security Siren chớp đỏ khi có phá │
│ • verify-proof: Offline Zero │              │ • SSE Stream & Nút Reset cờ bảo vệ       │
│   Trust Verification O(log N)│              │ • URL: http://localhost:3333             │
└──────────────────────────────┘              └──────────────────────────────────────────┘
```

---

## 💎 3. Mô Hình Bảo Mật 4 Lớp (4-Tier Security Defense)

| Lớp bảo vệ | Thành phần phụ trách | Cơ chế mật mã & Kỹ thuật cốt lõi | Hiệu quả bảo vệ |
| :---: | :--- | :--- | :--- |
| **LỚP 1** | **WORM Datastore Engine** | PostgreSQL PL/pgSQL Triggers tại nhân CSDL, cấm lệnh `UPDATE` và `DELETE` trên bảng `audit_logs` và cấm sửa trường mật mã trên `epoch_blocks`. | Chặn đứng thao tác sửa dữ liệu từ ứng dụng thông thường hoặc SQL Injection. |
| **LỚP 2** | **Cryptographic Chain & Merkle Tree** | RFC 8785 Canonical JSON, Domain-Separated SHA-256 (`0x00`/`0x01`), Cây Merkle nhị phân $O(\log N)$, Chữ ký số Ed25519 (RFC 8032), và Hash Chain nối xích giữa các khối Epoch $H(\text{Root}_i \parallel \text{Root}_{i-1})$. | Bất kỳ hành vi sửa 1 byte dữ liệu nào cũng làm thay đổi Merkle Root và vô hiệu hóa chữ ký số của Validator. |
| **LỚP 3** | **Autonomous Active Defense via CDC** | PostgreSQL Logical Replication (`test_decoding`), ioredis in-memory atomic lock, Telegram Bot API SOS alert, Kafka Alert Dispatcher. | Bắt quả tang hành vi bypass trigger của Rogue DBA trong $< 1\text{ms}$ và tự động khóa cổng rút tiền tài chính trong $0.02\text{ms}$. |
| **LỚP 4** | **Zero-Trust Independent Auditability** | `apps/audit-cli` và Thuật toán xác minh Sibling Proof độc lập ngoại tuyến (Offline Mathematical Verification). | Cho phép khách hàng hoặc kiểm toán viên bên ngoài tự kiểm chứng giao dịch mà không cần tin tưởng vào DB nội bộ. |

---

## 🧠 4. Các Logic Nghiệp Vụ & Thuật Toán Mật Mã Cốt Lõi (Core Cryptographic Algorithms & Logic)

AegisLedger không chỉ lưu trữ log thông thường mà kết hợp chuỗi thuật toán mật mã học nghiêm ngặt theo các tiêu chuẩn quốc tế:

### 4.1. Chuẩn Hóa Dữ Liệu Tất Định (RFC 8785 JSON Canonicalization Scheme - JCS)
* **Vấn đề giải quyết:** Trong JavaScript/JSON, thứ tự các thuộc tính (keys) của Object là bất định (`{"amount": 100, "user": "alice"}` khác với `{"user": "alice", "amount": 100}`). Khoảng trắng hay định dạng số thực cũng làm thay đổi hoàn toàn chuỗi băm SHA-256 dù ngữ nghĩa dữ liệu giống hệt nhau.
* **Nguyên lý thuật toán:**
  1. Đệ quy sắp xếp tất cả các Object keys theo thứ tự đơn vị mã Unicode UTF-16 tăng dần (`lexicographical ordering`).
  2. Chuẩn hóa định dạng số theo chuẩn IEEE 754 (loại bỏ số 0 thừa, không dùng ký hiệu khoa học khi không cần thiết).
  3. Triệt tiêu toàn bộ khoảng trắng, ký tự xuống dòng (`\n`, `\r`, `\t`) không cần thiết.
* **Bảo đảm toán học:** 
  $$\forall Obj_A, Obj_B: Obj_A \equiv Obj_B \iff \text{Canonical}(Obj_A) == \text{Canonical}(Obj_B)$$

### 4.2. Phân Định Vùng Băm Chống Tấn Công Pre-image (RFC 6962 Domain Separation)
* **Vấn đề giải quyết:** Trong cấu trúc Merkle Tree nhị phân, nếu không có tiền tố phân định, kẻ tấn công có thể thực hiện **Second Pre-image Attack** bằng cách tráo đổi một Node trung gian (Internal Node) thành một Node lá (Leaf Node) hoặc ngược lại để tạo ra cùng một Merkle Root.
* **Nguyên lý thuật toán:**
  - Tiền tố nút lá (**Leaf Node**): Bổ sung byte `0x00` vào đầu dữ liệu trước khi băm:
    $$\text{LeafHash} = \text{SHA-256}(0\text{x}00 \parallel \text{UTF-8}(\text{Canonical}(Payload)))$$
  - Tiền tố nút trung gian (**Internal Node**): Bổ sung byte `0x01` vào đầu hai mã băm con trước khi gộp:
    $$\text{ParentHash} = \text{SHA-256}(0\text{x}01 \parallel \text{LeftChildHash} \parallel \text{RightChildHash})$$
* **Bảo đảm toán học:** Bất đẳng thức không gian băm triệt tiêu 100% khả năng va chạm giữa các tầng cây Merkle.

### 4.3. Thuật Toán Cây Merkle Nhị Phân & Xác Minh Bằng Chứng $O(\log N)$
* **Dựng cây (Tree Construction):**
  - Mảng các lá băm $[\text{Leaf}_0, \text{Leaf}_1, \dots, \text{Leaf}_{n-1}]$ được ghép cặp từng đôi từ trái sang phải.
  - Nếu số lượng phần tử lẻ, phần tử cuối cùng được nhân đôi để bảo đảm tính đối xứng nhị phân hoàn chỉnh.
  - Quá trình lặp lại cho đến khi chỉ còn đúng 1 node duy nhất tại đỉnh cây: **Merkle Root** (Độ sâu cây $D = \lceil \log_2 N \rceil$).
* **Trích xuất Bằng chứng thành viên (Sibling Proof Path):**
  - Với một bản ghi ở vị trí $i$ tại tầng $l$, phần tử anh em ruột (Sibling) nằm tại vị trí $i \oplus 1$ (phép toán XOR bit cuối).
  - Bằng chứng chỉ bao gồm một danh sách ngắn gồm $\log_2 N$ cặp `(position: 'LEFT' | 'RIGHT', hash: string)`.
* **Xác minh ngoại tuyến (Offline Zero-Trust Verification):**
  - Bắt đầu từ $H_0 = \text{LeafHash}$, tại mỗi bước $k$:
    $$H_{k+1} = \begin{cases} \text{combine}(Sibling_k, H_k) & \text{nếu } Sibling_k \text{ ở bên LEFT} \\ \text{combine}(H_k, Sibling_k) & \text{nếu } Sibling_k \text{ ở bên RIGHT} \end{cases}$$
  - Kiểm tra điều kiện: $H_{\text{cuối}} == \text{MerkleRoot}$.
* **Độ phức tạp:** Thời gian và không gian xác minh chỉ là **$O(\log N)$**, hoàn toàn không cần kết nối cơ sở dữ liệu hay mạng Internet.

### 4.4. Chữ Ký Số Ed25519 & Tính Bất Khả Chối Bỏ (RFC 8032 Non-Repudiation)
* **Vấn đề giải quyết:** Chỉ Merkle Root thôi là chưa đủ; kẻ tấn công có thể tự dựng một cây Merkle giả mạo. Cần bằng chứng chứng minh Root được xác nhận bởi Validator có thẩm quyền.
* **Nguyên lý thuật toán:**
  - Sử dụng đường cong Edwards vặn (Twisted Edwards Curve) trên trường hữu hạn $2^{255} - 19$.
  - Thông điệp ký được gắn chặt ba yếu tố cấu trúc:
    $$\text{Message} = \text{EpochNumber} \parallel \text{MerkleRoot} \parallel \text{PreviousEpochRoot}$$
  - Chữ ký tạo bởi khóa bí mật (Private Key 32 bytes) sinh ra chữ ký 64 bytes (`signature` VarChar 128 hex).
* **Bảo đảm toán học:** Không thể đảo ngược hoặc làm giả chữ ký nếu không sở hữu khóa bí mật; xác minh cực nhanh với Public Key chuẩn hóa 32 bytes (`signerPublicKey` VarChar 64 hex).

### 4.5. Chuỗi Khối Nối Xích Hash Chain Ngược Giữa Các Epoch
* Mỗi khối Epoch $E_i$ bắt buộc phải nhúng mã băm Merkle Root của khối Epoch liền trước:
  $$\text{PreviousEpochRoot}(E_i) = \text{MerkleRoot}(E_{i-1})$$
* Khối khởi nguyên $E_0$ (Genesis) có Previous Root là chuỗi 64 ký tự số 0 (`000...000`).
* **Hiệu ứng domino:** Nếu kẻ tấn công can thiệp vào bất kỳ khối Epoch lịch sử $E_k$ ($k < n$), Merkle Root của $E_k$ sẽ thay đổi $\rightarrow$ `previousEpochRoot` của khối $E_{k+1}$ lập tức không khớp $\rightarrow$ Toàn bộ chuỗi Hash Chain từ $k+1$ đến hiện tại bị gãy đổ và báo động tức thì.

### 4.6. Cơ Chế Bộ Đệm Trượt Hai Điều Kiện Kích Hoạt (Sliding Window Dual-Trigger Buffer)
* **Vấn đề giải quyết:** Nếu ghi từng giao dịch vào Merkle Tree sẽ làm giảm hiệu năng hệ thống (I/O nghẽn cổ chai). Nếu gom theo lô thì có nguy cơ tồn đọng dữ liệu quá lâu khi ít giao dịch.
* **Logic điều phối:**
  - **Ngưỡng dung lượng (Threshold Trigger):** Khi số lượng event trong RAM đạt ngưỡng quy định (ví dụ 5–10 logs), cơ chế chốt sổ Epoch được kích hoạt ngay lập tức.
  - **Ngưỡng thời gian (Timeout Trigger):** Nếu lượng event chưa đạt ngưỡng nhưng đã quá thời gian chờ (ví dụ 2 giây), bộ hẹn giờ tự động kích hoạt chốt Epoch để tránh đọng dữ liệu.
  - **Chống Race-Condition (BufferMutex):** Khóa luồng bất đồng bộ ngăn chặn việc hai tiến trình cùng chốt sổ một lô event.
  - **Bảo toàn dữ liệu khi Shutdown (Graceful Shutdown Hook):** Khi ứng dụng nhận tín hiệu `SIGTERM`/`SIGINT`, toàn bộ dữ liệu còn sót lại trong RAM buffer được cam kết (commit) nguyên tử xuống DB trước khi tiến trình tắt hoàn toàn.

### 4.7. Logic Bắt Quả Tang WAL CDC & Kích Hoạt Tự Vệ Sub-Millisecond (< 1ms)
* **Vấn đề giải quyết:** Kẻ tấn công có quyền Superuser / DBA có thể chạy câu lệnh `ALTER TABLE audit_logs DISABLE TRIGGER` để bypass các trigger SQL.
* **Logic phát hiện:**
  - PostgreSQL Write-Ahead Log (WAL) là cơ chế bắt buộc ở tầng lưu trữ đĩa vật lý của Database Engine. Mọi thay đổi dữ liệu đều phải được ghi vào WAL trước khi flush vào bảng.
  - `tamper-watcher` thiết lập logical replication slot `aegis_tamper_watcher_slot` đọc luồng WAL qua plugin `test_decoding`.
  - Ngay khi xuất hiện cú pháp `table public.audit_logs: UPDATE:` hoặc `DELETE:`, CDC listener phát hiện ngay trong $\approx 0.1\text{ms}$.
* **Logic tự vệ chủ động:**
  - **Kích hoạt tức thì:** Thiết lập nguyên tử cờ đỏ `AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS="true"` trên Redis trong $0.02\text{ms}$.
  - **Đóng băng nghiệp vụ:** `ActiveDefenseGuard` trên `wallet-core` đọc Redis; mọi request rút tiền hoặc chuyển khoản bị từ chối ngay với mã lỗi **HTTP 423 Locked**.
  - **Phát tin khẩn cấp:** Gửi tin nhắn định dạng HTML SOS tới Telegram Bot Admin và phát sự kiện vào Kafka topic `aegis.tamper.alerts`.

---

## 📂 5. Cấu Trúc Monorepo (Nx Workspace Structure)

```
aegis-ledger-workspace/
├── apps/
│   ├── audit-ledger/       # Ingestion Pipeline, Sliding Window Buffer, Merkle & Ed25519 Engine
│   ├── wallet-core/        # Microservice tài chính mô phỏng (Deposit, Withdraw, Transfer, Active Defense 423)
│   ├── tamper-watcher/     # PostgreSQL CDC Replication, Rapid Active Defense (<1ms), Telegram SOS
│   ├── audit-cli/          # CLI kiểm toán độc lập Zero-Trust: verify, prove, verify-proof
│   └── audit-dashboard/    # Web UI trực quan hóa cây Merkle SVG, Hash Chain, Live Siren báo động
├── libs/
│   ├── contracts/          # DTOs, Enums, Interfaces, class-validator schemas chia sẻ toàn monorepo
│   ├── crypto-core/        # Canonical JSON, SHA-256, Merkle Tree Binary, Ed25519 Signing/Verify
│   ├── database/           # Prisma Client, WORM Database Triggers, Atomic Batch Transactions
│   └── event-bus/          # Kafka Producer/Consumer Type-Safe Wrappers, DLQ Poison Pill Protection
├── tools/
│   ├── docker/             # Docker Compose: PostgreSQL WAL logical, Redis 7, Kafka 3.7 KRaft
│   └── scripts/            # Bộ kịch bản tấn công mẫu: demo-attack-modify, delete, rewrite, reset
├── ROADMAP.md              # Lộ trình 11 bước kiến trúc đã hoàn thành 100%
└── package.json            # Scripts điều phối toàn bộ Monorepo
```

---

## ⚡ 6. Hướng Dẫn Cài Đặt & Khởi Động Nhanh (Quickstart)

### Yêu cầu tiên quyết:
- **Node.js** v20+ & **npm** v10+
- **Docker** & **Docker Compose**

### Bước 1: Cài đặt dependencies
```bash
git clone <repository_url>
cd aegis-ledger-workspace
npm install
```

### Bước 2: Khởi động cụm hạ tầng Docker (Postgres, Redis, Kafka)
```bash
npm run docker:up
npm run docker:status
```

### Bước 3: Đồng bộ Schema CSDL & WORM Security Rules
```bash
npm run db:push
```

### Bước 4: Khởi tạo dữ liệu mẫu chuẩn (Seed Genesis Ledger Data)
```bash
npm run seed:demo
```
*Lệnh này sẽ tự động khởi tạo 2 Epochs (10 giao dịch tài chính chuẩn), tạo cặp khóa Validator Ed25519, tính Merkle Root, ký số và thiết lập mốc neo kiểm toán.*

---

## 🧪 7. Chạy Kiểm Thử Toàn Diện Monorepo (Test Suites)

Toàn bộ **125/125 unit, integration và E2E tests** trên cả 9 dự án đều đạt tỷ lệ vượt qua **100%**:

```bash
# Chạy toàn bộ test suites của 9 dự án:
npm run test:contracts && \
npm run test:crypto && \
npm run test:database && \
npm run test:event-bus && \
npm run test:audit-ledger && \
npm run test:wallet-core && \
npm run test:tamper-watcher && \
npm run test:audit-cli && \
npm run test:dashboard
```

| Dự án | Số lượng Tests | Trọng tâm kiểm thử |
| :--- | :---: | :--- |
| `libs/contracts` | **5/5** | Kiểm thử schema validation DTOs (`class-validator`) |
| `libs/crypto-core` | **24/24** | Kiểm thử RFC 8785 Canonical JSON, SHA-256 Domain Separation, Merkle Tree $O(\log N)$, Ed25519 |
| `libs/database` | **13/13** | Kiểm thử PostgreSQL Triggers chặn cứng `UPDATE`/`DELETE` (Mã lỗi `55000`) và Atomic Transaction |
| `libs/event-bus` | **8/8** | Kiểm thử Kafka Producer/Consumer, Partition key, Dead Letter Queue (DLQ) routing |
| `apps/audit-ledger` | **9/9** | Kiểm thử Sliding Window Buffer (Size/Timeout/Shutdown), Merkle Engine, E2E Ingestion Pipeline |
| `apps/wallet-core` | **25/25** | Kiểm thử nghiệp vụ Ví, Đăng nhập, và ActiveDefenseGuard trả về HTTP 423 Locked khi có biến cố |
| `apps/tamper-watcher`| **16/16** | Kiểm thử CDC WAL Parser, Active Defense $< 1\text{ms}$, Telegram Alert Dispatcher, Scanner |
| `apps/audit-cli` | **11/11** | Kiểm thử quét tính liên tục chuỗi, sinh Merkle Proof và thẩm định toán học độc lập |
| `apps/audit-dashboard`| **14/14** | Kiểm thử REST APIs, dựng các tầng cây Merkle, tính năng SSE và nút Reset tự vệ |
| **TỔNG CỘNG** | **125/125 PASSED** | **100% BẢO TOÀN TÍNH NGUYÊN VẸN MẬT MÃ TOÀN HỆ THỐNG** |

---

## 🎯 8. Trình Diễn Các Kịch Bản Tấn Công Thực Chiến (Showcase Demos)

Dự án trang bị sẵn 3 kịch bản mô phỏng các cuộc tấn công cấp độ chuyên gia (Insider Threat / Rogue DBA):

### Kịch bản 1: Cố tình sửa dữ liệu (Unauthorized Update)
```bash
npm run demo:modify
```
* **Diễn biến:** Hacker dùng quyền DBA tắt trigger sửa giao dịch nạp tiền của Alice từ 1,000 USD thành 1,000,000 USD.
* **Kết quả:** CDC bắt trong $< 1\text{ms}$ $\rightarrow$ Redis khóa rút tiền $\rightarrow$ Wallet trả về **HTTP 423 Locked** $\rightarrow$ `audit-cli verify` báo đỏ lỗi `[LEAF DATA TAMPERED]`.

### Kịch bản 2: Xóa log phi tang (Unauthorized Delete)
```bash
npm run demo:delete
```
* **Diễn biến:** Hacker xóa Sequence #4 để phi tang giao dịch.
* **Kết quả:** `audit-cli verify` bắt quả tang đứt gãy chuỗi: `[SEQUENCE GAP] Kỳ vọng #4 nhưng gặp #5` và `[LOGS COUNT MISMATCH]`.

### Kịch bản 3: Tái viết lịch sử & Giả mạo Merkle Root (Historical Rewrite)
```bash
npm run demo:rewrite
```
* **Diễn biến:** Hacker sửa log đồng thời tự tính lại và ghi đè `merkle_root` trong `epoch_blocks` để hợp thức hóa dữ liệu nội bộ.
* **Kết quả:** Hệ thống lập tức vạch trần:
  - `[SIGNATURE FORGERY]`: Chữ ký số Ed25519 của Validator bị vô hiệu (Hacker không có Private Key).
  - `[HASH CHAIN BROKEN]`: Khối Epoch #1 kế tiếp bị đứt xích vì `previousEpochRoot` không khớp.
  - `[ANCHOR MISMATCH]`: Sai khác hoàn toàn với mốc neo kiểm toán đã lưu trữ.

### Khôi phục hệ thống về trạng thái 100% Xanh:
```bash
npm run demo:reset
```

---

## 🖥️ 9. Giao Diện Giám Sát SOC & Công Cụ CLI

### Khởi chạy Visual Merkle Tree Dashboard:
```bash
npm run dashboard
```
Truy cập giao diện Web tại: **`http://localhost:3333`**
- **Trực quan hóa đồ họa véc-tơ SVG:** Hiển thị cây Merkle phân tầng với đường cong cubic Bézier mềm mại.
- **Tương tác Node & Inspector Drawer:** Nhấp chuột vào từng lá cây để tra cứu chi tiết giao dịch (Actor, Action, Resource, Payload, Leaf Hash).
- **Proof Highlighting:** Tô sáng đường đi Sibling Proof từ lá lên gốc bằng màu xanh Neon.
- **Live Security Siren:** Đèn cảnh báo an ninh chớp đỏ toàn màn hình khi phát hiện vi phạm.

### Sử dụng CLI Kiểm toán Độc lập:
```bash
# Quét toàn diện tính toàn vẹn chuỗi sổ cái:
npm run audit-cli -- verify

# Trích xuất bằng chứng Merkle Membership Proof cho Sequence #3:
npm run audit-cli -- prove --seq 3 --out proof_seq_3.json

# Xác minh toán học độc lập file bằng chứng (Zero-Trust Offline, không cần DB hay mạng):
npm run audit-cli -- verify-proof --file proof_seq_3.json
```

---

## 🚀 10. Định Hướng Phát Triển Tương Lai (Future Development Roadmap)

Cơ sở dữ liệu của AegisLedger đã được thiết kế sẵn cấu trúc tại bảng `external_anchors` (hỗ trợ `epochNumber`, `merkleRoot`, `anchorType`, `txHash`) để sẵn sàng mở rộng các tính năng phân tán trong tương lai:

1. **Neo Mốc Kiểm Toán Lên Public Blockchain Testnet (Ethereum Sepolia / Arbitrum L2):**
   - Triển khai Smart Contract tối giản `AegisAnchor.sol` trên mạng Ethereum Sepolia / Arbitrum Testnet để lưu trữ cặp `(epochNumber, merkleRoot)`.
   - Xây dựng **Automated Relayer Worker Service** định kỳ gom các Epoch chưa neo (`anchored = false`), ký giao dịch Web3 qua ví bảo mật và cập nhật `txHash` vào sổ cái.
2. **Bằng Chứng Không Tiết Lộ Danh Tính (Zero-Knowledge Proofs - zk-SNARKs):**
   - Ứng dụng Circom / SnarkJS để sinh zk-Proof cho từng giao dịch kiểm toán.
   - Cho phép người dùng chứng minh giao dịch của họ nằm trong khối Epoch hợp lệ mà **không cần tiết lộ số tiền giao dịch hay danh tính khách hàng** lên môi trường công khai.
3. **Đồng Thuận Đa Ký (Multi-Validator Threshold Signatures):**
   - Nâng cấp từ mô hình Single Validator Key hiện tại sang mô hình đa bên phân tán (Threshold Ed25519 / BLS Multi-Signature) kết hợp thuật toán đồng thuận BFT (Raft / CometBFT).

---

## 📄 Bản Quyền & Giấy Phép (License)

Dự án được phân phối dưới giấy phép **MIT License**. Mọi quyền được bảo lưu.
