import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@aegis/database';
import {
  generateEd25519KeyPair,
  exportPublicKeyRawHex,
  signEpochRoot,
  MerkleTree,
} from '@aegis/crypto-core';
import { ChainVerifierService } from '../src/services/chain-verifier.service';

describe('ChainVerifierService', () => {
  let verifier: ChainVerifierService;
  let mockPrisma: any;

  const keyPair = generateEd25519KeyPair();
  const publicKeyRawHex = exportPublicKeyRawHex(keyPair.publicKey);

  beforeEach(async () => {
    mockPrisma = {
      epochBlock: {
        findMany: jest.fn(),
      },
      auditLog: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChainVerifierService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    verifier = module.get<ChainVerifierService>(ChainVerifierService);
  });

  it('should verify a completely valid ledger chain with 0 issues', async () => {
    // 1. Tạo 2 log cho Epoch 1
    const leaves1 = ['leaf_101', 'leaf_102'];
    const tree1 = new MerkleTree(leaves1);
    const root1 = tree1.getRoot();
    const prev0 = '0'.repeat(64);
    const sig1 = signEpochRoot(1, root1, prev0, keyPair.privateKey);

    // 2. Tạo 2 log cho Epoch 2
    const leaves2 = ['leaf_201', 'leaf_202'];
    const tree2 = new MerkleTree(leaves2);
    const root2 = tree2.getRoot();
    const sig2 = signEpochRoot(2, root2, root1, keyPair.privateKey);

    mockPrisma.epochBlock.findMany.mockResolvedValue([
      {
        epochNumber: 1n,
        merkleRoot: root1,
        previousEpochRoot: prev0,
        signature: sig1,
        signerPublicKey: publicKeyRawHex,
        totalLogs: 2,
        anchored: true,
        externalAnchors: [{ anchorType: 'TESTNET', merkleRoot: root1 }],
      },
      {
        epochNumber: 2n,
        merkleRoot: root2,
        previousEpochRoot: root1,
        signature: sig2,
        signerPublicKey: publicKeyRawHex,
        totalLogs: 2,
        anchored: false,
        externalAnchors: [],
      },
    ]);

    mockPrisma.auditLog.findMany.mockResolvedValue([
      { id: '1', sequence: 1n, epochNumber: 1n, leafHash: 'leaf_101' },
      { id: '2', sequence: 2n, epochNumber: 1n, leafHash: 'leaf_102' },
      { id: '3', sequence: 3n, epochNumber: 2n, leafHash: 'leaf_201' },
      { id: '4', sequence: 4n, epochNumber: 2n, leafHash: 'leaf_202' },
    ]);

    const report = await verifier.verifyChain();

    expect(report.isValid).toBe(true);
    expect(report.totalEpochs).toBe(2);
    expect(report.totalLogs).toBe(4);
    expect(report.anchoredEpochs).toBe(1);
    expect(report.chainContinuityOk).toBe(true);
    expect(report.signaturesValid).toBe(true);
    expect(report.merkleTreesReconstructedOk).toBe(true);
    expect(report.sequenceContinuityOk).toBe(true);
    expect(report.issues.length).toBe(0);
  });

  it('should detect sequence gap when a log is missing', async () => {
    mockPrisma.epochBlock.findMany.mockResolvedValue([]);
    // Sequence nhảy từ 1 sang 3 (thiếu #2)
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { id: '1', sequence: 1n, epochNumber: 1n, leafHash: 'leaf_101' },
      { id: '3', sequence: 3n, epochNumber: 1n, leafHash: 'leaf_103' },
    ]);

    const report = await verifier.verifyChain();
    expect(report.isValid).toBe(false);
    expect(report.sequenceContinuityOk).toBe(false);
    expect(report.issues.some((i) => i.includes('SEQUENCE GAP'))).toBe(true);
  });

  it('should detect broken hash chain link', async () => {
    const prev0 = '0'.repeat(64);
    const root1 = 'a'.repeat(64);
    const sig1 = signEpochRoot(1, root1, prev0, keyPair.privateKey);

    const root2 = 'b'.repeat(64);
    const brokenPrevRoot = 'c'.repeat(64); // Không khớp với root1!
    const sig2 = signEpochRoot(2, root2, brokenPrevRoot, keyPair.privateKey);

    mockPrisma.epochBlock.findMany.mockResolvedValue([
      {
        epochNumber: 1n,
        merkleRoot: root1,
        previousEpochRoot: prev0,
        signature: sig1,
        signerPublicKey: publicKeyRawHex,
        totalLogs: 0,
        externalAnchors: [],
      },
      {
        epochNumber: 2n,
        merkleRoot: root2,
        previousEpochRoot: brokenPrevRoot,
        signature: sig2,
        signerPublicKey: publicKeyRawHex,
        totalLogs: 0,
        externalAnchors: [],
      },
    ]);
    mockPrisma.auditLog.findMany.mockResolvedValue([]);

    const report = await verifier.verifyChain();
    expect(report.isValid).toBe(false);
    expect(report.chainContinuityOk).toBe(false);
    expect(report.issues.some((i) => i.includes('HASH CHAIN BROKEN'))).toBe(true);
  });

  it('should detect forged signature', async () => {
    const prev0 = '0'.repeat(64);
    const root1 = 'a'.repeat(64);
    const fakeSig = 'f'.repeat(128);

    mockPrisma.epochBlock.findMany.mockResolvedValue([
      {
        epochNumber: 1n,
        merkleRoot: root1,
        previousEpochRoot: prev0,
        signature: fakeSig,
        signerPublicKey: publicKeyRawHex,
        totalLogs: 0,
        externalAnchors: [],
      },
    ]);
    mockPrisma.auditLog.findMany.mockResolvedValue([]);

    const report = await verifier.verifyChain();
    expect(report.isValid).toBe(false);
    expect(report.signaturesValid).toBe(false);
    expect(report.issues.some((i) => i.includes('SIGNATURE FORGERY'))).toBe(true);
  });
});
