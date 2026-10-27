import { ProofVerifierService } from '../src/services/proof-verifier.service';
import { MerkleTree, sha256 } from '@aegis/crypto-core';

describe('ProofVerifierService (Offline Zero-Trust Verification)', () => {
  let verifier: ProofVerifierService;

  beforeEach(() => {
    verifier = new ProofVerifierService();
  });

  it('should return isValid: true for an authentic Merkle proof', () => {
    const leaves = [
      sha256('log_entry_1'),
      sha256('log_entry_2'),
      sha256('log_entry_3'),
      sha256('log_entry_4'),
    ];
    const tree = new MerkleTree(leaves);
    const root = tree.getRoot();

    // Lấy proof cho leaf index 2
    const targetLeaf = leaves[2];
    const proof = tree.getProof(2);

    const result = verifier.verify(targetLeaf, proof, root);
    expect(result.isValid).toBe(true);
    expect(result.stepsCount).toBe(proof.length);
    expect(result.reason).toBeUndefined();
  });

  it('should return isValid: false if the leaf is tampered', () => {
    const leaves = [
      sha256('log_entry_1'),
      sha256('log_entry_2'),
      sha256('log_entry_3'),
      sha256('log_entry_4'),
    ];
    const tree = new MerkleTree(leaves);
    const root = tree.getRoot();
    const proof = tree.getProof(0);

    const tamperedLeaf = sha256('TAMPERED_LOG_PAYLOAD');

    const result = verifier.verify(tamperedLeaf, proof, root);
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('không khớp');
  });

  it('should return isValid: false if the expected root is wrong', () => {
    const leaves = [sha256('log_entry_1'), sha256('log_entry_2')];
    const tree = new MerkleTree(leaves);
    const proof = tree.getProof(0);

    const wrongRoot = sha256('completely_wrong_root_hash');
    const result = verifier.verify(leaves[0], proof, wrongRoot);
    expect(result.isValid).toBe(false);
  });

  it('should return isValid: false for empty or invalid inputs', () => {
    expect(verifier.verify('', [], 'root').isValid).toBe(false);
    expect(verifier.verify('leaf', null as any, 'root').isValid).toBe(false);
  });
});
