import { MerkleProofStepDto } from '@aegis/contracts';
import { combineHashes } from '../hashing';

/**
 * MerkleTree implementation supporting:
 * - Deterministic bottom-up binary tree construction
 * - Odd leaf duplication handling
 * - O(log N) membership proof generation
 * - Layer introspection
 */
export class MerkleTree {
  private readonly leaves: string[];
  private readonly layers: string[][];

  constructor(leaves: string[]) {
    this.leaves = [...leaves];
    this.layers = [];
    this.buildTree();
  }

  /**
   * Builds the binary Merkle tree bottom-up layer by layer.
   */
  private buildTree(): void {
    if (this.leaves.length === 0) {
      this.layers.push([]);
      return;
    }

    let currentLayer = [...this.leaves];
    this.layers.push(currentLayer);

    while (currentLayer.length > 1) {
      const nextLayer: string[] = [];

      for (let i = 0; i < currentLayer.length; i += 2) {
        const left = currentLayer[i];
        // If odd number of nodes in this layer, duplicate the last node
        const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : left;
        nextLayer.push(combineHashes(left, right));
      }

      currentLayer = nextLayer;
      this.layers.push(currentLayer);
    }
  }

  /**
   * Returns the Merkle Root hash (64 hex chars), or empty string if no leaves exist.
   */
  public getRoot(): string {
    if (this.leaves.length === 0) {
      return '';
    }
    const topLayer = this.layers[this.layers.length - 1];
    return topLayer[0] || '';
  }

  /**
   * Returns the total number of leaves in the tree.
   */
  public getLeafCount(): number {
    return this.leaves.length;
  }

  /**
   * Returns the depth of the tree (number of layers).
   */
  public getDepth(): number {
    return this.layers.length;
  }

  /**
   * Returns a copy of the leaf hashes.
   */
  public getLeaves(): string[] {
    return [...this.leaves];
  }

  /**
   * Generates a Merkle audit proof for a leaf at the specified index.
   * Returns an array of proof steps each indicating sibling position ('left' | 'right') and hash.
   */
  public getProof(leafIndex: number): MerkleProofStepDto[] {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new RangeError(
        `Leaf index ${leafIndex} out of bounds for tree with ${this.leaves.length} leaves`
      );
    }

    const proof: MerkleProofStepDto[] = [];
    let currentIndex = leafIndex;

    // Traverse upwards from layer 0 up to (topLayer - 1)
    for (let layerIndex = 0; layerIndex < this.layers.length - 1; layerIndex++) {
      const currentLayer = this.layers[layerIndex];
      const isRightNode = currentIndex % 2 === 1;
      const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

      if (siblingIndex < currentLayer.length) {
        proof.push({
          position: isRightNode ? 'left' : 'right',
          hash: currentLayer[siblingIndex],
        });
      } else {
        // Odd node duplicated with itself
        proof.push({
          position: 'right',
          hash: currentLayer[currentIndex],
        });
      }

      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }
}
