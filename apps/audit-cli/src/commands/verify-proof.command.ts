import * as fs from 'node:fs';
import { MerkleProofStepDto } from '@aegis/contracts';
import { ProofVerifierService } from '../services/proof-verifier.service';

export async function handleVerifyProofCommand(
  proofVerifier: ProofVerifierService,
  options: {
    file?: string;
    leaf?: string;
    root?: string;
    proof?: string;
  }
): Promise<number> {
  console.log('\n🧮 Bắt đầu xác minh toán học Merkle Proof độc lập (Chế độ Zero-Trust Offline)...\n');

  let leafHash = options.leaf;
  let expectedRoot = options.root;
  let proofSteps: MerkleProofStepDto[] = [];

  try {
    // 1. Nếu người dùng truyền đường dẫn file JSON (--file proof.json)
    if (options.file) {
      if (!fs.existsSync(options.file)) {
        console.error(`❌ Không tìm thấy file bằng chứng: ${options.file}`);
        return 1;
      }

      const fileContent = fs.readFileSync(options.file, 'utf8');
      const parsed = JSON.parse(fileContent);

      leafHash = parsed.leafHash;
      expectedRoot = parsed.merkleRoot;
      proofSteps = parsed.proof;

      console.log(`📄 Đã tải bằng chứng từ file: ${options.file}`);
    } else {
      // 2. Nếu người dùng truyền qua các tham số dòng lệnh rời rạc
      if (!leafHash || !expectedRoot || !options.proof) {
        console.error(
          '❌ Thiếu tham số! Vui lòng cung cấp file: --file <duong_dan_file.json>\n' +
            'Hoặc đầy đủ 3 tham số: --leaf <hash> --root <hash> --proof <chuoi_json_hoac_file>'
        );
        return 1;
      }

      if (fs.existsSync(options.proof)) {
        proofSteps = JSON.parse(fs.readFileSync(options.proof, 'utf8'));
      } else {
        proofSteps = JSON.parse(options.proof);
      }
    }

    if (!leafHash || !expectedRoot) {
      console.error('❌ Không xác định được leafHash hoặc expectedRoot từ dữ liệu cung cấp.');
      return 1;
    }

    // 3. Thực thi thuật toán xác minh độc lập
    const result = proofVerifier.verify(leafHash, proofSteps, expectedRoot);

    console.log('================================================================================');
    console.log('🔬 KẾT QUẢ XÁC MINH TOÁN HỌC ĐỘC LẬP (ZERO-TRUST)');
    console.log('================================================================================');
    console.log(`Leaf Hash      : ${result.leafHash}`);
    console.log(`Expected Root  : ${result.expectedRoot}`);
    console.log(`Số bước Proof  : ${result.stepsCount}`);
    console.log('================================================================================');

    if (result.isValid) {
      console.log('XÁC THỰC THÀNH CÔNG: 🟢 HỢP LỆ TOÀN VẸN (Lá giao dịch này toán học thuộc về Merkle Root đã ký!)\n');
      return 0;
    } else {
      console.log(`XÁC THỰC THẤT BẠI : 🔴 BẰNG CHỨNG GIẢ MẠO HOẶC SAI LỆCH!`);
      if (result.reason) {
        console.log(`Lý do              : ${result.reason}`);
      }
      console.log('');
      return 1;
    }
  } catch (err: any) {
    console.error(`❌ Lỗi định dạng hoặc dữ liệu: ${err.message}\n`);
    return 1;
  }
}
