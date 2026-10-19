import { IAuditEvent, AuditAction, IEpochBlock, IAuditLogLeaf } from '@aegis/contracts';
import { hashLeaf, MerkleTree, verifyEpochSignature } from '@aegis/crypto-core';
import { EpochEngineService } from '../src/engine/epoch-engine.service';
import { SequenceTrackerService } from '../src/engine/sequence-tracker.service';
import { ValidatorKeyProvider } from '../src/keys/validator-key.provider';
import { EpochPersistenceService, GENESIS_EPOCH_ROOT } from '../src/outbound/persistence/epoch-persistence.service';
import { EpochBroadcasterService, IEpochFormedEvent } from '../src/outbound/broadcaster/epoch-broadcaster.service';
import { LedgerConfigService } from '../src/config/ledger-config.service';

describe('EpochEngineService - Cryptographic Merkle Tree, Signing & Hash-Chain', () => {
  let engine: EpochEngineService;
  let sequenceTracker: SequenceTrackerService;
  let validatorKeyProvider: ValidatorKeyProvider;
  let broadcaster: EpochBroadcasterService;
  let mockPersistence: Partial<EpochPersistenceService>;
  let committedBatches: Array<{ epochBlock: IEpochBlock; logs: IAuditLogLeaf[] }> = [];

  const createMockEvent = (id: string, amount: number): IAuditEvent => ({
    eventId: id,
    streamKey: 'wal_alice_1',
    timestamp: '2026-10-18T12:00:00.000Z',
    actor: {
      userId: 'usr_alice',
      role: 'USER',
      ipAddress: '192.168.1.100',
      userAgent: 'AegisApp/1.0',
    },
    action: AuditAction.WALLET_TRANSFER,
    resource: { type: 'WALLET', id: 'wal_alice_1' },
    payload: { amount, currency: 'USD', toWallet: 'wal_bob_2' },
  });

  beforeEach(async () => {
    committedBatches = [];

    const mockConfig = {
      validatorPrivateKey: undefined,
      validatorPublicKey: undefined,
    } as unknown as LedgerConfigService;

    validatorKeyProvider = new ValidatorKeyProvider(mockConfig);
    validatorKeyProvider.onModuleInit();

    broadcaster = new EpochBroadcasterService();

    mockPersistence = {
      getLatestState: jest.fn().mockResolvedValue({
        latestEpochNumber: 0,
        latestSequence: 0,
        latestMerkleRoot: GENESIS_EPOCH_ROOT,
      }),
      commitEpoch: jest.fn().mockImplementation(async (params) => {
        committedBatches.push(params);
        return {
          epochNumber: params.epochBlock.epochNumber,
          totalLogs: params.logs.length,
          startSequence: params.epochBlock.startSequence,
          endSequence: params.epochBlock.endSequence,
          merkleRoot: params.epochBlock.merkleRoot,
        };
      }),
    };

    sequenceTracker = new SequenceTrackerService(mockPersistence as EpochPersistenceService);
    await sequenceTracker.initialize();

    engine = new EpochEngineService(
      sequenceTracker,
      validatorKeyProvider,
      mockPersistence as EpochPersistenceService,
      broadcaster
    );
  });

  it('1. Đóng dấu Epoch #1: Tính leafHash, dựng Merkle Tree và ký số Ed25519', async () => {
    const events: IAuditEvent[] = [
      createMockEvent('evt-1', 100),
      createMockEvent('evt-2', 250),
      createMockEvent('evt-3', 500),
    ];

    let broadcastedEvent: IEpochFormedEvent | null = null;
    broadcaster.onEpochFormed$.subscribe((e) => {
      broadcastedEvent = e;
    });

    const result = await engine.processBatch(events);
    const { epochBlock, logs } = result;

    // Kiểm tra Epoch Block
    expect(epochBlock.epochNumber).toBe(1);
    expect(epochBlock.startSequence).toBe(1);
    expect(epochBlock.endSequence).toBe(3);
    expect(epochBlock.totalLogs).toBe(3);
    expect(epochBlock.previousEpochRoot).toBe(GENESIS_EPOCH_ROOT);

    // Kiểm tra tính toán Merkle Root độc lập
    const expectedLeaves = logs.map((log) => log.leafHash);
    const expectedTree = new MerkleTree(expectedLeaves);
    expect(epochBlock.merkleRoot).toBe(expectedTree.getRoot());

    // Xác minh chữ ký số Ed25519
    const isValidSignature = verifyEpochSignature(
      epochBlock.epochNumber,
      epochBlock.merkleRoot,
      epochBlock.previousEpochRoot,
      epochBlock.signature,
      epochBlock.signerPublicKey
    );
    expect(isValidSignature).toBe(true);

    // Kiểm tra logs
    expect(logs).toHaveLength(3);
    expect(logs[0].sequence).toBe(1);
    expect(logs[1].sequence).toBe(2);
    expect(logs[2].sequence).toBe(3);

    // Kiểm tra tính toán leafHash có chứa domain separation
    const expectedHash0 = hashLeaf({
      id: logs[0].id,
      sequence: logs[0].sequence,
      epochNumber: logs[0].epochNumber,
      timestamp: logs[0].timestamp,
      actor: logs[0].actor,
      action: logs[0].action,
      resource: logs[0].resource,
      payload: logs[0].payload,
    });
    expect(logs[0].leafHash).toBe(expectedHash0);

    // Kiểm tra Broadcast
    expect(broadcastedEvent).not.toBeNull();
    expect((broadcastedEvent as any)?.epochBlock.epochNumber).toBe(1);

    // Kiểm tra đã gọi persistence
    expect(mockPersistence.commitEpoch).toHaveBeenCalledTimes(1);
  });

  it('2. Hash-Chain Continuity: Epoch #2 xâu chuỗi với previousEpochRoot của Epoch #1', async () => {
    // Chốt Epoch 1
    const batch1 = [createMockEvent('evt-1', 100), createMockEvent('evt-2', 200)];
    const result1 = await engine.processBatch(batch1);

    // Chốt Epoch 2
    const batch2 = [createMockEvent('evt-3', 300), createMockEvent('evt-4', 400)];
    const result2 = await engine.processBatch(batch2);

    expect(result2.epochBlock.epochNumber).toBe(2);
    expect(result2.epochBlock.startSequence).toBe(3);
    expect(result2.epochBlock.endSequence).toBe(4);
    // Chuỗi liên kết hash-chain
    expect(result2.epochBlock.previousEpochRoot).toBe(result1.epochBlock.merkleRoot);

    // Chữ ký Epoch 2 hợp lệ
    const isValidSig2 = verifyEpochSignature(
      result2.epochBlock.epochNumber,
      result2.epochBlock.merkleRoot,
      result2.epochBlock.previousEpochRoot,
      result2.epochBlock.signature,
      result2.epochBlock.signerPublicKey
    );
    expect(isValidSig2).toBe(true);
  });
});
