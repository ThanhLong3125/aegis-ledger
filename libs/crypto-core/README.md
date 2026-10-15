# 🔐 `@aegis/crypto-core` - Applied Cryptography & Verifiable Data Engine

> **Vị trí:** `libs/crypto-core/`  
> **Kiến trúc:** Pure Functional, Zero I/O, Deterministic Algorithms, Zero External Cryptographic Dependencies (Built-in Node.js `crypto`)  
> **Vai trò:** Trái tim Mật mã học (Cryptographic Engine) cung cấp tính toán bất biến, dựng cây Merkle, sinh chứng chỉ kiểm toán $O(\log N)$ và ký số Ed25519 cho toàn bộ hệ thống AegisLedger.

---

## 🧭 1. Ý Nghĩa & Sứ Mệnh Cốt Lõi

Trong các hệ thống kiểm toán truyền thống, dữ liệu thường được bảo vệ bằng quyền truy cập cơ sở dữ liệu (RBAC) hoặc audit log thông thường lưu trong SQL. Tuy nhiên, cách tiếp cận này tồn tại lỗ hổng chết người: **Người quản trị (DBA) hoặc hacker chiếm quyền root/superuser hoàn toàn có thể chạy câu lệnh `UPDATE` hay `DELETE` để sửa lịch sử giao dịch mà không để lại dấu vết toán học.**

`@aegis/crypto-core` ra đời nhằm giải quyết bài toán trên bằng cách chuyển dịch niềm tin từ **"Tin tưởng con người/Quyền hệ thống" (Trust in Authority)** sang **"Tin tưởng toán học mật mã" (Trust in Cryptographic Proofs)**:

1. **Deterministic Identity (Định danh tất định):** Mọi bản ghi kiểm toán dù nhận từ đâu cũng đều được định danh bằng mã băm SHA-256 bất biến.
2. **Batch Integrity via Merkle Tree (Toàn vẹn theo khối):** Hàng ngàn giao dịch được cô đọng lại thành một mã băm duy nhất (Merkle Root) kích thước chỉ 32 bytes (64 hex characters). Nếu chỉ 1 byte trong bất kỳ log nào bị thay đổi, Root sẽ thay đổi hoàn toàn.
3. **Logarithmic Audit Verification $O(\log N)$:** Cho phép khách hàng hoặc bên kiểm toán độc lập xác minh một bản ghi có nằm trong hệ thống hay không mà không cần tải về toàn bộ cơ sở dữ liệu hàng triệu dòng.
4. **Non-repudiation (Chống chối bỏ) với Ed25519:** Mỗi Merkle Root của từng Epoch được ký bằng thuật toán chữ ký số bất đối xứng hiệu năng cao Ed25519, khẳng định nguồn gốc và không thể làm giả.

---

## 📐 2. Cơ Sở Lý Thuyết & Logic Mật Mã Học

Thư viện được xây dựng dựa trên 4 trụ cột toán học và mật mã học ứng dụng:

```text
┌─────────────────────────┐
│     Log Payload DTO     │
└────────────┬────────────┘
             │  1. Canonical JSON Serialization (RFC 8785)
             ▼
┌─────────────────────────┐
│ Deterministic JSON Str  │
└────────────┬────────────┘
             │  2. SHA-256 Hashing (RFC 6234)
             ▼
┌─────────────────────────┐
│     Leaf Hash (L_i)     │
└────────────┬────────────┘
             │  3. Merkle Tree Construction (Binary Hash Tree)
             ▼
┌─────────────────────────┐
│    Merkle Root (32B)    │
└────────────┬────────────┘
             │  4. Ed25519 Digital Signature (RFC 8032)
             ▼
┌─────────────────────────┐
│  Signed Epoch Envelope  │
└─────────────────────────┘
```

### 2.1. Chuẩn Hóa Chuỗi Tất Định (Canonical JSON - RFC 8785)
* **Vấn đề thực tế:** Trong JavaScript/V8 Engine, thứ tự các keys trong một Object JSON không được đảm bảo:
  `{"a": 1, "b": 2}` và `{"b": 2, "a": 1}` khi `JSON.stringify()` có thể ra chuỗi khác nhau. Hơn nữa, khoảng trắng, định dạng số thực, hoặc ký tự Unicode không đồng nhất sẽ dẫn tới mã băm SHA-256 khác nhau hoàn toàn (Hiệu ứng Tuyết lở - Avalanche Effect).
* **Cơ sở lý thuyết:** Áp dụng tiêu chuẩn Canonical JSON:
  * Đệ quy sắp xếp tất cả Object keys theo thứ tự từ điển (Lexicographical Byte Order / Alphabetical).
  * Loại bỏ toàn bộ khoảng trắng thừa (`whitespace-trimmed`).
  * Chuẩn hóa mảng giữ nguyên thứ tự phần tử ban đầu.
  * Chuẩn hóa giá trị `null`, boolean, số nguyên và số thực chuẩn IEEE 754.
* **Hệ quả:** Bất kể dữ liệu đi qua message queue nào hay serialize ở môi trường nào, chuỗi đầu ra luôn đồng nhất 100%.

### 2.2. Hàm Băm Mật Mã Học (SHA-256 - RFC 6234)
* **Thuộc tính toán học:**
  * **Pre-image Resistance (Kháng tiền ảnh):** Cho trước mã băm $H$, không thể tìm được bản tin $M$ sao cho $Hash(M) = H$.
  * **Second Pre-image Resistance (Kháng tiền ảnh thứ hai):** Cho trước bản tin $M_1$, không thể tìm được $M_2 \neq M_1$ sao cho $Hash(M_1) = Hash(M_2)$.
  * **Collision Resistance (Kháng va chạm):** Cực kỳ khó để tìm ra hai bản tin bất kỳ $M_1 \neq M_2$ có cùng mã băm.
* **Quy ước Node Hashing trong Merkle Tree:**
  * Để ngăn chặn tấn công **Second Pre-image Attack** trên Merkle Tree (khi kẻ tấn công giả mạo một intermediate node thành một leaf node):
    * Leaf Hash: $H_{leaf} = SHA256(0x00 \mathbin{\Vert} canonicalData)$ (hoặc tiền tố chuẩn hóa lá).
    * Interior Node: $H_{parent} = SHA256(0x01 \mathbin{\Vert} leftHash \mathbin{\Vert} rightHash)$ hoặc $SHA256(leftHash \mathbin{\Vert} rightHash)$.

### 2.3. Cấu Trúc Dữ Liệu Cây Merkle (Merkle Hash Tree)
* **Nguyên lý hình thành:** Cây nhị phân hoàn chỉnh dựng từ dưới lên (Bottom-Up):
  * **Tầng lá (Leaves):** Tập hợp các $H_0, H_1, ..., H_{n-1}$ tính từ các bản ghi audit log.
  * **Xử lý số lượng lá lẻ (Odd Leaf Handling):** Nếu số lá ở một tầng là lẻ ($2k + 1$), phần tử cuối cùng sẽ được nhân đôi (duplicate) hoặc đẩy thẳng lên tầng trên theo quy ước nhất quán của hệ thống: $H_{parent} = SHA256(H_{last} \mathbin{\Vert} H_{last})$.
  * **Gốc (Root):** Đỉnh duy nhất của cây đại diện cho tính toàn vẹn của toàn bộ tập hợp dữ liệu.
* **Chứng minh thành viên (Membership Proof / Merkle Audit Path):**
  * Để chứng minh lá $L_i$ nằm trong Merkle Root $R$, ta chỉ cần cung cấp đường dẫn gồm các sibling nodes từ lá lên gốc.
  * **Độ phức tạp không gian và thời gian:** $O(\log_2 N)$.
  * *Ví dụ:* Với $1,000,000$ logs, cây chỉ có độ sâu khoảng 20 tầng. Người dùng chỉ cần tải **20 mã băm** (~640 bytes) thay vì tải 1 triệu bản ghi (~500 MB) để kiểm chứng tính xác thực!

### 2.4. Chữ Ký Số Đường Cong Elliptic Ed25519 (RFC 8032)
* **Vì sao chọn Ed25519 thay vì RSA hay ECDSA secp256k1?**
  * **Hiệu năng vượt trội:** Tốc độ ký và xác minh của Ed25519 nhanh hơn RSA gấp hàng chục lần, tiêu tốn ít CPU, phù hợp cho vi dịch vụ xử lý hàng nghìn logs/giây.
  * **Khóa ngắn gọn:** Public Key chỉ 32 bytes (64 hex characters), Chữ ký chỉ 64 bytes (128 hex characters) $\rightarrow$ cực kỳ tối ưu dung lượng lưu trữ trong Database và Message Queue.
  * **Tính an toàn cao:** Miễn nhiễm với các cuộc tấn công Side-Channel Attack (do thời gian thực thi là hằng số - constant time) và không bị phụ thuộc vào bộ sinh số ngẫu nhiên kém (Random Number Generator flaws) như ECDSA.

---

## 🛠️ 3. Kế Hoạch Triển Khai Chi Tiết (Implementation Plan)

### 3.1. Cấu Trúc Thư Mục & Module
```text
libs/crypto-core/
├── src/
│   ├── index.ts                      # Public API re-export
│   ├── canonical/
│   │   ├── canonical-json.ts         # Thuật toán serialize chuẩn RFC 8785
│   │   └── canonical-json.spec.ts    # Unit test kiểm tra tính tất định
│   ├── hashing/
│   │   ├── hasher.ts                 # Wrapper SHA-256, HMAC, tiền tố chống va chạm
│   │   └── hasher.spec.ts            # Unit test so khớp test vector RFC
│   ├── merkle/
│   │   ├── merkle-tree.ts            # Lớp xây dựng cây Merkle, sinh proof O(log N)
│   │   ├── merkle-verifier.ts        # Hàm độc lập xác minh Merkle Proof
│   │   └── merkle-tree.spec.ts       # Test dựng cây, lá chẵn, lá lẻ, verify proof
│   └── signer/
│       ├── ed25519.ts                # Key generation, signRoot, verifySignature
│       └── ed25519.spec.ts           # Test ký số, xác thực chữ ký hợp lệ/giả mạo
├── jest.config.js                    # Cấu hình Jest cho crypto-core
├── project.json                      # Cấu hình Nx Library (@aegis/crypto-core)
├── tsconfig.lib.json                 # Cấu hình TypeScript
└── README.md                         # Tài liệu kiến trúc mật mã (File này)
```

### 3.2. Đặc Tả Chi Tiết Từng Module

#### Module 1: `canonical-json`
* **Hàm:** `canonicalStringify(obj: unknown): string`
* **Quy tắc xử lý:**
  1. Primitive types (`string`, `number`, `boolean`, `null`): Chuỗi hóa chuẩn không có khoảng trắng.
  2. `Array`: Duyệt từng phần tử, đệ quy gọi `canonicalStringify`.
  3. `Object`: Thu thập toàn bộ keys, sắp xếp bằng `Object.keys().sort()`, ghép thành chuỗi `{"k1":v1,"k2":v2}` không có space.
  4. Bỏ qua các trường `undefined`, `function`, hoặc ném lỗi nếu phát hiện cấu trúc vòng (Circular Reference).

#### Module 2: `hasher`
* **Hàm:** 
  * `sha256(data: string | Buffer): string` $\rightarrow$ Trả về chuỗi Hex 64 ký tự.
  * `hashLeaf(data: unknown): string` $\rightarrow$ Kết hợp `canonicalStringify` + `sha256`.
  * `combineHashes(left: string, right: string): string` $\rightarrow$ Băm cặp node con trong Merkle Tree.

#### Module 3: `merkle-tree` & `merkle-verifier`
* **Lớp `MerkleTree`:**
  * `constructor(leaves: string[])`: Nhận vào danh sách leaf hashes.
  * `getRoot(): string`: Trả về Merkle Root (chuỗi rỗng hoặc hash 64 hex nếu rỗng/1 phần tử).
  * `getProof(leafIndex: number): MerkleProofStepDto[]`: Trả về danh sách `{ position: 'left' | 'right', hash: string }`.
  * `getDepth(): number`: Độ sâu của cây.
* **Hàm `verifyProof(leafHash: string, proof: MerkleProofStepDto[], expectedRoot: string): boolean`:**
  * Chạy độc lập hoàn toàn, không cần khởi tạo toàn bộ cây (Zero-Memory Overhead).
  * Duyệt từ dưới lên: Nếu `step.position === 'left'` thì `current = combineHashes(step.hash, current)`, ngược lại `combineHashes(current, step.hash)`.
  * Trả về `current === expectedRoot`.

#### Module 4: `signer-ed25519`
* **Hàm:**
  * `generateEd25519KeyPair(): { privateKey: string, publicKey: string }` $\rightarrow$ Định dạng PEM chuẩn PKCS#8 / SPKI.
  * `signEpochRoot(epochNumber: number, merkleRoot: string, previousEpochRoot: string, privateKeyPem: string): string` $\rightarrow$ Ký lên thông điệp gói gọn: `epoch:${epochNumber}|root:${merkleRoot}|prev:${previousEpochRoot}`.
  * `verifyEpochSignature(message: string, signature: string, publicKeyPem: string): boolean` $\rightarrow$ Xác minh tính hợp lệ của chữ ký.

---

## ❓ 4. Vì Sao? (Design Rationales & Architecture Decisions)

| Quyết định | Lựa chọn | Vì sao không chọn phương án khác? |
| :--- | :--- | :--- |
| **Phụ thuộc thư viện mật mã** | Node.js native `crypto` | Không dùng `crypto-js` hay thư viện ngoài vì: native `crypto` viết bằng C++ (OpenSSL), hiệu năng cao hơn gấp 10-20 lần, được cập nhật bảo mật trực tiếp theo bản vá Node.js, không có nguy cơ dính lỗ hổng Supply Chain Attack. |
| **Thuật toán chữ ký số** | Ed25519 | Không chọn RSA vì kích thước khóa và chữ ký quá lớn (2048 - 4096 bits), tốc độ ký chậm. Không chọn ECDSA secp256k1 vì dễ dính lỗ hổng tái sử dụng nonce $k$ dẫn đến lộ private key. |
| **Định dạng Merkle Tree** | Binary Merkle Tree | Đơn giản, độ phức tạp $O(\log N)$ tối ưu nhất cho việc verify proof tại client/CLI so với Patricia Merkle Trie của Ethereum (vốn phức tạp và tốn tài nguyên tính toán không cần thiết cho audit logs). |
| **Tách biệt Thư viện Lõi** | Pure Library, No NestJS / No DB | Tuân thủ nguyên lý Dependency Inversion. Thư viện này phải có thể chạy được ở mọi nơi: backend NestJS (`audit-ledger`), background worker (`tamper-watcher`), CLI công cụ nhẹ (`audit-cli`), hoặc thậm chí bundle chạy trên Browser Dashboard (`audit-dashboard`). |

---

## 🎯 5. Tiêu Chí Nghiệm Thu (Acceptance Criteria) & Kịch Bản Kiểm Thử

Để hoàn thành Bước 3 theo đúng [ROADMAP.md](../../ROADMAP.md), `@aegis/crypto-core` cần vượt qua 100% các tiêu chí sau:

1. **Tính Tất Định (Determinism Test):**
   * Cùng 1 payload với các thứ tự keys khác nhau phải sinh ra cùng 1 chuỗi canonical JSON và cùng 1 mã băm SHA-256.
2. **Kiểm Thử Cây Merkle (Merkle Integrity):**
   * Xây dựng cây với số lượng lá: $1$, $2$, $3$ (lẻ), $4$, $7$ (lẻ), $100$ lá.
   * Tất cả các trường hợp sinh proof và verify proof phải trả về `true`.
   * Thử thay đổi 1 ký tự trong `leafHash` hoặc trong `proofStep` $\rightarrow$ hàm `verifyProof` phải trả về `false`.
3. **Kiểm Thử Chữ Ký Số Ed25519:**
   * Sinh cặp khóa mới, ký lên Root và xác minh thành công.
   * Thử sửa chuỗi Root hoặc sửa chữ ký $\rightarrow$ kết quả xác minh phải thất bại.
4. **Code Coverage:**
   * Đạt tối thiểu **95% - 100%** code coverage trên toàn bộ các file logic trong thư viện.
