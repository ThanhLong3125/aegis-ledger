import { Injectable } from '@nestjs/common';
import { MerkleProofStepDto } from '@aegis/contracts';
import { verifyProof } from '@aegis/crypto-core';

export interface IProofVerificationResult {
  isValid: boolean;
  leafHash: string;
  expectedRoot: string;
  stepsCount: number;
  reason?: string;
}

@Injectable()
export class ProofVerifierService {
  /**
   * Xác minh độc lập bằng chứng Merkle Proof (O(log N) thời gian, O(1) bộ nhớ)
   * Thuần túy toán học mật mã học, KHÔNG cần kết nối cơ sở dữ liệu hay mạng
   */
  verify(
    leafHash: string,
    proofSteps: MerkleProofStepDto[],
    expectedRoot: string
  ): IProofVerificationResult {
    if (!leafHash || !expectedRoot) {
      return {
        isValid: false,
        leafHash,
        expectedRoot,
        stepsCount: proofSteps?.length || 0,
        reason: 'leafHash hoặc expectedRoot không được để trống.',
      };
    }

    if (!Array.isArray(proofSteps)) {
      return {
        isValid: false,
        leafHash,
        expectedRoot,
        stepsCount: 0,
        reason: 'proofSteps phải là một mảng các bước MerkleProofStepDto.',
      };
    }

    const isValid = verifyProof(leafHash, proofSteps, expectedRoot);

    return {
      isValid,
      leafHash,
      expectedRoot,
      stepsCount: proofSteps.length,
      reason: isValid
        ? undefined
        : 'Tính toán Merkle Proof từ lá không khớp với Merkle Root kỳ vọng.',
    };
  }
}
