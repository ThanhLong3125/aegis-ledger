import { IAuditEvent, AuditAction } from '@aegis/contracts';
import { SlidingWindowService } from '../src/buffer/sliding-window.service';
import { LedgerConfigService } from '../src/config/ledger-config.service';
import { EpochEngineService, IProcessEpochResult } from '../src/engine/epoch-engine.service';

describe('SlidingWindowService - Dual-Trigger & Concurrency Lock', () => {
  let service: SlidingWindowService;
  let mockConfig: Partial<LedgerConfigService>;
  let mockEngine: { processBatch: jest.Mock<Promise<IProcessEpochResult>, [IAuditEvent[]]> };

  const createMockEvent = (id: string): IAuditEvent => ({
    eventId: id,
    streamKey: 'wal_test_1',
    timestamp: new Date().toISOString(),
    actor: {
      userId: 'usr_test',
      role: 'USER',
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
    },
    action: AuditAction.WALLET_DEPOSIT,
    resource: { type: 'WALLET', id: 'wal_test_1' },
    payload: { amount: 100 },
  });

  beforeEach(() => {
    jest.useFakeTimers();

    mockConfig = {
      epochMaxBatchSize: 5,
      epochMaxWaitMs: 2000,
    };

    mockEngine = {
      processBatch: jest.fn().mockImplementation(async (events: IAuditEvent[]) => ({
        epochBlock: {
          epochNumber: 1,
          startSequence: 1,
          endSequence: events.length,
          totalLogs: events.length,
          merkleRoot: 'mock_root',
          previousEpochRoot: 'mock_prev',
          signature: 'mock_sig',
          signerPublicKey: 'mock_pub',
          anchored: false,
          createdAt: new Date().toISOString(),
        },
        logs: [],
      })),
    };

    service = new SlidingWindowService(
      mockConfig as LedgerConfigService,
      mockEngine as unknown as EpochEngineService
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('1. Threshold Trigger: Tự động kích hoạt flush khi gom đủ batch size (5 logs)', async () => {
    // Đẩy 4 logs -> chưa đủ batch size
    for (let i = 1; i <= 4; i++) {
      await service.push(createMockEvent(`evt-${i}`));
    }
    expect(service.getPendingCount()).toBe(4);
    expect(mockEngine.processBatch).not.toHaveBeenCalled();

    // Đẩy thêm log thứ 5 -> chạm ngưỡng 5
    await service.push(createMockEvent('evt-5'));

    // Chờ microtasks hoàn thành
    await Promise.resolve();

    expect(mockEngine.processBatch).toHaveBeenCalledTimes(1);
    const passedBatch = mockEngine.processBatch.mock.calls[0][0];
    expect(passedBatch).toHaveLength(5);
    expect(passedBatch[0].eventId).toBe('evt-1');
    expect(passedBatch[4].eventId).toBe('evt-5');
    expect(service.getPendingCount()).toBe(0);
  });

  it('2. Timeout Trigger: Tự động kích hoạt flush sau 2 giây khi không đủ batch size', async () => {
    // Đẩy 2 logs
    await service.push(createMockEvent('evt-1'));
    await service.push(createMockEvent('evt-2'));

    expect(service.getPendingCount()).toBe(2);
    expect(mockEngine.processBatch).not.toHaveBeenCalled();

    // Tua nhanh 1999ms -> chưa nổ
    jest.advanceTimersByTime(1999);
    expect(mockEngine.processBatch).not.toHaveBeenCalled();

    // Tua thêm 1ms -> đủ 2000ms
    jest.advanceTimersByTime(1);
    await Promise.resolve();

    expect(mockEngine.processBatch).toHaveBeenCalledTimes(1);
    const passedBatch = mockEngine.processBatch.mock.calls[0][0];
    expect(passedBatch).toHaveLength(2);
    expect(service.getPendingCount()).toBe(0);
  });

  it('3. Force Flush: Xả sạch toàn bộ log tồn đọng không cần chờ timer', async () => {
    await service.push(createMockEvent('evt-1'));
    await service.push(createMockEvent('evt-2'));
    await service.push(createMockEvent('evt-3'));

    expect(service.getPendingCount()).toBe(3);

    const results = await service.forceFlush();

    expect(results).toHaveLength(1);
    expect(mockEngine.processBatch).toHaveBeenCalledTimes(1);
    expect(service.getPendingCount()).toBe(0);
  });

  it('4. Multi-batch Drain: Khi số lượng log vượt quá batch size thì xử lý tuần tự qua setImmediate', async () => {
    // Đẩy 7 logs (batch size = 5)
    for (let i = 1; i <= 7; i++) {
      await service.push(createMockEvent(`evt-${i}`));
    }

    // Flush batch 1 (5 logs)
    await Promise.resolve();
    expect(mockEngine.processBatch).toHaveBeenCalledTimes(1);
    expect(service.getPendingCount()).toBe(2);

    // Xả 2 log còn lại bằng forceFlush
    await service.forceFlush();
    expect(mockEngine.processBatch).toHaveBeenCalledTimes(2);
    expect(service.getPendingCount()).toBe(0);
  });
});
