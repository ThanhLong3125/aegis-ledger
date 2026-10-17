import { PrismaService } from './client/prisma.service';
import {
  AuditLogRepository,
  EpochBlockRepository,
  ExternalAnchorRepository,
} from './repositories';
import { EpochBatchService, WormManagerService } from './services';
import { IAuditLogLeaf, IEpochBlock } from '@aegis/contracts';

describe('@aegis/database - PostgreSQL WORM Datastore & Prisma Repositories', () => {
  let prisma: PrismaService;
  let auditLogRepo: AuditLogRepository;
  let epochBlockRepo: EpochBlockRepository;
  let externalAnchorRepo: ExternalAnchorRepository;
  let epochBatchService: EpochBatchService;
  let wormManagerService: WormManagerService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    auditLogRepo = new AuditLogRepository(prisma);
    epochBlockRepo = new EpochBlockRepository(prisma);
    externalAnchorRepo = new ExternalAnchorRepository(prisma);
    epochBatchService = new EpochBatchService(prisma, auditLogRepo, epochBlockRepo);
    wormManagerService = new WormManagerService(prisma);

    // Đảm bảo WORM triggers đã sẵn sàng
    await wormManagerService.applyWormRules();
  });

  afterAll(async () => {
    await prisma.cleanDatabaseForTesting();
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await prisma.cleanDatabaseForTesting();
  });

  describe('1. WORM Triggers Verification', () => {
    it('should have WORM triggers active in PostgreSQL information_schema', async () => {
      const isActive = await wormManagerService.verifyWormTriggersActive();
      expect(isActive).toBe(true);
    });
  });

  describe('2. EpochBlockRepository & AuditLogRepository CRUD', () => {
    const mockEpoch: IEpochBlock = {
      epochNumber: 1,
      startSequence: 1,
      endSequence: 2,
      totalLogs: 2,
      merkleRoot: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
      previousEpochRoot: '0000000000000000000000000000000000000000000000000000000000000000',
      signature: 'signature_ed25519_hex_mock_sample',
      signerPublicKey: 'pubkey_ed25519_hex_mock_sample',
      anchored: false,
      createdAt: new Date().toISOString(),
    };

    const mockLogs: IAuditLogLeaf[] = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        sequence: 1,
        epochNumber: 1,
        timestamp: new Date().toISOString(),
        actor: {
          userId: 'usr_alice',
          role: 'ADMIN',
          ipAddress: '127.0.0.1',
          userAgent: 'AegisTest/1.0',
        },
        action: 'WALLET_DEPOSIT',
        resource: { type: 'WALLET', id: 'wal_alice' },
        payload: { amount: 1000, currency: 'USD' },
        leafHash: 'leafhash_001_mock',
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        sequence: 2,
        epochNumber: 1,
        timestamp: new Date().toISOString(),
        actor: {
          userId: 'usr_bob',
          role: 'USER',
          ipAddress: '127.0.0.1',
          userAgent: 'AegisTest/1.0',
        },
        action: 'WALLET_TRANSFER',
        resource: { type: 'WALLET', id: 'wal_bob' },
        payload: { amount: 200, currency: 'USD' },
        leafHash: 'leafhash_002_mock',
      },
    ];

    it('should create and retrieve an EpochBlock', async () => {
      const created = await epochBlockRepo.create(mockEpoch);
      expect(created.epochNumber).toBe(1);
      expect(created.merkleRoot).toBe(mockEpoch.merkleRoot);

      const found = await epochBlockRepo.findByEpochNumber(1);
      expect(found).not.toBeNull();
      expect(found?.merkleRoot).toBe(mockEpoch.merkleRoot);
      expect(found?.totalLogs).toBe(2);

      const latest = await epochBlockRepo.findLatest();
      expect(latest?.epochNumber).toBe(1);
    });

    it('should insert audit logs and retrieve by sequence and range', async () => {
      await epochBlockRepo.create(mockEpoch);

      await auditLogRepo.insertLeaf(mockLogs[0]);
      await auditLogRepo.insertLeaf(mockLogs[1]);

      const log1 = await auditLogRepo.findBySequence(1);
      expect(log1).not.toBeNull();
      expect(log1?.action).toBe('WALLET_DEPOSIT');
      expect(log1?.actor.userId).toBe('usr_alice');

      const logsInEpoch = await auditLogRepo.findByEpoch(1);
      expect(logsInEpoch).toHaveLength(2);
      expect(logsInEpoch[0].sequence).toBe(1);
      expect(logsInEpoch[1].sequence).toBe(2);

      const rangeLogs = await auditLogRepo.findRange(1, 2);
      expect(rangeLogs).toHaveLength(2);

      const latestSeq = await auditLogRepo.getLatestSequence();
      expect(latestSeq).toBe(2);

      const count = await auditLogRepo.count();
      expect(count).toBe(2);
    });

    it('should mark an epoch as anchored successfully', async () => {
      await epochBlockRepo.create(mockEpoch);

      const updated = await epochBlockRepo.markAnchored(1, '0xtx_anchor_hash_123');
      expect(updated.anchored).toBe(true);
      expect(updated.anchorTxHash).toBe('0xtx_anchor_hash_123');

      // Tạo bản ghi neo ngoại vi
      const anchor = await externalAnchorRepo.create({
        epochNumber: 1,
        merkleRoot: mockEpoch.merkleRoot,
        anchorType: 'MOCK_BLOCKCHAIN',
        txHash: '0xtx_anchor_hash_123',
      });
      expect(anchor.epochNumber).toBe(1);
      expect(anchor.txHash).toBe('0xtx_anchor_hash_123');
    });
  });

  describe('3. EpochBatchService (Atomic Batch Commit)', () => {
    it('should commit epoch block and multiple logs in a single atomic transaction', async () => {
      const epochBlock: IEpochBlock = {
        epochNumber: 10,
        startSequence: 100,
        endSequence: 102,
        totalLogs: 3,
        merkleRoot: 'roothash_epoch_10_atomic',
        previousEpochRoot: 'roothash_epoch_9',
        signature: 'sig_epoch_10',
        signerPublicKey: 'pub_epoch_10',
        anchored: false,
        createdAt: new Date().toISOString(),
      };

      const logs: IAuditLogLeaf[] = [
        {
          id: 'batch-log-1',
          sequence: 100,
          epochNumber: 10,
          timestamp: new Date().toISOString(),
          actor: { userId: 'u1', ipAddress: '127.0.0.1', userAgent: 'test' },
          action: 'LOGIN',
          resource: { type: 'USER', id: 'u1' },
          payload: { success: true },
          leafHash: 'hash1',
        },
        {
          id: 'batch-log-2',
          sequence: 101,
          epochNumber: 10,
          timestamp: new Date().toISOString(),
          actor: { userId: 'u2', ipAddress: '127.0.0.1', userAgent: 'test' },
          action: 'LOGOUT',
          resource: { type: 'USER', id: 'u2' },
          payload: { success: true },
          leafHash: 'hash2',
        },
        {
          id: 'batch-log-3',
          sequence: 102,
          epochNumber: 10,
          timestamp: new Date().toISOString(),
          actor: { userId: 'u3', ipAddress: '127.0.0.1', userAgent: 'test' },
          action: 'TRANSFER',
          resource: { type: 'USER', id: 'u3' },
          payload: { amount: 50 },
          leafHash: 'hash3',
        },
      ];

      const result = await epochBatchService.commitEpochBatch({ epochBlock, logs });
      expect(result.epochNumber).toBe(10);
      expect(result.totalLogs).toBe(3);

      // Kiểm tra dữ liệu thực tế trong DB
      const blockInDb = await epochBlockRepo.findByEpochNumber(10);
      expect(blockInDb).not.toBeNull();
      expect(blockInDb?.merkleRoot).toBe('roothash_epoch_10_atomic');

      const logsInDb = await auditLogRepo.findByEpoch(10);
      expect(logsInDb).toHaveLength(3);
      expect(logsInDb[0].sequence).toBe(100);
      expect(logsInDb[2].sequence).toBe(102);
    });

    it('should reject batch commit if logs count does not match totalLogs', async () => {
      const epochBlock: IEpochBlock = {
        epochNumber: 11,
        startSequence: 103,
        endSequence: 104,
        totalLogs: 2,
        merkleRoot: 'root_11',
        previousEpochRoot: 'root_10',
        signature: 'sig',
        signerPublicKey: 'pub',
        anchored: false,
        createdAt: new Date().toISOString(),
      };

      const logs: IAuditLogLeaf[] = [
        {
          id: 'batch-log-single',
          sequence: 103,
          epochNumber: 11,
          timestamp: new Date().toISOString(),
          actor: { userId: 'u1', ipAddress: '127.0.0.1', userAgent: 'test' },
          action: 'ACTION',
          resource: { type: 'RES', id: '1' },
          payload: {},
          leafHash: 'h',
        },
      ]; // Chỉ có 1 log trong khi totalLogs = 2

      await expect(
        epochBatchService.commitEpochBatch({ epochBlock, logs })
      ).rejects.toThrow('Logs count mismatch');
    });
  });

  describe('4. WORM Policy Enforcement (Anti-Tamper Tests)', () => {
    beforeEach(async () => {
      // Chuẩn bị 1 block và 1 log
      const epochBlock: IEpochBlock = {
        epochNumber: 99,
        startSequence: 999,
        endSequence: 999,
        totalLogs: 1,
        merkleRoot: 'immutable_root_99',
        previousEpochRoot: 'prev_root',
        signature: 'sig_99',
        signerPublicKey: 'pub_99',
        anchored: false,
        createdAt: new Date().toISOString(),
      };

      const log: IAuditLogLeaf = {
        id: 'worm-test-log-id',
        sequence: 999,
        epochNumber: 99,
        timestamp: new Date().toISOString(),
        actor: { userId: 'attacker', ipAddress: '0.0.0.0', userAgent: 'curl' },
        action: 'FRAUD_TRANSFER',
        resource: { type: 'WALLET', id: 'target_wallet' },
        payload: { stolenAmount: 1000000 },
        leafHash: 'original_leaf_hash',
      };

      await epochBatchService.commitEpochBatch({ epochBlock, logs: [log] });
    });

    it('should FORBID and THROW on SQL UPDATE on audit_logs (Trigger Level)', async () => {
      // Kẻ tấn công hoặc DBA cố gắng sửa nội dung bản ghi log
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "audit_logs" SET "action" = 'LEGIT_TRANSFER' WHERE "id" = 'worm-test-log-id';`
        )
      ).rejects.toThrow(/SECURITY BREACH \[WORM POLICY\]/);

      // Kiểm tra lại dữ liệu vẫn nguyên vẹn
      const log = await auditLogRepo.findBySequence(999);
      expect(log?.action).toBe('FRAUD_TRANSFER');
    });

    it('should FORBID and THROW on SQL DELETE on audit_logs (Trigger Level)', async () => {
      // Kẻ tấn công cố gắng xóa dấu vết log
      await expect(
        prisma.$executeRawUnsafe(
          `DELETE FROM "audit_logs" WHERE "id" = 'worm-test-log-id';`
        )
      ).rejects.toThrow(/SECURITY BREACH \[WORM POLICY\]/);

      // Bản ghi vẫn còn nguyên
      const log = await auditLogRepo.findBySequence(999);
      expect(log).not.toBeNull();
    });

    it('should FORBID deleting epoch_blocks', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `DELETE FROM "epoch_blocks" WHERE "epoch_number" = 99;`
        )
      ).rejects.toThrow(/SECURITY BREACH \[WORM POLICY\]/);
    });

    it('should FORBID modifying cryptographic fields on epoch_blocks', async () => {
      // Cố tình sửa merkle_root để hợp thức hóa gian lận
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "epoch_blocks" SET "merkle_root" = 'hacked_merkle_root' WHERE "epoch_number" = 99;`
        )
      ).rejects.toThrow(/Modifying cryptographic properties/);
    });

    it('should ALLOW updating anchor status on epoch_blocks', async () => {
      // Thao tác hợp lệ: ghi nhận trạng thái neo ngoại vi
      const updated = await epochBlockRepo.markAnchored(99, '0xexternal_tx_confirmed');
      expect(updated.anchored).toBe(true);
      expect(updated.anchorTxHash).toBe('0xexternal_tx_confirmed');
    });

    it('should FORBID and THROW on SQL UPDATE on external_anchors (Trigger Level)', async () => {
      // Tạo một bản ghi neo
      await externalAnchorRepo.create({
        id: 'anchor-test-id-1',
        epochNumber: 99,
        merkleRoot: 'immutable_root_99',
        anchorType: 'MOCK_BLOCKCHAIN',
        txHash: '0xoriginal_tx_hash',
      });

      // Kẻ tấn công cố tình sửa mã giao dịch txHash hoặc MerkleRoot
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "external_anchors" SET "tx_hash" = '0xhacked_tx_hash' WHERE "id" = 'anchor-test-id-1';`
        )
      ).rejects.toThrow(/SECURITY BREACH \[WORM POLICY\]/);

      const anchor = await externalAnchorRepo.findByEpochNumber(99);
      expect(anchor?.txHash).toBe('0xoriginal_tx_hash');
    });

    it('should FORBID and THROW on SQL DELETE on external_anchors (Trigger Level)', async () => {
      // Tạo một bản ghi neo trước
      await externalAnchorRepo.create({
        id: 'anchor-test-id-delete',
        epochNumber: 99,
        merkleRoot: 'immutable_root_99',
        anchorType: 'MOCK_BLOCKCHAIN',
        txHash: '0xoriginal_tx_hash',
      });

      // Kẻ tấn công cố tình xóa bản ghi biên lai neo ngoại vi để phi tang
      await expect(
        prisma.$executeRawUnsafe(
          `DELETE FROM "external_anchors" WHERE "id" = 'anchor-test-id-delete';`
        )
      ).rejects.toThrow(/SECURITY BREACH \[WORM POLICY\]/);

      const anchor = await externalAnchorRepo.findByEpochNumber(99);
      expect(anchor).not.toBeNull();
    });
  });
});
