import { MerkleTree } from './merkle-tree';
import { verifyProof } from './merkle-verifier';
import { hashLeaf } from '../hashing';

describe('MerkleTree & MerkleVerifier', () => {
  it('should handle empty tree gracefully', () => {
    const tree = new MerkleTree([]);
    expect(tree.getRoot()).toBe('');
    expect(tree.getLeafCount()).toBe(0);
    expect(tree.getDepth()).toBe(1);
    expect(() => tree.getProof(0)).toThrow(RangeError);
  });

  it('should build tree with single leaf', () => {
    const leaf = hashLeaf({ id: 1 });
    const tree = new MerkleTree([leaf]);

    expect(tree.getRoot()).toBe(leaf);
    expect(tree.getLeafCount()).toBe(1);
    expect(tree.getDepth()).toBe(1);

    const proof = tree.getProof(0);
    expect(proof).toEqual([]);
    expect(verifyProof(leaf, proof, tree.getRoot())).toBe(true);
  });

  it('should build balanced tree with 2 leaves and verify proofs', () => {
    const leaf0 = hashLeaf({ id: 0 });
    const leaf1 = hashLeaf({ id: 1 });
    const tree = new MerkleTree([leaf0, leaf1]);

    const root = tree.getRoot();
    expect(root).toHaveLength(64);
    expect(tree.getDepth()).toBe(2);

    // Verify leaf 0
    const proof0 = tree.getProof(0);
    expect(proof0).toHaveLength(1);
    expect(proof0[0].position).toBe('right');
    expect(proof0[0].hash).toBe(leaf1);
    expect(verifyProof(leaf0, proof0, root)).toBe(true);

    // Verify leaf 1
    const proof1 = tree.getProof(1);
    expect(proof1).toHaveLength(1);
    expect(proof1[0].position).toBe('left');
    expect(proof1[0].hash).toBe(leaf0);
    expect(verifyProof(leaf1, proof1, root)).toBe(true);
  });

  it('should handle odd leaves count (3 leaves) by duplicating last leaf', () => {
    const leaves = [hashLeaf({ id: 1 }), hashLeaf({ id: 2 }), hashLeaf({ id: 3 })];
    const tree = new MerkleTree(leaves);

    expect(tree.getLeafCount()).toBe(3);
    const root = tree.getRoot();
    expect(root).toHaveLength(64);

    for (let i = 0; i < leaves.length; i++) {
      const proof = tree.getProof(i);
      expect(verifyProof(leaves[i], proof, root)).toBe(true);
    }
  });

  it('should handle odd leaves count (7 leaves) and various power of two (4, 8)', () => {
    const leaves7 = Array.from({ length: 7 }, (_, i) => hashLeaf({ seq: i }));
    const tree7 = new MerkleTree(leaves7);
    const root7 = tree7.getRoot();

    for (let i = 0; i < leaves7.length; i++) {
      const proof = tree7.getProof(i);
      expect(verifyProof(leaves7[i], proof, root7)).toBe(true);
    }

    const leaves4 = Array.from({ length: 4 }, (_, i) => hashLeaf({ seq: i }));
    const tree4 = new MerkleTree(leaves4);
    const root4 = tree4.getRoot();

    for (let i = 0; i < leaves4.length; i++) {
      const proof = tree4.getProof(i);
      expect(verifyProof(leaves4[i], proof, root4)).toBe(true);
    }
  });

  it('should scale to 100 leaves and verify all membership proofs in O(log N)', () => {
    const count = 100;
    const leaves = Array.from({ length: count }, (_, i) =>
      hashLeaf({ transactionId: `tx-${i}`, amount: i * 100 })
    );

    const tree = new MerkleTree(leaves);
    const root = tree.getRoot();

    // Max depth for 100 leaves should be ceil(log2(100)) + 1 = 7 + 1 = 8 layers
    expect(tree.getDepth()).toBeLessThanOrEqual(8);

    // Verify all 100 leaves
    for (let i = 0; i < count; i++) {
      const proof = tree.getProof(i);
      expect(proof.length).toBeLessThanOrEqual(7);
      expect(verifyProof(leaves[i], proof, root)).toBe(true);
    }
  });

  it('should fail verification if leafHash is tampered', () => {
    const leaves = [hashLeaf({ id: 1 }), hashLeaf({ id: 2 }), hashLeaf({ id: 3 })];
    const tree = new MerkleTree(leaves);
    const root = tree.getRoot();

    const proof = tree.getProof(0);
    const tamperedLeaf = hashLeaf({ id: 999 });

    expect(verifyProof(tamperedLeaf, proof, root)).toBe(false);
  });

  it('should fail verification if proof hash or position is tampered', () => {
    const leaves = [hashLeaf({ id: 1 }), hashLeaf({ id: 2 }), hashLeaf({ id: 3 }), hashLeaf({ id: 4 })];
    const tree = new MerkleTree(leaves);
    const root = tree.getRoot();

    const proof = tree.getProof(0);

    // Tamper hash in proof step
    const corruptedHashProof = [
      { ...proof[0], hash: '0000000000000000000000000000000000000000000000000000000000000000' },
      ...proof.slice(1),
    ];
    expect(verifyProof(leaves[0], corruptedHashProof, root)).toBe(false);

    // Tamper position
    const corruptedPosProof = [
      { ...proof[0], position: (proof[0].position === 'left' ? 'right' : 'left') as 'left' | 'right' },
      ...proof.slice(1),
    ];
    expect(verifyProof(leaves[0], corruptedPosProof, root)).toBe(false);
  });

  it('should return false for invalid empty leaf or empty root in verifyProof', () => {
    expect(verifyProof('', [], 'some-root')).toBe(false);
    expect(verifyProof('some-leaf', [], '')).toBe(false);
  });
});
