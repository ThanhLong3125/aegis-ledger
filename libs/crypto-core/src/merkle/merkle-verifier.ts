import { MerkleProofStepDto } from '@aegis/contracts';
import { combineHashes } from '../hashing';

/**
 * Verifies a Merkle proof in O(log N) time and O(1) space.
 * Does not require loading or reconstructing the entire tree.
 */
export function verifyProof(
  leafHash: string,
  proof: MerkleProofStepDto[],
  expectedRoot: string
): boolean {
  if (!leafHash || !expectedRoot) {
    return false;
  }

  let currentHash = leafHash;

  for (const step of proof) {
    if (step.position === 'left') {
      // Sibling is on the left, current node is on the right
      currentHash = combineHashes(step.hash, currentHash);
    } else if (step.position === 'right') {
      // Sibling is on the right, current node is on the left
      currentHash = combineHashes(currentHash, step.hash);
    } else {
      return false;
    }
  }

  return currentHash === expectedRoot;
}
