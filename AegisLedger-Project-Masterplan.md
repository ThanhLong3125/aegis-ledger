# 🛡️ AegisLedger: Autonomous Cryptographic Audit Trail & Tamper-Detection Engine

> **Project Type:** Portfolio / Security Engineering / Distributed Systems  
> **Architecture:** Nx Monorepo, Event-Driven Architecture (NestJS, Kafka, Redis, PostgreSQL, WebSockets, CDC)  
> **Key Focus:** Cryptographic Immutability, Applied Cryptography (Merkle Tree, Ed25519, SHA-256), Real-time Autonomous Tamper Detection via CDC, External Anchoring (WORM / Blockchain Checkpointing)  
> **Author:** Thanh Long  

---

## 📖 1. Tổng quan Dự án (Executive Summary)

### 1.1. Bối cảnh & Nỗi đau thực tế (Problem Statement)
Trong các hệ thống tài chính (Fintech, Core Banking, E-commerce, SaaS), mọi thao tác nghiệp vụ quan trọng (nạp/rút tiền, phân quyền, xóa tài khoản) đều được ghi nhận vào bảng **Audit Logs**.

**Lỗ hổng chí mạng hiện nay:**
* Bảng log truyền thống chỉ là các bản ghi bình thường trong cơ sở dữ liệu (PostgreSQL, MongoDB, MySQL).
* **Mối đe dọa nội bộ (Insider Threat):** Một nhân viên quản trị cơ sở dữ liệu (DBA tha hóa) hoặc kẻ tấn công chiếm được quyền root/admin database có thể thực hiện:
  ```sql
  -- Phi tang dấu vết chuyển tiền lén lút:
  DELETE FROM audit_logs WHERE action = 'WALLET_TRANSFER' AND user_id = 'attacker';
  
  -- Sửa đổi số dư hoặc thông tin nhằm đổ tội cho người khác:
  UPDATE audit_logs SET user_id = 'victim' WHERE user_id = 'attacker';
  ```
* Sau khi bị sửa hoặc xóa, **hoàn toàn không có cơ chế toán học nào để phát hiện ra sự can thiệp này**. Các hệ thống kiểm toán (SOC 2, ISO 27001, PCI-DSS) đều gặp điểm mù lớn ở đây.

### 1.2. Giải pháp AegisLedger mang lại (The Solution)
**AegisLedger** là một hệ thống **Hộp đen kiểm toán độc lập**, kết hợp tinh hoa cấu trúc dữ liệu mật mã (Merkle Tree & Chữ ký số Ed25519) cùng kỹ thuật **PostgreSQL Logical Replication (Change Data Capture - CDC)** để đạt được tốc độ cao, khả năng mở rộng lớn và khả năng tự vệ tức thì:

1. **Epoch Batching & Cây Mật mã Merkle (Merkle Tree Chaining):**
   * Các bản ghi log được gom theo từng **Epoch** nhỏ (ví dụ: **5–10 logs** hoặc **2 giây** để tối ưu showcase/demo nhanh).
   * Từng log là một "Lá" (Leaf) của cây Merkle. Cả Epoch được thu gọn thành duy nhất 1 chuỗi băm 32 bytes: **Merkle Root**.
   * Các Merkle Root của các Epoch liên tiếp được xâu chuỗi (Root Chaining) tạo thành chuỗi bất biến.
2. **Chữ ký số Bất đối xứng (Ed25519 Digital Signature):**
   * Service chỉ cần ký 1 chữ ký Ed25519 duy nhất lên **Merkle Root** của mỗi Epoch (tiết kiệm 99% CPU so với ký từng log lẻ).
   * Chữ ký đảm bảo tính chống chối bỏ (Non-repudiation).
3. **Phát hiện Can thiệp Tức thì bằng CDC (< 200ms):**
   * Thay vì polling DB định kỳ gây chậm trễ, service `tamper-watcher` gắn trực tiếp vào **PostgreSQL Logical Replication (WAL Stream)**.
   * Vì bảng audit là **Append-Only**, bất kỳ lệnh `UPDATE` hay `DELETE` nào vừa thực thi trên database sẽ bị bắt quả tang ngay lập tức trong `< 200ms`:
     * Bắn alert đỏ tức thì qua **Telegram Bot / Slack**.
     * Nhấp nháy còi hú và đổi màu giao diện trên **Web Dashboard Real-time (WebSockets)**.
     * Kích hoạt cơ chế **Tự vệ chủ động (Active Defense)**: Đóng băng tài khoản liên quan hoặc kích hoạt ngắt mạch khẩn cấp (Circuit Breaker).
4. **Neo mốc Bất biến Ngoại vi (External Checkpoint Anchoring):**
   * Định kỳ neo Merkle Root ra môi trường bất biến bên ngoài (Local mock Blockchain / Smart Contract / WORM Storage).
   * Kẻ tấn công dù chiếm được toàn bộ DB nội bộ và sửa lại Merkle Root cũng không thể làm giả mốc đã neo ở bên ngoài.
5. **Bằng chứng Kiểm toán Tinh gọn ($O(\log N)$ Merkle Audit Proof):**
   * Khách hàng hoặc kiểm toán viên có thể xác minh tính toàn vẹn của một giao dịch cụ thể mà không cần tải hay quét lại toàn bộ database.

---

## 🏛️ 2. Kiến trúc Nx Monorepo (Project Structure)

Dự án được tổ chức bằng **Nx Monorepo** với TypeScript, phân chia ranh giới rõ ràng giữa các Domain và Service:

```text
aegis-ledger-workspace/
├── apps/
│   ├── wallet-core/             # [App 1] Microservice nghiệp vụ giả lập (Auth & Ví tiền, bắn audit event)
│   ├── audit-ledger/            # [App 2] Microservice Core: Ingestion, Batching (5-10 logs), Merkle Tree & Ed25519 Signing
│   ├── tamper-watcher/          # [App 3] Service giám sát CDC (Postgres WAL Stream) & Bắn Alert (Telegram/WebSocket)
│   ├── audit-dashboard/         # [App 4] Giao diện Admin trực quan (Next.js / Vite + Socket.io hiển thị Visual Merkle Tree)
│   └── audit-cli/               # [App 5] CLI tool phục vụ Audit: sinh Merkle Proof & đối chiếu External Anchor
│
├── libs/
│   ├── crypto-core/             # [Lib 1] Canonical JSON, SHA-256, Merkle Tree Engine, Ed25519 Keypair manager
│   ├── contracts/               # [Lib 2] Data Transfer Objects, Event Interfaces & Zod Schemas
│   ├── event-bus/               # [Lib 3] Kafka producer/consumer wrappers với Partitioning theo stream
│   └── database/                # [Lib 4] PostgreSQL Prisma/TypeORM schema, WORM Migration Rules, Logical Replication helpers
│
├── tools/
│   ├── docker/                  # Docker-compose (Kafka, Redis, Postgres 16 with wal_level=logical, Zookeeper)
│   └── scripts/
│       ├── demo-attack-modify.sh    # Script hacker chạy SQL UPDATE 1 dòng log
│       ├── demo-attack-delete.sh    # Script hacker chạy SQL DELETE 1 dòng log
│       └── demo-attack-rewrite.sh   # Script hacker sửa log và cố tình tính lại Merkle Root nội bộ
├── nx.json
├── package.json
└── README.md
```

---

## ⚙️ 3. Cơ chế Mật mã học cốt lõi (Applied Cryptography Engine)

### 3.1. Cấu trúc Bản ghi Log (Leaf Schema) & Epoch Block Schema

#### A. Cấu trúc từng bản ghi Log (Lá - Merkle Leaf):
```typescript
export interface AuditLogLeaf {
  id: string;                 // UUID v7 (sắp xếp theo thời gian)
  sequence: number;           // Số thứ tự tăng dần liên tục (1, 2, 3...)
  timestamp: string;          // ISO 8601 UTC
  actor: {
    userId: string;
    ipAddress: string;
    userAgent: string;
  };
  action: string;             // Ví dụ: "WALLET_DEPOSIT", "WALLET_TRANSFER"
  resource: {
    type: string;             // Ví dụ: "WALLET", "USER"
    id: string;
  };
  payload: Record<string, any>; // Dữ liệu nhạy cảm (amount, balance, etc.)
  leafHash: string;           // SHA-256(CanonicalJson({ id, sequence, timestamp, actor, action, resource, payload }))
}
```

#### B. Cấu trúc một Epoch Block (Merkle Root Block):
```typescript
export interface EpochBlock {
  epochNumber: number;        // Epoch thứ mấy (1, 2, 3...)
  startSequence: number;      // Sequence đầu (ví dụ: 1)
  endSequence: number;        // Sequence cuối (ví dụ: 10)
  totalLogs: number;          // Số lượng log trong epoch (5 - 10 logs)
  merkleRoot: string;         // Root hash tính từ toàn bộ leafHash trong epoch
  previousEpochRoot: string;  // MerkleRoot của Epoch liền trước (tạo xích liên tục)
  signature: string;          // Ed25519 Signature ký trên hash: SHA-256(merkleRoot + previousEpochRoot + epochNumber)
  anchoredTxHash?: string;    // Hash giao dịch khi neo ra môi trường bất biến (nếu có)
  createdAt: string;
}
```

### 3.2. Thuật toán Canonical JSON Serialization
Đảm bảo cùng một JSON object luôn cho ra một chuỗi chuẩn hóa duy nhất bất kể thứ tự các key trong JavaScript:
```typescript
export function canonicalize(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalize).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  const parts = sortedKeys.map(
    (key) => `${JSON.stringify(key)}:${canonicalize(obj[key])}`
  );
  return '{' + parts.join(',') + '}';
}
```

### 3.3. Thuật toán Xây dựng Merkle Tree & Sinh Merkle Proof
```typescript
import { createHash } from 'crypto';

export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export class MerkleTree {
  private leaves: string[];
  private layers: string[][];

  constructor(leafHashes: string[]) {
    this.leaves = leafHashes;
    this.layers = [leafHashes];
    this.buildTree();
  }

  private buildTree() {
    let currentLayer = this.leaves;
    while (currentLayer.length > 1) {
      const nextLayer: string[] = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        if (i + 1 < currentLayer.length) {
          nextLayer.push(sha256(currentLayer[i] + currentLayer[i + 1]));
        } else {
          // Nếu lẻ phần tử, nhân đôi phần tử cuối
          nextLayer.push(sha256(currentLayer[i] + currentLayer[i]));
        }
      }
      this.layers.push(nextLayer);
      currentLayer = nextLayer;
    }
  }

  public getRoot(): string {
    return this.layers[this.layers.length - 1][0] || '';
  }

  // Sinh Merkle Proof cho lá ở vị trí index để kiểm tra nhanh O(log N)
  public getProof(index: number): { position: 'left' | 'right'; hash: string }[] {
    const proof: { position: 'left' | 'right'; hash: string }[] = [];
    let currentIndex = index;

    for (let layerIndex = 0; layerIndex < this.layers.length - 1; layerIndex++) {
      const layer = this.layers[layerIndex];
      const isRightNode = currentIndex % 2 === 1;
      const pairIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

      if (pairIndex < layer.length) {
        proof.push({
          position: isRightNode ? 'left' : 'right',
          hash: layer[pairIndex],
        });
      } else {
        // Trường hợp lẻ phần tử ghép với chính nó
        proof.push({
          position: 'right',
          hash: layer[currentIndex],
        });
      }
      currentIndex = Math.floor(currentIndex / 2);
    }
    return proof;
  }
}
```

---

## ⚡ 4. Quy trình Vận hành Chi tiết (Core Pipelines)

### 4.1. Ingestion & Epoch Trigger Pipeline (Xử lý dòng log)
* Nhận event từ Kafka.
* Bộ đệm Ingestion gom log theo cơ chế: **Đủ 5 - 10 logs HOẶC Hết 2 giây** (tùy điều kiện nào đến trước).
* Khi kích hoạt chốt Epoch:
  1. Tính `leafHash` cho từng log.
  2. Dựng `MerkleTree` và lấy ra `merkleRoot`.
  3. Lấy `previousEpochRoot` từ Epoch trước.
  4. Ký số `Ed25519` lên `SHA-256(merkleRoot + previousEpochRoot)`.
  5. Ghi cả mẻ logs và Epoch Record vào PostgreSQL trong **cùng 1 Database Transaction**.
  6. Bắn sự kiện qua WebSocket tới `audit-dashboard`: Epoch mới hình thành (màu xanh).

### 4.2. Giám sát Thời gian thực bằng Change Data Capture (CDC Pipeline)
* PostgreSQL được bật cờ `wal_level = logical`.
* Service `tamper-watcher` kết nối vào Replication Slot của Postgres.
* Bảng `audit_logs` có tính chất Append-Only:
  * Khi có event `INSERT`: Watcher tính nhẩm lại `leafHash` xem có hợp lệ.
  * Khi có event **`UPDATE`** hoặc **`DELETE`**: **LẬP TỨC PHÁT BÁO ĐỘNG TRONG < 200MS**:
    * **Telegram/Slack:** Bắn tin nhắn khẩn cấp kèm thông tin dòng vừa bị tác động.
    * **Dashboard:** Bật chuông báo động và đổi khối liên quan sang màu đỏ.
    * **Active Defense:** Gọi Redis set cờ đóng băng user/ví liên quan.

### 4.3. Cơ chế Neo mốc Ngoại vi & Xác minh Khi Dữ liệu Cũ Bị Sửa (External Anchoring & Verification)

#### A. Cách thức Neo (Anchoring):
* Cứ sau mỗi **3 Epochs** (tương đương 15 - 30 logs trong demo), hệ thống lấy `merkleRoot` mới nhất đẩy lên:
  * Local Mock Blockchain / Smart Contract (hoặc file lưu trên WORM Object Storage).
  * Ghi nhận: `{ epochNumber: 3, root: "0xAAA111...", timestamp: "..." }`.

#### B. Cơ chế Bắt quả tang khi Hacker sửa dữ liệu cũ:
1. **Hành vi Hacker:** Hacker vào DB sửa số tiền ở Log #2 thuộc Epoch #1. Hacker biết nếu chỉ sửa Log #2 thì Merkle Root của Epoch #1 sẽ lệch, nên hacker khôn khéo **chạy script tính lại Merkle Tree của Epoch #1 trong DB nội bộ thành `0xBBB222...`**.
2. **Cơ chế Bắt quả tang (Verification):**
   * CLI hoặc Watcher chạy đối chiếu:
     $$\text{Root trong DB nội bộ (0xBBB222...)} \neq \text{Root đã neo ngoại vi (0xAAA111...)}$$
   * **Kết luận:** Phát hiện ngay Database nội bộ đã bị viết lại lịch sử (**Historical Rewrite Attack Detected**)!

---

## 🧪 5. Trọn bộ Kịch bản Kiểm thử & Demo Thực tế (Comprehensive Test Suites)

Để dự án sẵn sàng showcase trong các buổi phỏng vấn kỹ thuật hoặc demo trực tiếp, hệ thống xây dựng 6 kịch bản kiểm thử rõ ràng:

| Mã Case | Tên Kịch bản Test | Hành động Thực hiện | Kết quả Kỳ vọng (Expected Result) |
| :--- | :--- | :--- | :--- |
| **TC-01** | **Normal Epoch Ingestion** | Bắn liên tiếp 7 giao dịch nạp/chuyển tiền | Khi đạt 7 logs (trong ngưỡng 5-10 logs), hệ thống chốt Epoch #1. Merkle Tree tạo thành công. Dashboard hiện cây xanh nối nhau. CLI verify: `PASS (7/7 logs valid)`. |
| **TC-02** | **Timeout Ingestion Trigger** | Chỉ gửi 2 giao dịch rồi dừng | Sau 2 giây, timer kích hoạt chốt Epoch #2 với đúng 2 logs đó. Cây Merkle tự nhân đôi lá lẻ để cân bằng và hoàn tất ký Ed25519. |
| **TC-03** | **CDC Instant Tamper Detection (UPDATE)** | Chạy script `demo-attack-modify.sh`: `UPDATE audit_logs SET payload = '...' WHERE id = 'leaf-2'` | Trong **< 200ms** (qua WAL Stream): Watcher bắt sự kiện UPDATE $\rightarrow$ Telegram nổ cảnh báo đỏ $\rightarrow$ Dashboard nhấp nháy đỏ $\rightarrow$ Ví liên quan bị freeze. |
| **TC-04** | **CDC Instant Deletion Detection (DELETE)** | Chạy script `demo-attack-delete.sh`: `DELETE FROM audit_logs WHERE id = 'leaf-3'` | Trong **< 200ms**: Watcher bắt sự kiện DELETE $\rightarrow$ Báo động `LOG DELETION BREACH DETECTED`. |
| **TC-05** | **Historical Rewrite Detection (Sửa DB & Tính lại Hash)** | Chạy `demo-attack-rewrite.sh`: Sửa data và tự cập nhật cả `merkleRoot` trong DB nội bộ | Kiểm tra nội bộ thấy khớp, NHƯNG khi CLI đối chiếu với **External Anchor** thì phát hiện sai lệch $\rightarrow$ Báo động `EXTERNAL ANCHOR MISMATCH: DB has been rewritten!`. |
| **TC-06** | **Merkle Proof Audit Verification ($O(\log N)$)** | Chạy lệnh `audit-cli prove --leaf-id <id>` | CLI trích xuất Merkle Path chỉ gồm 3 hashes thay vì toàn bộ DB. Client tự băm theo đường dẫn và so khớp chính xác với Merkle Root công khai. |

---

## 📋 6. Lộ trình Triển khai Chuẩn hóa (Standard Implementation Plan)

### Sprint 1: Khởi tạo Workspace & Thư viện Mật mã (`libs/crypto-core`)
* Cấu hình Nx Monorepo (NestJS, TypeScript).
* Cài đặt và phát triển `libs/crypto-core`:
  * Canonical JSON serializer.
  * Bộ băm SHA-256.
  * Thuật toán **MerkleTree Engine** (dựng cây, lấy root, tạo Merkle proof, verify proof).
  * Bộ sinh và xác minh chữ ký **Ed25519**.
* Bộ Unit Test hoàn chỉnh đạt coverage > 95% cho các phép tính mật mã.

### Sprint 2: Ingestion Pipeline & Epoch Engine (`apps/audit-ledger`)
* Setup PostgreSQL 16 với Docker-compose, cấu hình `wal_level = logical`.
* Thiết lập cấu trúc bảng WORM (`audit_logs`, `epoch_blocks`, `anchors`).
* Xây dựng bộ gom batch: Ngưỡng **5 - 10 logs** hoặc **2 giây**.
* Tích hợp Kafka consumer và lưu trữ atomic transaction (Logs + Merkle Root + Ed25519 Signature).

### Sprint 3: CDC Watcher & Real-time Alerting (`apps/tamper-watcher`)
* Dựng `tamper-watcher` kết nối trực tiếp vào Postgres Logical Replication stream (dùng package Node.js CDC như `pg-logical-replication` hoặc Debezium/Postgres replication client).
* Bắt sự kiện UPDATE / DELETE tức thì trong `< 200ms`.
* Tích hợp gửi thông báo khẩn qua Telegram Bot.
* Thiết lập WebSocket server để broadcast trạng thái về Dashboard.

### Sprint 4: External Checkpoint Anchoring & CLI Tool (`apps/audit-cli`)
* Xây dựng mock External Anchor (Contract testnet hoặc local append-only WORM registry).
* Viết công cụ CLI:
  * `audit-cli verify`: Quét toàn diện chuỗi Epochs và đối chiếu External Anchor.
  * `audit-cli proof --id <log_id>`: Xuất bằng chứng mật mã Merkle Proof cho 1 log cụ thể.

### Sprint 5: Web Visual Dashboard & Kịch bản Demo Tấn công
* Xây dựng giao diện Web trực quan (Next.js/React/Vite):
  * Hiển thị chuỗi Merkle Tree dạng sơ đồ tương tác trực quan.
  * Nhận tín hiệu WebSocket đổi màu Real-time khi bị tấn công.
* Hoàn thiện 3 bash script demo: `demo-attack-modify.sh`, `demo-attack-delete.sh`, `demo-attack-rewrite.sh`.
