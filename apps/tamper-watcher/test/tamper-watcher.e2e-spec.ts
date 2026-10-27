import { Test, TestingModule } from '@nestjs/testing';
import { BreachType, AlertSeverity } from '@aegis/contracts';
import { KafkaProducerService } from '@aegis/event-bus';
import { ActiveDefenseService } from '../src/defense/active-defense.service';
import { TelegramService } from '../src/alert/telegram.service';
import { AlertDispatcherService } from '../src/alert/alert-dispatcher.service';
import { CdcListenerService } from '../src/cdc/cdc-listener.service';
import { WatcherConfigService } from '../src/config/watcher-config.service';

describe('TamperWatcher E2E & Active Defense Integration', () => {
  let cdcListener: CdcListenerService;
  let alertDispatcher: AlertDispatcherService;
  let mockActiveDefense: jest.Mocked<ActiveDefenseService>;
  let mockTelegramService: jest.Mocked<TelegramService>;
  let mockKafkaProducer: { publishTamperAlert: jest.Mock };

  beforeEach(async () => {
    mockActiveDefense = {
      triggerLockdown: jest.fn().mockResolvedValue({ latencyMs: 5.2, success: true }),
      releaseLockdown: jest.fn().mockResolvedValue(undefined),
      isLockdownActive: jest.fn().mockResolvedValue(true),
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
    } as any;

    mockTelegramService = {
      sendTamperAlert: jest.fn().mockResolvedValue({ sent: false, simulated: true }),
    } as any;

    mockKafkaProducer = {
      publishTamperAlert: jest.fn().mockResolvedValue(undefined),
    };

    const mockConfig: Partial<WatcherConfigService> = {
      postgresHost: 'localhost',
      postgresPort: 5432,
      postgresUser: 'aegis_admin',
      postgresPassword: 'password',
      postgresDb: 'aegis_ledger_db',
      replicationSlotName: 'test_slot',
      cdcPollIntervalMs: 100,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertDispatcherService,
        CdcListenerService,
        { provide: ActiveDefenseService, useValue: mockActiveDefense },
        { provide: TelegramService, useValue: mockTelegramService },
        { provide: KafkaProducerService, useValue: mockKafkaProducer },
        { provide: WatcherConfigService, useValue: mockConfig },
      ],
    }).compile();

    cdcListener = module.get<CdcListenerService>(CdcListenerService);
    alertDispatcher = module.get<AlertDispatcherService>(AlertDispatcherService);
  });

  afterEach(async () => {
    await cdcListener.stopListener();
  });

  it('should intercept SQL UPDATE on audit_logs and trigger Active Defense < 200ms', async () => {
    const walLine = `table public.audit_logs: UPDATE: id[text]:'log_hacked_001' sequence[bigint]:5 leaf_hash[text]:'tampered'`;

    await cdcListener.handleWalRecord(walLine);

    expect(mockActiveDefense.triggerLockdown).toHaveBeenCalledWith(
      expect.stringContaining('UNAUTHORIZED_UPDATE on audit_logs')
    );
    expect(mockKafkaProducer.publishTamperAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: AlertSeverity.CRITICAL,
        breachType: BreachType.UNAUTHORIZED_UPDATE,
        targetTable: 'audit_logs',
        affectedId: 'log_hacked_001',
      })
    );
    expect(mockTelegramService.sendTamperAlert).toHaveBeenCalled();
  });

  it('should intercept SQL DELETE on audit_logs and trigger Active Defense', async () => {
    const walLine = `table public.audit_logs: DELETE: id[text]:'log_deleted_002'`;

    await cdcListener.handleWalRecord(walLine);

    expect(mockActiveDefense.triggerLockdown).toHaveBeenCalledWith(
      expect.stringContaining('UNAUTHORIZED_DELETE on audit_logs')
    );
    expect(mockKafkaProducer.publishTamperAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        breachType: BreachType.UNAUTHORIZED_DELETE,
        targetTable: 'audit_logs',
        affectedId: 'log_deleted_002',
      })
    );
  });

  it('should intercept SQL UPDATE on epoch_blocks and trigger HISTORICAL_REWRITE alert', async () => {
    const walLine = `table public.epoch_blocks: UPDATE: epoch_number[bigint]:2 merkle_root[text]:'fake_root'`;

    await cdcListener.handleWalRecord(walLine);

    expect(mockActiveDefense.triggerLockdown).toHaveBeenCalled();
    expect(mockKafkaProducer.publishTamperAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        breachType: BreachType.HISTORICAL_REWRITE,
        targetTable: 'epoch_blocks',
        affectedId: '2',
      })
    );
  });

  it('should ignore non-monitored tables or normal statements', async () => {
    await cdcListener.handleWalRecord('BEGIN 9999');
    await cdcListener.handleWalRecord('COMMIT 9999');
    await cdcListener.handleWalRecord(`table public.unrelated_table: UPDATE: id[integer]:1`);

    expect(mockActiveDefense.triggerLockdown).not.toHaveBeenCalled();
    expect(mockKafkaProducer.publishTamperAlert).not.toHaveBeenCalled();
  });
});
