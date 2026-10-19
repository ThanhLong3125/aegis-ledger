import { Test, TestingModule } from '@nestjs/testing';
import { IAuditEvent, AuditAction } from '@aegis/contracts';
import { verifyEpochSignature } from '@aegis/crypto-core';
import {
  PrismaService,
  WormManagerService,
  AuditLogRepository,
  EpochBlockRepository,
} from '@aegis/database';

import { AppModule } from '../src/app.module';
import { SlidingWindowService } from '../src/buffer/sliding-window.service';
import { SequenceTrackerService } from '../src/engine/sequence-tracker.service';

describe('AuditLedger E2E Integration Test (Ingestion -> Buffer -> Crypto -> PostgreSQL WORM)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let wormManager: WormManagerService;
  let auditLogRepo: AuditLogRepository;
  let epochBlockRepo: EpochBlockRepository;
  let slidingWindow: SlidingWindowService;
  let sequenceTracker: SequenceTrackerService;

  const createEvent = (index: number, amount: number): IAuditEvent => ({
    eventId: `e2e-event-uuid-${index}`,
    streamKey: `wal_merchant_${index}`,
    timestamp: new Date().toISOString(),
    actor: {
      userId: `usr_e2e_${index}`,
      role: 'MERCHANT',
      ipAddress: '10.0.0.1',
      userAgent: 'E2E-IntegrationTest/1.0',
    },
    action: AuditAction.WALLET_TRANSFER,
    resource: { type: 'WALLET', id: `wal_merchant_${index}` },
    payload: { amount, currency: 'USD', fee: 1.5 },
  });

  beforeAll(async () => {
    // Nạp .env vào process.env nếu chưa có
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL =
        'postgresql://aegis_admin:aegis_secure_password_2026@localhost:5432/aegis_ledger_db?schema=public';
    }

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await moduleRef.init();

    prisma = moduleRef.get(PrismaService);
    wormManager = moduleRef.get(WormManagerService);
    auditLogRepo = moduleRef.get(AuditLogRepository);
    epochBlockRepo = moduleRef.get(EpochBlockRepository);
    slidingWindow = moduleRef.get(SlidingWindowService);
    sequenceTracker = moduleRef.get(SequenceTrackerService);

    await prisma.cleanDatabaseForTesting();
    await wormManager.applyWormRules();
    await sequenceTracker.initialize();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cleanDatabaseForTesting();
      await prisma.$disconnect();
    }
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('1. Luồng tích hợp Ingestion: Đẩy 5 logs -> Force Flush -> Lưu nguyên tử vào PostgreSQL', async () => {
    // Đẩy 5 sự kiện vào bộ đệm
    for (let i = 1; i <= 5; i++) {
      await slidingWindow.push(createEvent(i, i * 100));
    }

    // Xả buffer ghi vào DB
    const results = await slidingWindow.forceFlush();
    expect(results).toHaveLength(1);

    const { epochBlock, logs } = results[0];
    expect(epochBlock.epochNumber).toBe(1);
    expect(epochBlock.startSequence).toBe(1);
    expect(epochBlock.endSequence).toBe(5);
    expect(epochBlock.totalLogs).toBe(5);

    // 2. Truy vấn trực tiếp từ PostgreSQL kiểm chứng tính toàn vẹn
    const dbEpoch = await epochBlockRepo.findByEpochNumber(1);
    expect(dbEpoch).not.toBeNull();
    expect(dbEpoch?.merkleRoot).toBe(epochBlock.merkleRoot);
    expect(dbEpoch?.totalLogs).toBe(5);

    // Xác thực chữ ký số Ed25519 lưu trong DB
    const isSigValid = verifyEpochSignature(
      dbEpoch!.epochNumber,
      dbEpoch!.merkleRoot,
      dbEpoch!.previousEpochRoot,
      dbEpoch!.signature,
      dbEpoch!.signerPublicKey
    );
    expect(isSigValid).toBe(true);

    // Kiểm tra 5 bản ghi audit_logs trong DB
    const dbLogs = await auditLogRepo.findByEpoch(1);
    expect(dbLogs).toHaveLength(5);
    expect(dbLogs[0].sequence).toBe(1);
    expect(dbLogs[4].sequence).toBe(5);
    expect(dbLogs[0].leafHash).toBe(logs[0].leafHash);
  });

  it('2. Khối Epoch tiếp theo tự động nối chuỗi Hash-Chain vào khối trước', async () => {
    // Đẩy tiếp 3 sự kiện
    for (let i = 6; i <= 8; i++) {
      await slidingWindow.push(createEvent(i, i * 200));
    }

    const results = await slidingWindow.forceFlush();
    expect(results).toHaveLength(1);

    const epoch2 = results[0].epochBlock;
    expect(epoch2.epochNumber).toBe(2);
    expect(epoch2.startSequence).toBe(6);
    expect(epoch2.endSequence).toBe(8);

    const epoch1 = await epochBlockRepo.findByEpochNumber(1);
    expect(epoch2.previousEpochRoot).toBe(epoch1?.merkleRoot);
  });

  it('3. PostgreSQL WORM Defense: Cấm mọi hành vi UPDATE hoặc DELETE trên bảng audit_logs', async () => {
    // Kẻ tấn công cố tình sửa số tiền của log sequence = 1
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "audit_logs" SET "action" = 'FRAUD_ACTION' WHERE "sequence" = 1;`
      )
    ).rejects.toThrow();

    // Kẻ tấn công cố tình xóa log sequence = 2
    await expect(
      prisma.$executeRawUnsafe(
        `DELETE FROM "audit_logs" WHERE "sequence" = 2;`
      )
    ).rejects.toThrow();

    // Dữ liệu trong database vẫn còn nguyên vẹn 100%
    const log1 = await auditLogRepo.findBySequence(1);
    expect(log1).not.toBeNull();
    expect(log1?.action).toBe(AuditAction.WALLET_TRANSFER);
  });
});
