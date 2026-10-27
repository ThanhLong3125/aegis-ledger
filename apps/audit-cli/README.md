# Audit CLI (`apps/audit-cli`)

Công cụ dòng lệnh Kiểm toán Độc lập (Zero-Trust Auditor CLI) trong hệ sinh thái **Aegis Ledger**.

---

## 1. Ý nghĩa & Vai trò trong Kiến trúc Aegis Ledger

Triết lý của Aegis Ledger là **"Don't Trust, Verify" (Không cần tin tưởng, hãy tự xác minh)**:
1. **Kiểm toán Độc lập Toàn diện (`verify`):**
   Kiểm toán viên bên thứ ba (Third-Party Auditor) hoặc Quản trị viên hệ thống có thể chạy lệnh để quét độc lập toàn bộ sổ cái:
   - Xác minh chuỗi số thứ tự liên tục $1, 2, 3 \dots$ trên `audit_logs` (phát hiện log bị xóa phi tang).
   - Xác minh tính liên tục của chuỗi Hash Chain giữa các Epoch ($Root_{N-1} == PrevRoot_N$).
   - Xác thực chữ ký số **Ed25519** của Validator trên từng khối bằng Public Key.
   - Tái tính toán và dựng lại cây **Merkle Tree** từ toàn bộ các lá log và đối chiếu với `merkle_root` trong DB.
2. **Xuất Bằng chứng Mật mã Học (`prove`):**
   Khi người dùng muốn chứng minh một giao dịch cụ thể (ví dụ giao dịch chuyển tiền lúc 10h sáng) đã thực sự được ghi nhận bất biến vào hệ thống:
   - CLI trích xuất đường dẫn chứng minh **Merkle Membership Proof $O(\log N)$** (danh sách sibling hashes).
   - Xuất ra file JSON để người dùng lưu trữ hoặc gửi cho đối tác/tòa án.
3. **Xác minh Bằng chứng Ngoại tuyến (`verify-proof`):**
   Bất kỳ ai nhận được file JSON bằng chứng đều có thể tự chạy thuật toán xác minh ngoại tuyến (Offline Zero-Trust):
   - **Hoàn toàn không cần kết nối mạng hoặc database**.
   - Thuần túy tính nhẩm toán học SHA-256 từ lá theo đường dẫn bằng chứng xem có bằng Merkle Root được công bố hay không.

---

## 2. Hướng dẫn Sử dụng các Lệnh (CLI Commands)

### 2.1. Quét kiểm toán toàn bộ chuỗi Sổ cái
```bash
npm run audit-cli -- verify
# Hoặc:
npx nx run audit-cli:verify
```
**Mẫu báo cáo kết quả:**
```text
================================================================================
🛡️  AEGIS LEDGER - BÁO CÁO KIỂM TOÁN MẬT MÃ HỌC ĐỘC LẬP
================================================================================
Tổng số khối Epoch đã kiểm tra     : 5
Tổng số Audit Logs đã kiểm tra      : 42
Số khối đã neo ngoại vi (Anchored) : 5
Tính liên tục Sequence (1..N)       : ✅ ĐẠT (Không có log bị xóa)
Tính liên tục Hash Chain            : ✅ ĐẠT (Previous Root khớp 100%)
Chữ ký số Ed25519 Validator         : ✅ ĐẠT (Chữ ký hợp lệ)
Tái dựng Cây Merkle độc lập         : ✅ ĐẠT (Root khớp 100% lá)
================================================================================
KẾT LUẬN: 🟢 TOÀN BỘ SỔ CÁI NGUYÊN VẸN 100% (KHÔNG PHÁT HIỆN GIAN LẬN/SỬA ĐỔI)
```

---

### 2.2. Xuất Bằng chứng Merkle Proof cho một Giao dịch
```bash
# Xuất ra màn hình terminal
npm run audit-cli -- prove --seq 105

# Hoặc xuất ra file JSON để gửi cho khách hàng
npm run audit-cli -- prove --seq 105 --out proof_seq_105.json
```

---

### 2.3. Xác minh Bằng chứng Ngoại tuyến (Offline Zero-Trust)
```bash
# Xác minh từ file JSON đã xuất
npm run audit-cli -- verify-proof --file proof_seq_105.json

# Hoặc xác minh thủ công bằng các tham số
npm run audit-cli -- verify-proof --leaf <sha256_hash> --root <merkle_root> --proof '[{"position":"left","hash":"..."}]'
```
**Mẫu kết quả:**
```text
================================================================================
🔬 KẾT QUẢ XÁC MINH TOÁN HỌC ĐỘC LẬP (ZERO-TRUST)
================================================================================
Leaf Hash      : 3eed9d641e4754f9...
Expected Root  : 1194af8fc4f9c5f2...
Số bước Proof  : 3
================================================================================
XÁC THỰC THÀNH CÔNG: 🟢 HỢP LỆ TOÀN VẸN (Lá giao dịch này toán học thuộc về Merkle Root đã ký!)
```

---

## 3. Kiểm thử Tự động

```bash
npm run test:audit-cli
```
Bao gồm các bài kiểm tra toán học cho `ProofVerifierService`, `MerkleProverService`, và `ChainVerifierService`.
