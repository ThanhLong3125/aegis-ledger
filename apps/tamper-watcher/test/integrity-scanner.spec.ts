import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@aegis/database';
import { BreachType } from '@aegis/contracts';
import {
  generateEd25519KeyPair,
  exportPublicKeyRawHex,
  signEpochRoot,
} from '@aegis/crypto-core';
import { IntegrityScannerService } from '../src/scanner/integrity-scanner.service';
import { AlertDispatcherService } from '../src/alert/alert-dispatcher.service';
import { WatcherConfigService } from '../src/config/watcher-config.service';

describe('IntegrityScannerService', () => {
  let scanner: IntegrityScannerService;
  let mockPrisma: any;
  let mockAlertDispatcher: any;

  const keyPair = generateEd25519KeyPair();
  const publicKeyRawHex = exportPublicKeyRawHex(keyPair.publicKey);

  beforeEach(async () => {
    mockPrisma = {
      auditLog: {
        findMany: jest.fn(),
      },
      epochBlock: {
        findMany: jest.fn(),
      },
    };

    mockAlertDispatcher = {
      dispatchBreachAlert: jest.fn().mockResolvedValue({ latencyMs: 10, lockdownSuccess: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrityScannerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AlertDispatcherService, useValue: mockAlertDispatcher },
        {
          provide: WatcherConfigService,
          useValue: { scanIntervalMs: 60000 },
        },
      ],
    }).compile();

    scanner = module.get<IntegrityScannerService>(IntegrityScannerService);
  });

  afterEach(() => {
    scanner.onModuleDestroy();
  });

  it('should find 0 breaches on clean sequence and valid cryptographic chain', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { id: '1', sequence: 1n, leafHash: 'hash1' },
      { id: '2', sequence: 2n, leafHash: 'hash2' },
      { id: '3', sequence: 3n, leafHash: 'hash3' },
    ]);

    const root0 = '0'.repeat(64);
    const root1 = 'a'.repeat(64);
    const sig1 = signEpochRoot(1, root1, root0, keyPair.privateKey);

    mockPrisma.epochBlock.findMany.mockResolvedValue([
      {
        epochNumber: 1n,
        merkleRoot: root1,
        previousEpochRoot: root0,
        signature: sig1,
        signerPublicKey: publicKeyRawHex,
      },
    ]);

    const result = await scanner.runFullScan();
    expect(result.breachesFound).toBe(0);
    expect(result.checkedLogs).toBe(3);
    expect(result.checkedEpochs).toBe(1);
    expect(mockAlertDispatcher.dispatchBreachAlert).not.toHaveBeenCalled();
  });

  it('should detect SEQUENCE_GAP when an audit log is missing', async () => {
    // Sequence jumps from 1 to 3 (log #2 is missing!)
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { id: '1', sequence: 1n, leafHash: 'hash1' },
      { id: '3', sequence: 3n, leafHash: 'hash3' },
    ]);
    mockPrisma.epochBlock.findMany.mockResolvedValue([]);

    const result = await scanner.runFullScan();
    expect(result.breachesFound).toBe(1);
    expect(mockAlertDispatcher.dispatchBreachAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        breachType: BreachType.SEQUENCE_GAP,
        targetTable: 'audit_logs',
        affectedId: '2',
      })
    );
  });

  it('should detect HISTORICAL_REWRITE when Hash Chain is broken between Epochs', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);

    const root0 = '0'.repeat(64);
    const root1 = 'a'.repeat(64);
    const sig1 = signEpochRoot(1, root1, root0, keyPair.privateKey);

    const root2 = 'b'.repeat(64);
    // Tampered: previousEpochRoot of Epoch 2 does NOT match root1 of Epoch 1!
    const tamperedPrevRoot = 'c'.repeat(64);
    const sig2 = signEpochRoot(2, root2, tamperedPrevRoot, keyPair.privateKey);

    mockPrisma.epochBlock.findMany.mockResolvedValue([
      {
        epochNumber: 1n,
        merkleRoot: root1,
        previousEpochRoot: root0,
        signature: sig1,
        signerPublicKey: publicKeyRawHex,
      },
      {
        epochNumber: 2n,
        merkleRoot: root2,
        previousEpochRoot: tamperedPrevRoot,
        signature: sig2,
        signerPublicKey: publicKeyRawHex,
      },
    ]);

    const result = await scanner.runFullScan();
    expect(result.breachesFound).toBeGreaterThanOrEqual(1);
    expect(mockAlertDispatcher.dispatchBreachAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        breachType: BreachType.HISTORICAL_REWRITE,
        targetTable: 'epoch_blocks',
        affectedId: 2,
      })
    );
  });

  it('should detect SIGNATURE_FORGERY when an Ed25519 signature is tampered', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);

    const root0 = '0'.repeat(64);
    const root1 = 'a'.repeat(64);
    const forgedSignature = 'f'.repeat(128); // Fake 64-byte hex signature

    mockPrisma.epochBlock.findMany.mockResolvedValue([
      {
        epochNumber: 1n,
        merkleRoot: root1,
        previousEpochRoot: root0,
        signature: forgedSignature,
        signerPublicKey: publicKeyRawHex,
      },
    ]);

    const result = await scanner.runFullScan();
    expect(result.breachesFound).toBe(1);
    expect(mockAlertDispatcher.dispatchBreachAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        breachType: BreachType.SIGNATURE_FORGERY,
        targetTable: 'epoch_blocks',
        affectedId: 1,
      })
    );
  });
});
