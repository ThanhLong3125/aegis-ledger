import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from '../src/api/dashboard.service';
import { SseService } from '../src/api/sse.service';
import { PrismaService } from '@aegis/database';
import { sha256 } from '@aegis/crypto-core';
import { NotFoundException } from '@nestjs/common';

describe('DashboardService', () => {
  let service: DashboardService;
  let prismaMock: any;
  let sseMock: any;

  beforeEach(async () => {
    prismaMock = {
      epochBlock: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      auditLog: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    sseMock = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SseService, useValue: sseMock },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  describe('getOverview', () => {
    it('should return aggregated metrics correctly', async () => {
      prismaMock.epochBlock.count
        .mockResolvedValueOnce(5) // totalEpochs
        .mockResolvedValueOnce(4); // anchoredEpochs
      prismaMock.auditLog.count.mockResolvedValue(100);

      // Mock isDefenseLocked
      jest.spyOn(service, 'isDefenseLocked').mockResolvedValue(false);

      const overview = await service.getOverview();

      expect(overview).toEqual({
        totalEpochs: 5,
        totalLogs: 100,
        anchoredEpochs: 4,
        isDefenseLocked: false,
      });
    });
  });

  describe('getEpochs', () => {
    it('should return mapped epoch list', async () => {
      prismaMock.epochBlock.findMany.mockResolvedValue([
        {
          epochNumber: BigInt(1),
          startSequence: BigInt(1),
          endSequence: BigInt(10),
          totalLogs: 10,
          merkleRoot: 'root_1',
          previousEpochRoot: 'root_0',
          signature: 'sig_1',
          signerPublicKey: 'pub_1',
          anchored: true,
          anchorTxHash: '0x123',
          createdAt: new Date(),
          externalAnchors: [],
        },
      ]);

      const epochs = await service.getEpochs();

      expect(epochs).toHaveLength(1);
      expect(epochs[0].epochNumber).toBe(1);
      expect(epochs[0].merkleRoot).toBe('root_1');
    });
  });

  describe('getEpochTree', () => {
    it('should throw NotFoundException if epoch does not exist', async () => {
      prismaMock.epochBlock.findUnique.mockResolvedValue(null);

      await expect(service.getEpochTree(99)).rejects.toThrow(NotFoundException);
    });

    it('should build and return layers of Merkle nodes for an epoch', async () => {
      const hash1 = sha256('log_1');
      const hash2 = sha256('log_2');

      prismaMock.epochBlock.findUnique.mockResolvedValue({
        epochNumber: BigInt(1),
        merkleRoot: 'root_mock',
        previousEpochRoot: 'prev_root',
        signature: 'sig',
        totalLogs: 2,
      });

      prismaMock.auditLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          sequence: BigInt(1),
          epochNumber: BigInt(1),
          timestamp: new Date(),
          actor: 'user-1',
          action: 'CREATE',
          resource: 'wallet',
          payload: {},
          leafHash: hash1,
        },
        {
          id: 'log-2',
          sequence: BigInt(2),
          epochNumber: BigInt(1),
          timestamp: new Date(),
          actor: 'user-2',
          action: 'UPDATE',
          resource: 'wallet',
          payload: {},
          leafHash: hash2,
        },
      ]);

      const tree = await service.getEpochTree(1);

      expect(tree.epochNumber).toBe(1);
      expect(tree.layersCount).toBeGreaterThan(0);
      expect(tree.nodes.length).toBeGreaterThan(0);

      const leafNodes = tree.nodes.filter((n) => n.isLeaf);
      expect(leafNodes).toHaveLength(2);
      expect(leafNodes[0].data.sequence).toBe(1);
    });
  });

  describe('getProof', () => {
    it('should throw NotFoundException if audit log not found', async () => {
      prismaMock.auditLog.findUnique.mockResolvedValue(null);

      await expect(service.getProof(10)).rejects.toThrow(NotFoundException);
    });

    it('should generate a valid Merkle proof for an audit log sequence', async () => {
      const hash1 = sha256('item_1');
      const hash2 = sha256('item_2');

      const { MerkleTree } = await import('@aegis/crypto-core');
      const tree = new MerkleTree([hash1, hash2]);
      const root = tree.getRoot();

      prismaMock.auditLog.findUnique.mockResolvedValue({
        sequence: BigInt(1),
        epochNumber: BigInt(1),
        leafHash: hash1,
      });

      prismaMock.epochBlock.findUnique.mockResolvedValue({
        epochNumber: BigInt(1),
        merkleRoot: root,
      });

      prismaMock.auditLog.findMany.mockResolvedValue([
        { sequence: BigInt(1), leafHash: hash1 },
        { sequence: BigInt(2), leafHash: hash2 },
      ]);

      const res = await service.getProof(1);

      expect(res.sequence).toBe(1);
      expect(res.epochNumber).toBe(1);
      expect(res.isValid).toBe(true);
      expect(res.proof).toBeDefined();
    });
  });

  describe('resetDefenseLock', () => {
    it('should delete Redis key and emit SSE reset event', async () => {
      const mockDel = jest.fn().mockResolvedValue(1);
      (service as any).redisClient = { del: mockDel };

      const res = await service.resetDefenseLock();

      expect(res.success).toBe(true);
      expect(mockDel).toHaveBeenCalledWith('AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS');
      expect(sseMock.emit).toHaveBeenCalledWith({
        type: 'security:reset',
        data: { isDefenseLocked: false },
      });
    });
  });
});
