import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@aegis/database';
import { MerkleTree, verifyProof } from '@aegis/crypto-core';
import { MerkleProverService } from '../src/services/merkle-prover.service';

describe('MerkleProverService', () => {
  let prover: MerkleProverService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      auditLog: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      epochBlock: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerkleProverService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    prover = module.get<MerkleProverService>(MerkleProverService);
  });

  it('should generate a valid Merkle membership proof for an existing sequence', async () => {
    const leafHashes = ['leaf_001', 'leaf_002', 'leaf_003'];
    const tree = new MerkleTree(leafHashes);
    const expectedRoot = tree.getRoot();

    mockPrisma.auditLog.findUnique.mockResolvedValue({
      id: 'log_uuid_2',
      sequence: 2n,
      epochNumber: 1n,
      leafHash: 'leaf_002',
    });

    mockPrisma.epochBlock.findUnique.mockResolvedValue({
      epochNumber: 1n,
      merkleRoot: expectedRoot,
    });

    mockPrisma.auditLog.findMany.mockResolvedValue([
      { sequence: 1n, leafHash: 'leaf_001' },
      { sequence: 2n, leafHash: 'leaf_002' },
      { sequence: 3n, leafHash: 'leaf_003' },
    ]);

    const proofDto = await prover.generateProof(2);

    expect(proofDto.sequence).toBe(2);
    expect(proofDto.epochNumber).toBe(1);
    expect(proofDto.leafHash).toBe('leaf_002');
    expect(proofDto.merkleRoot).toBe(expectedRoot);
    expect(proofDto.proof.length).toBeGreaterThan(0);

    // Xác minh lại bằng thuật toán
    const valid = verifyProof(proofDto.leafHash, proofDto.proof, proofDto.merkleRoot);
    expect(valid).toBe(true);
  });

  it('should throw NotFoundException if sequence does not exist', async () => {
    mockPrisma.auditLog.findUnique.mockResolvedValue(null);

    await expect(prover.generateProof(999)).rejects.toThrow(NotFoundException);
  });

  it('should detect root mismatch if epoch block root was tampered', async () => {
    mockPrisma.auditLog.findUnique.mockResolvedValue({
      id: 'log_1',
      sequence: 1n,
      epochNumber: 1n,
      leafHash: 'leaf_001',
    });

    mockPrisma.epochBlock.findUnique.mockResolvedValue({
      epochNumber: 1n,
      merkleRoot: 'TAMPERED_ROOT_HASH',
    });

    mockPrisma.auditLog.findMany.mockResolvedValue([
      { sequence: 1n, leafHash: 'leaf_001' },
    ]);

    await expect(prover.generateProof(1)).rejects.toThrow('CẢNH BÁO TOÀN VẸN');
  });
});
