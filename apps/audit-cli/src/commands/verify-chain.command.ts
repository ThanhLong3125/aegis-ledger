import { ChainVerifierService } from '../services/chain-verifier.service';

export async function handleVerifyChainCommand(
  chainVerifier: ChainVerifierService
): Promise<number> {
  console.log('\n🔍 Bắt đầu quét kiểm toán tính toàn vẹn chuỗi sổ cái AegisLedger...\n');

  try {
    const report = await chainVerifier.verifyChain();

    console.log('================================================================================');
    console.log('🛡️  AEGIS LEDGER - BÁO CÁO KIỂM TOÁN MẬT MÃ HỌC ĐỘC LẬP');
    console.log('================================================================================');
    console.log(`Tổng số khối Epoch đã kiểm tra     : ${report.totalEpochs}`);
    console.log(`Tổng số Audit Logs đã kiểm tra      : ${report.totalLogs}`);
    console.log(`Số khối đã neo ngoại vi (Anchored) : ${report.anchoredEpochs}`);
    console.log(`Tính liên tục Sequence (1..N)       : ${report.sequenceContinuityOk ? '✅ ĐẠT (Không có log bị xóa)' : '❌ THẤT BẠI'}`);
    console.log(`Tính liên tục Hash Chain            : ${report.chainContinuityOk ? '✅ ĐẠT (Previous Root khớp 100%)' : '❌ THẤT BẠI'}`);
    console.log(`Chữ ký số Ed25519 Validator         : ${report.signaturesValid ? '✅ ĐẠT (Chữ ký hợp lệ)' : '❌ THẤT BẠI'}`);
    console.log(`Tái dựng Cây Merkle độc lập         : ${report.merkleTreesReconstructedOk ? '✅ ĐẠT (Root khớp 100% lá)' : '❌ THẤT BẠI'}`);
    console.log('================================================================================');

    if (report.isValid) {
      console.log('KẾT LUẬN: 🟢 TOÀN BỘ SỔ CÁI NGUYÊN VẸN 100% (KHÔNG PHÁT HIỆN GIAN LẬN/SỬA ĐỔI)\n');
      return 0;
    } else {
      console.log(`KẾT LUẬN: 🔴 PHÁT HIỆN ${report.issues.length} VI PHẠM AN NINH / SỬA ĐỔI DỮ LIỆU!`);
      report.issues.forEach((issue, idx) => {
        console.log(`  ${idx + 1}. ${issue}`);
      });
      console.log('');
      return 1;
    }
  } catch (err: any) {
    console.error(`❌ Lỗi khi thực thi kiểm toán: ${err.message}`);
    return 1;
  }
}
