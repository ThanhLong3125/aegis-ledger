import { ActiveDefenseService } from '../src/defense/active-defense.service';
import { WatcherConfigService } from '../src/config/watcher-config.service';

describe('ActiveDefenseService', () => {
  let service: ActiveDefenseService;
  let mockConfigService: jest.Mocked<WatcherConfigService>;

  beforeEach(() => {
    mockConfigService = {
      redisHost: '127.0.0.1',
      redisPort: 6379,
      redisPassword: '',
      activeDefenseLockKey: 'AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS',
    } as any;

    service = new ActiveDefenseService(mockConfigService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should return false if redisClient is not connected', async () => {
    const isLocked = await service.isLockdownActive();
    expect(isLocked).toBe(false);
  });

  it('should trigger lockdown and measure latency < 200ms', async () => {
    const mockSet = jest.fn().mockResolvedValue('OK');
    (service as any).redisClient = {
      set: mockSet,
      get: jest.fn(),
      del: jest.fn(),
      quit: jest.fn().mockResolvedValue('OK'),
    };
    (service as any).isConnected = true;

    const result = await service.triggerLockdown('Breach detected on audit_logs');
    expect(result.success).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.latencyMs).toBeLessThan(200); // SLA check
    expect(mockSet).toHaveBeenCalledWith('AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS', 'true');
  });

  it('should release lockdown properly', async () => {
    const mockDel = jest.fn().mockResolvedValue(1);
    (service as any).redisClient = {
      del: mockDel,
      quit: jest.fn().mockResolvedValue('OK'),
    };
    (service as any).isConnected = true;

    await service.releaseLockdown();
    expect(mockDel).toHaveBeenCalledWith('AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS');
  });

  it('should check if lockdown is active', async () => {
    const mockGet = jest.fn().mockResolvedValue('true');
    (service as any).redisClient = {
      get: mockGet,
      quit: jest.fn().mockResolvedValue('OK'),
    };
    (service as any).isConnected = true;

    const isActive = await service.isLockdownActive();
    expect(isActive).toBe(true);
    expect(mockGet).toHaveBeenCalledWith('AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS');
  });
});
