import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@aegis/database';
import { MerkleProofDto } from '@aegis/contracts';
import { MerkleTree, verifyProof } from '@aegis/crypto-core';

@Injectable()
export class MerkleProverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sinh bằng chứng thành viên Merkle Proof O(log N) cho một giao dịch theo sequence
   */
  async generateProof(sequenceNumber: number): Promise<MerkleProofDto> {
    const seqBigInt = BigInt(sequenceNumber);

    // 1. Tìm bản ghi log mục tiêu theo sequence
    const targetLog = await this.prisma.auditLog.findUnique({
      where: { sequence: seqBigInt },
    });

    if (!targetLog) {
      throw new NotFoundException(
        `Không tìm thấy Audit Log với Sequence #${sequenceNumber} trong cơ sở dữ liệu.`
      );
    }

    // 2. Tìm khối Epoch chứa bản ghi này
    const epochBlock = await this.prisma.epochBlock.findUnique({
      where: { epochNumber: targetLog.epochNumber },
    });

    if (!epochBlock) {
      throw new NotFoundException(
        `Không tìm thấy Epoch Block #${targetLog.epochNumber} chứa Sequence #${sequenceNumber}.`
      );
    }

    // 3. Tải toàn bộ các logs thuộc về Epoch này, sắp xếp tăng dần theo sequence
    const epochLogs = await this.prisma.auditLog.findMany({
      where: { epochNumber: targetLog.epochNumber },
      orderBy: { sequence: 'asc' },
      select: { sequence: true, leafHash: true },
    });

    const leafHashes = epochLogs.map((l) => l.leafHash);

    // 4. Dựng cây Merkle trong RAM
    const merkleTree = new MerkleTree(leafHashes);

    // Kiểm tra tính khớp nối với Merkle Root trong khối
    const computedRoot = merkleTree.getRoot();
    if (computedRoot !== epochBlock.merkleRoot) {
      throw new Error(
        `CẢNH BÁO TOÀN VẸN: Merkle Root tính lại [${computedRoot}] không khớp với Root lưu trong Epoch Block [${epochBlock.merkleRoot}]!`
      );
    }

    // 5. Xác định vị trí lá (leaf index) của log mục tiêu
    const leafIndex = epochLogs.findIndex((l) => l.sequence === seqBigInt);
    if (leafIndex === -1) {
      throw new Error(`Lỗi nội bộ: Không tìm thấy index của sequence #${sequenceNumber} trong epoch.`);
    }

    // 6. Trích xuất đường dẫn bằng chứng O(log N)
    const proofSteps = merkleTree.getProof(leafIndex);

    // 7. Tự kiểm toán toán học trước khi xuất
    const isMathematicallyValid = verifyProof(
      targetLog.leafHash,
      proofSteps,
      epochBlock.merkleRoot
    );

    if (!isMathematicallyValid) {
      throw new Error('Lỗi mật mã học: Bằng chứng Merkle Proof sinh ra không vượt qua tự kiểm tra!');
    }

    return {
      sequence: sequenceNumber,
      epochNumber: Number(targetLog.epochNumber),
      leafHash: targetLog.leafHash,
      merkleRoot: epochBlock.merkleRoot,
      proof: proofSteps,
    };
  }
}
