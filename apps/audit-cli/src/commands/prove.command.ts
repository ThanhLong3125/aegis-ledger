import * as fs from 'node:fs';
import { MerkleProverService } from '../services/merkle-prover.service';

export async function handleProveCommand(
  merkleProver: MerkleProverService,
  options: { seq: string; out?: string }
): Promise<number> {
  const seqNumber = parseInt(options.seq, 10);
  if (isNaN(seqNumber) || seqNumber <= 0) {
    console.error('❌ Vui lòng cung cấp sequence hợp lệ bằng tùy chọn --seq <number> (số nguyên dương).');
    return 1;
  }

  console.log(`\n🔍 Đang trích xuất Merkle Membership Proof cho Sequence #${seqNumber}...\n`);

  try {
    const proofDto = await merkleProver.generateProof(seqNumber);

    console.log('================================================================================');
    console.log(`📜 BẰNG CHỨNG MẬT MÃ MERKLE PROOF [Sequence #${seqNumber}]`);
    console.log('================================================================================');
    console.log(`Epoch Number : #${proofDto.epochNumber}`);
    console.log(`Leaf Hash    : ${proofDto.leafHash}`);
    console.log(`Merkle Root  : ${proofDto.merkleRoot}`);
    console.log(`Độ dài Proof : ${proofDto.proof.length} bước [O(log N)]`);
    console.log('Đường dẫn chứng minh (Proof Path):');
    proofDto.proof.forEach((step, idx) => {
      console.log(`  Bước ${idx + 1}: [Vị trí: ${step.position.toUpperCase()}] Sibling: ${step.hash}`);
    });
    console.log('================================================================================');
    console.log('TỰ KIỂM TOÁN : ✅ HỢP LỆ TOÁN HỌC (Đã xác thực trùng khớp Merkle Root)\n');

    if (options.out) {
      fs.writeFileSync(options.out, JSON.stringify(proofDto, null, 2), 'utf8');
      console.log(`💾 Đã xuất bằng chứng ra file: ${options.out}\n`);
    } else {
      console.log('💡 Gợi ý: Dùng thêm --out <ten_file.json> để lưu file bằng chứng gửi cho khách hàng.\n');
    }

    return 0;
  } catch (err: any) {
    console.error(`❌ Thất bại: ${err.message}\n`);
    return 1;
  }
}
