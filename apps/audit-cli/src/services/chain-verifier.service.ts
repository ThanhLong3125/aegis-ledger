import { Injectable } from '@nestjs/common';
import { PrismaService } from '@aegis/database';
import { MerkleTree, verifyEpochSignature } from '@aegis/crypto-core';

export interface IChainVerificationReport {
  isValid: boolean;
  totalEpochs: number;
  totalLogs: number;
  anchoredEpochs: number;
  chainContinuityOk: boolean;
  signaturesValid: boolean;
  merkleTreesReconstructedOk: boolean;
  sequenceContinuityOk: boolean;
  issues: string[];
}

@Injectable()
export class ChainVerifierService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Quét toàn diện chuỗi Epoch và đối chiếu toán học độc lập
   */
  async verifyChain(): Promise<IChainVerificationReport> {
    const issues: string[] = [];

    // 1. Tải toàn bộ khối Epoch Blocks sắp xếp tăng dần
    const epochBlocks = await this.prisma.epochBlock.findMany({
      orderBy: { epochNumber: 'asc' },
      include: {
        externalAnchors: true,
      },
    });

    // 2. Tải toàn bộ Audit Logs sắp xếp tăng dần theo sequence
    const auditLogs = await this.prisma.auditLog.findMany({
      orderBy: { sequence: 'asc' },
      select: { id: true, sequence: true, epochNumber: true, leafHash: true },
    });

    let chainContinuityOk = true;
    let signaturesValid = true;
    let merkleTreesReconstructedOk = true;
    let sequenceContinuityOk = true;
    let anchoredEpochs = 0;

    // --- KIỂM TRA 1: TÍNH LIÊN TỤC CỦA CHUỖI SEQUENCE (AUDIT LOGS) ---
    if (auditLogs.length > 0) {
      let expectedSeq = 1n;
      for (const log of auditLogs) {
        if (log.sequence !== expectedSeq) {
          sequenceContinuityOk = false;
          issues.push(
            `[SEQUENCE GAP] Phát hiện đứt gãy sequence: Kỳ vọng #${expectedSeq} nhưng gặp #${log.sequence}. Có thể một log đã bị xóa!`
          );
          expectedSeq = log.sequence;
        }
        expectedSeq++;
      }
    }

    // Nhóm logs theo epochNumber để phục vụ kiểm tra tái dựng cây
    const logsByEpoch = new Map<number, string[]>();
    for (const log of auditLogs) {
      const epNum = Number(log.epochNumber);
      const list = logsByEpoch.get(epNum) || [];
      list.push(log.leafHash);
      logsByEpoch.set(epNum, list);
    }

    // --- KIỂM TRA 2: TÍNH TOÀN VẸN CỦA TỪNG KHỐI EPOCH & CHUỖI HASH CHAIN ---
    const GENESIS_PREV_ROOT = '0'.repeat(64);

    for (let i = 0; i < epochBlocks.length; i++) {
      const block = epochBlocks[i];
      const epochNum = Number(block.epochNumber);

      if (block.anchored) {
        anchoredEpochs++;
      }

      // 2a. Kiểm tra Hash Chain liên kết khối
      if (i === 0) {
        if (block.previousEpochRoot !== GENESIS_PREV_ROOT) {
          chainContinuityOk = false;
          issues.push(
            `[GENESIS INVALID] Khối khởi nguyên Epoch #0 có previousEpochRoot không hợp lệ: [${block.previousEpochRoot}] (kỳ vọng chuỗi 64 số 0).`
          );
        }
      } else {
        const prevBlock = epochBlocks[i - 1];
        if (block.previousEpochRoot !== prevBlock.merkleRoot) {
          chainContinuityOk = false;
          issues.push(
            `[HASH CHAIN BROKEN] previousEpochRoot của Epoch #${epochNum} không khớp với merkleRoot của Epoch #${Number(
              prevBlock.epochNumber
            )}!`
          );
        }
      }

      // 2b. Kiểm tra Chữ ký số Ed25519
      const isSigValid = verifyEpochSignature(
        epochNum,
        block.merkleRoot,
        block.previousEpochRoot,
        block.signature,
        block.signerPublicKey
      );

      if (!isSigValid) {
        signaturesValid = false;
        issues.push(
          `[SIGNATURE FORGERY] Chữ ký số Ed25519 của Epoch #${epochNum} không hợp lệ với Public Key!`
        );
      }

      // 2c. Tái dựng Cây Merkle từ các lá log và kiểm tra Root độc lập
      const leaves = logsByEpoch.get(epochNum) || [];
      if (leaves.length !== block.totalLogs) {
        merkleTreesReconstructedOk = false;
        issues.push(
          `[LOGS COUNT MISMATCH] Epoch #${epochNum} ghi nhận ${block.totalLogs} logs nhưng database chỉ chứa ${leaves.length} logs!`
        );
      } else if (leaves.length > 0) {
        const reconstructedTree = new MerkleTree(leaves);
        const reconstructedRoot = reconstructedTree.getRoot();

        if (reconstructedRoot !== block.merkleRoot) {
          merkleTreesReconstructedOk = false;
          issues.push(
            `[MERKLE ROOT TAMPERED] Merkle Root tính lại từ các lá của Epoch #${epochNum} [${reconstructedRoot}] không khớp với root trong khối [${block.merkleRoot}]!`
          );
        }
      }

      // 2d. Đối chiếu mốc neo ngoại vi External Anchor (nếu có)
      for (const anchor of block.externalAnchors) {
        if (anchor.merkleRoot !== block.merkleRoot) {
          issues.push(
            `[ANCHOR MISMATCH] Mốc neo ngoại vi [${anchor.anchorType}] của Epoch #${epochNum} chứa Merkle Root không khớp với khối!`
          );
        }
      }
    }

    const isValid =
      issues.length === 0 &&
      chainContinuityOk &&
      signaturesValid &&
      merkleTreesReconstructedOk &&
      sequenceContinuityOk;

    return {
      isValid,
      totalEpochs: epochBlocks.length,
      totalLogs: auditLogs.length,
      anchoredEpochs,
      chainContinuityOk,
      signaturesValid,
      merkleTreesReconstructedOk,
      sequenceContinuityOk,
      issues,
    };
  }
}
