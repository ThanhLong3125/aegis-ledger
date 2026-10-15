# 🔬 Giải Mã Chi Tiết Mã Nguồn `@aegis/crypto-core` & Mối Liên Hệ Mật Mã Học

> **Tài liệu:** Bóc tách kiến trúc code từ lý thuyết toán học đến từng dòng code thực thi, kèm ví dụ thực tế trong Fintech.  
> **Mục tiêu:** Giúp hiểu rõ *tại sao code lại viết như vậy*, *nguyên lý toán học đứng sau là gì*, và *các rủi ro bảo mật nào được triệt tiêu*.

---

## 🧭 Tổng Quan: Hành Trình 4 Chặng Của Một Bản Ghi Kiểm Toán

Khi một sự kiện kiểm toán (`AuditEvent`) phát sinh từ hệ thống tài chính (ví dụ: chuyển tiền), nó phải đi qua 4 tầng xử lý mật mã nghiêm ngặt:

```text
[ Dữ liệu thô JavaScript Object ]
               │
               ▼  Chặng 1: Canonicalization (RFC 8785)
[ Chuỗi JSON Tất Định - Canonical String ]
               │
               ▼  Chặng 2: Domain-Separated SHA-256 (RFC 6234)
[ Mã băm lá (Leaf Hash) - 32 bytes hex ]
               │
               ▼  Chặng 3: Cây Merkle Nhị Phân & Proof O(log N)
[ Merkle Root (Đỉnh cây đại diện cho cả khối) ]
               │
               ▼  Chặng 4: Chữ Ký Số Bất Đối Xứng Ed25519 (RFC 8032)
[ Khối Epoch Đã Ký - Chống Chối Bỏ & Bất Biến ]
```

---

## 💡 Bảng So Sánh Hai Góc Nhìn: Đời Thường (Dễ Hiểu) vs Học Thuật (Mật Mã)

| Chặng | Góc Nhìn Trực Quan (Đời Thường) | Góc Nhìn Học Thuật (Academic & Security) |
| :--- | :--- | :--- |
| **1. Canonical JSON** | Giống như chuẩn bị giấy tờ mua hàng: Dù bạn viết "1 hộp sữa, 2 cái bánh" hay "2 cái bánh, 1 hộp sữa", thư viện tự động xếp lại theo thứ tự bảng chữ cái A-Z và xóa sạch dấu cách thừa để 2 tờ giấy in ra giống hệt nhau từng ký tự. | **RFC 8785 (JSON Canonicalization Scheme - JCS)**: Ánh xạ đơn ánh tất định $f: \mathcal{O} \to \mathcal{S}$. Sắp xếp lexicographical keys, chuẩn hóa IEEE 754, dùng `WeakSet` chặn đồ thị chu trình ngăn ngừa DoS / Stack Overflow. |
| **2. Domain-Separated Hashing** | Giống như dập dấu mực đỏ `[0x00]` lên hóa đơn gốc và dấu mực xanh `[0x01]` lên tờ tổng kết ngày. Nhờ màu mực khác nhau, kẻ gian không bao giờ tráo được tờ tổng kết ngày vào vị trí hóa đơn gốc. | **RFC 6234 SHA-256 & RFC 6962 Domain Separation**: Ngăn chặn **Second Pre-image Attack** trên cây Merkle. Tách biệt không gian tiền ảnh $\text{Domain}(\text{Leaf}) \cap \text{Domain}(\text{Node}) = \emptyset$. |
| **3. Merkle Tree & Proof** | Giống như sơ đồ thi đấu bóng đá 8 đội: Để chứng minh đội bạn vô địch, bạn không cần xem lại toàn bộ 7 trận, mà chỉ cần 3 kết quả đối đầu của các nhánh đối thủ. Với 1 triệu giao dịch, ngân hàng chỉ cần gửi 20 mã số phụ (~640B) thay vì file 500MB. | **Complete Binary Hash Tree & Membership Proof**: Cân bằng lá lẻ bằng self-duplication $N_k \equiv 1 \pmod 2$. Đường dẫn kiểm toán đạt độ phức tạp thời gian và truyền tải $O(\log_2 N)$, bộ nhớ xác minh $O(1)$ Space. |
| **4. Ed25519 Signing** | Giống như niêm phong sáp của giám đốc lên từng thùng hàng: Trên nắp thùng ghi rõ "Thùng số 2 - tiếp sau Thùng số 1". Dù hacker có sửa dữ liệu bên trong thì dấu niêm phong vỡ vụn, và không thể tráo thùng 3 lên trước thùng 2. | **RFC 8032 EdDSA (Curve25519)** & Hash-chained Epochs: Kháng tấn công kênh bên (Side-channel) nhờ constant-time execution. Chống giả mạo EUF-CMA. Móc xích Epoch $M_e = e \mathbin{\Vert} R_e \mathbin{\Vert} R_{e-1}$ tạo liên kết bất biến. |

---

## 💼 Kịch Bản Thực Tế & Code Mẫu Chi Tiết (Real-World Fintech Walkthrough)

Dưới đây là kịch bản chạy thực tế trong một hệ thống ví điện tử / ngân hàng số:
1. Phát sinh các giao dịch chuyển tiền.
2. Hệ thống tính `leafHash` và gom vào cây Merkle của Epoch.
3. Ký số bảo vệ khối bằng khóa Ed25519.
4. Người dùng (Alice) tự tải bằng chứng $O(\log N)$ để kiểm toán giao dịch của mình.
5. Mô phỏng hacker sửa trộm số tiền trong Database và bị hệ thống phát hiện tức thì.

### 📝 Mã Nguồn Ví Dụ:

```typescript
import {
  hashLeaf,
  MerkleTree,
  verifyProof,
  generateEd25519KeyPair,
  signEpochRoot,
  verifyEpochSignature,
} from '@aegis/crypto-core';

// ============================================================================
// BƯỚC 1: HỆ THỐNG GHI NHẬN CÁC GIAO DỊCH TRONG 1 EPOCH (BATCH)
// ============================================================================
console.log('--- BƯỚC 1: THU THẬP GIAO DỊCH & TÍNH LEAF HASH ---');

const txAliceToBob = {
  txId: 'tx-1001',
  from: 'alice@bank.com',
  to: 'bob@bank.com',
  amount: 50000,
  currency: 'VND',
  timestamp: '2026-10-15T00:00:00.000Z',
};

const txCharlieToDave = {
  txId: 'tx-1002',
  from: 'charlie@bank.com',
  to: 'dave@bank.com',
  amount: 200000,
  currency: 'VND',
  timestamp: '2026-10-15T00:00:01.000Z',
};

const txEveToFrank = {
  txId: 'tx-1003',
  from: 'eve@bank.com',
  to: 'frank@bank.com',
  amount: 1500000,
  currency: 'VND',
  timestamp: '2026-10-15T00:00:02.000Z',
};

// Tính Leaf Hash: Tự động sắp xếp JSON theo RFC 8785 + thêm tiền tố 0x00 chống tấn công
const leaf0 = hashLeaf(txAliceToBob);
const leaf1 = hashLeaf(txCharlieToDave);
const leaf2 = hashLeaf(txEveToFrank);

console.log('Mã băm giao dịch Alice (Leaf 0):', leaf0);
console.log('Mã băm giao dịch Charlie (Leaf 1):', leaf1);
console.log('Mã băm giao dịch Eve (Leaf 2):', leaf2);

// ============================================================================
// BƯỚC 2: DỰNG CÂY MERKLE & ĐÓNG GÓI EPOCH BLOCK
// ============================================================================
console.log('\n--- BƯỚC 2: DỰNG CÂY MERKLE (3 LÁ - XỬ LÝ LÁ LẺ) ---');

// Dựng cây Merkle từ 3 lá:
// Tầng lá có 3 phần tử (lẻ) -> Leaf 2 tự nhân đôi với chính nó để kết hợp
const tree = new MerkleTree([leaf0, leaf1, leaf2]);
const merkleRoot = tree.getRoot();

console.log('Merkle Root của Epoch 1:', merkleRoot);
console.log('Tổng số lá:', tree.getLeafCount(), '| Chiều cao cây:', tree.getDepth());

// ============================================================================
// BƯỚC 3: KÝ SỐ ED25519 BẢO VỆ PHONG BÌ EPOCH
// ============================================================================
console.log('\n--- BƯỚC 3: KÝ SỐ ED25519 CHỐNG CHỐI BỎ ---');

// Server khởi tạo cặp khóa Ed25519 (Khóa bí mật lưu trong KMS/HSM, Khóa công khai phát hành cho người dùng)
const { privateKey, publicKey } = generateEd25519KeyPair();

const epochNumber = 1;
const previousEpochRoot = '0000000000000000000000000000000000000000000000000000000000000000'; // Khối Genesis

// Ký số lên thông điệp gói: "epoch:1|root:<merkleRoot>|prev:<previousEpochRoot>"
const epochSignature = signEpochRoot(epochNumber, merkleRoot, previousEpochRoot, privateKey);
console.log('Chữ ký số Ed25519 (128 hex chars):', epochSignature);

// ============================================================================
// BƯỚC 4: NGƯỜI DÙNG ALICE TỰ KIỂM TOÁN GIAO DỊCH CỦA MÌNH THEO ĐỘ PHỨC TẠP O(log N)
// ============================================================================
console.log('\n--- BƯỚC 4: ALICE KIỂM TRA TÍNH TOÀN VẸN GIAO DỊCH TRÊN THIẾT BỊ CÁ NHÂN ---');

// Alice yêu cầu server cấp Merkle Proof cho giao dịch index = 0 của mình:
const aliceProof = tree.getProof(0);
console.log('Bằng chứng Merkle Proof gửi cho Alice:', JSON.stringify(aliceProof, null, 2));

// 1. Alice kiểm tra xem chữ ký của Server có hợp lệ không:
const isServerSignatureValid = verifyEpochSignature(
  epochNumber,
  merkleRoot,
  previousEpochRoot,
  epochSignature,
  publicKey
);
console.log('1. Chữ ký số của Server hợp lệ?', isServerSignatureValid); // true

// 2. Alice tự tính lại mã băm giao dịch của mình và đối chiếu qua Proof lên Root:
const aliceCalculatedLeaf = hashLeaf(txAliceToBob);
const isAliceTxInRoot = verifyProof(aliceCalculatedLeaf, aliceProof, merkleRoot);
console.log('2. Giao dịch của Alice được toán học chứng minh nằm trong Root?', isAliceTxInRoot); // true

// ============================================================================
// BƯỚC 5: HACKER SỬA TRỘM TIỀN TRONG DATABASE - PHÁT HIỆN GIAN LẬN TỨC THÌ
// ============================================================================
console.log('\n--- BƯỚC 5: MÔ PHỎNG HACKER SỬA SỐ TIỀN CỦA ALICE ---');

// Kẻ tấn công hoặc DBA biến chất chạy câu lệnh SQL UPDATE sửa amount từ 50,000 thành 500,000 VND:
const tamperedTxAlice = {
  ...txAliceToBob,
  amount: 500000, // Dữ liệu đã bị sửa lén
};

// Khi kiểm toán viên kiểm tra lại giao dịch bị sửa:
const tamperedLeaf = hashLeaf(tamperedTxAlice);
const isTamperedValid = verifyProof(tamperedLeaf, aliceProof, merkleRoot);

console.log('Giao dịch bị sửa có vượt qua được kiểm toán không?', isTamperedValid); // false -> BỊ PHÁT HIỆN NGAY!
```

---

## 🔍 Bóc Tách Từng Dòng Code & Liên Hệ Mật Mã Học

Dưới đây là chi tiết phân tích từng file mã nguồn:

### 1. File [`canonical-json.ts`](file:///home/thanhlong/Documents/aegis-ledger-workspace/libs/crypto-core/src/canonical/canonical-json.ts)

```typescript
export function canonicalStringify(value: unknown, seen = new WeakSet<object>()): string {
```
* **Mối liên hệ lý thuyết:** 
  * `WeakSet` giải quyết bài toán đồ thị có chu trình ($G = (V, E)$ chứa directed cycle). Nếu một object chứa thuộc tính trỏ lại chính nó (`a.self = a`), nếu không có `WeakSet` thì đệ quy sẽ chạy vô tận và gây sập tiến trình Node.js (`Maximum call stack size exceeded`).

```typescript
  if (type === 'number') {
    if (!Number.isFinite(value as number)) return 'null';
    return (value as number).toString();
  }
```
* **Mối liên hệ lý thuyết:** 
  * Trong JavaScript, `NaN` và `Infinity` có kiểu dữ liệu là `'number'`, nhưng trong chuẩn JSON (RFC 8259) chúng không tồn tại. Việc ép về `'null'` tuân thủ tiêu chuẩn ECMAScript JSON Specification.

```typescript
  const keys = Object.keys(obj).sort();
```
* **Mối liên hệ lý thuyết:** 
  * Đây là dòng code mấu chốt của **RFC 8785**: Sắp xếp khóa theo thứ tự từ điển (Lexicographical order). Nhờ dòng này, `{ "z": 1, "a": 2 }` hay `{ "a": 2, "z": 1 }` đều cho ra cùng một chuỗi `{"a":2,"z":1}`.

---

### 2. File [`hasher.ts`](file:///home/thanhlong/Documents/aegis-ledger-workspace/libs/crypto-core/src/hashing/hasher.ts)

```typescript
export function hashLeaf(data: unknown): string {
  const canonical = canonicalStringify(data);
  const buffer = Buffer.concat([Buffer.from([0x00]), Buffer.from(canonical, 'utf8')]);
  return sha256(buffer);
}
```
* **Mối liên hệ lý thuyết:**
  * Byte `0x00` đứng đầu đóng vai trò là **Leaf Domain Separator** (RFC 6962).
  * Giả sử hacker tạo một transaction có nội dung chính là chuỗi ghép 64 bytes của 2 mã băm nút cha. Khi đi qua `hashLeaf`, byte `0x00` sẽ được chèn vào trước, biến mã băm đầu ra thành một giá trị hoàn toàn khác với mã băm của nút cha (vốn dùng tiền tố `0x01`). Cuộc tấn công Second Pre-image bị chặn đứng hoàn toàn.

```typescript
export function combineHashes(leftHex: string, rightHex: string): string {
  const leftBuf = Buffer.from(leftHex, 'hex');
  const rightBuf = Buffer.from(rightHex, 'hex');
  const buffer = Buffer.concat([Buffer.from([0x01]), leftBuf, rightBuf]);
  return sha256(buffer);
}
```
* **Mối liên hệ lý thuyết:**
  * Byte `0x01` là **Internal Node Domain Separator**.
  * Chuyển chuỗi Hex về dạng `Buffer` nhị phân 32 bytes trước khi ghép giúp tối ưu tốc độ xử lý trong OpenSSL C++, đồng thời đảm bảo đúng kích thước $256 \text{ bits} + 256 \text{ bits} + 8 \text{ bits} = 520 \text{ bits}$ đầu vào cho SHA-256.

---

### 3. File [`merkle-tree.ts`](file:///home/thanhlong/Documents/aegis-ledger-workspace/libs/crypto-core/src/merkle/merkle-tree.ts) & [`merkle-verifier.ts`](file:///home/thanhlong/Documents/aegis-ledger-workspace/libs/crypto-core/src/merkle/merkle-verifier.ts)

#### Dựng cây bottom-up:
```typescript
while (currentLayer.length > 1) {
  const nextLayer: string[] = [];

  for (let i = 0; i < currentLayer.length; i += 2) {
    const left = currentLayer[i];
    const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : left;
    nextLayer.push(combineHashes(left, right));
  }

  currentLayer = nextLayer;
  this.layers.push(currentLayer);
}
```
* **Mối liên hệ lý thuyết:**
  * Biểu thức `const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : left;` hiện thực hóa quy tắc **Odd Leaf Duplication**: Nếu số phần tử của tầng là lẻ, phần tử cuối cùng tự nhân đôi với chính nó ($right = left$). Cây luôn khép kín và không bị lỗi `undefined pointer`.

#### Xác minh đường dẫn kiểm toán $O(\log N)$:
```typescript
export function verifyProof(
  leafHash: string,
  proof: MerkleProofStepDto[],
  expectedRoot: string
): boolean {
  let currentHash = leafHash;

  for (const step of proof) {
    if (step.position === 'left') {
      currentHash = combineHashes(step.hash, currentHash);
    } else if (step.position === 'right') {
      currentHash = combineHashes(currentHash, step.hash);
    }
  }

  return currentHash === expectedRoot;
}
```
* **Mối liên hệ lý thuyết:**
  * Hàm này có độ phức tạp thời gian $O(\log_2 N)$ và không gian $O(1)$.
  * Mỗi bước trong vòng lặp lật ngược lại phép băm tương ứng: nếu sibling ở bên `'left'`, nút hiện tại là con phải $\rightarrow$ gọi `combineHashes(sibling, current)`. Nếu trùng với `expectedRoot` thì theo tính chất kháng va chạm (Collision Resistance) của SHA-256, xác suất làm giả lá mà vẫn ra đúng Root là $1 / 2^{256} \approx 0$.

---

### 4. File [`ed25519.ts`](file:///home/thanhlong/Documents/aegis-ledger-workspace/libs/crypto-core/src/signer/ed25519.ts)

```typescript
export function formatEpochSignMessage(
  epochNumber: number,
  merkleRoot: string,
  previousEpochRoot: string
): string {
  return `epoch:${epochNumber}|root:${merkleRoot}|prev:${previousEpochRoot}`;
}
```
* **Mối liên hệ lý thuyết:**
  * Móc xích dữ liệu (Hash-chaining): Việc đưa `previousEpochRoot` vào thông điệp ký tạo thành một chuỗi liên tục (tương tự như trường `previousBlockHash` của Bitcoin). Kẻ tấn công không thể:
    1. Đổi thứ tự của các Epoch Block.
    2. Cắt xén bớt một Epoch cũ ở giữa mà không làm đứt gãy chữ ký của toàn bộ các Epoch phía sau.

```typescript
export function signMessage(message: string, privateKeyPem: string): string {
  const signBuffer = Buffer.from(message, 'utf8');
  const signature = crypto.sign(null, signBuffer, privateKeyPem);
  return signature.toString('hex');
}
```
* **Mối liên hệ lý thuyết:**
  * Sử dụng thuật toán `PureEd25519` (RFC 8032): Không cần băm thông điệp trước vì Ed25519 tự động thực hiện băm kép nội bộ bằng SHA-512.
  * Việc truyền `null` vào tham số thuật toán băm của `crypto.sign(null, ...)` là quy chuẩn của Node.js cho các đường cong Edwards (Ed25519 / Ed448).
