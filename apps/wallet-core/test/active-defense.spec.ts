import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus, ExecutionContext } from '@nestjs/common';
import { ActiveDefenseGuard } from '../src/defense/active-defense.guard';
import { RedisDefenseService } from '../src/defense/redis-defense.service';
import { WalletConfigService } from '../src/config/wallet-config.service';

describe('ActiveDefenseGuard & RedisDefenseService', () => {
  let guard: ActiveDefenseGuard;
  let redisDefenseService: jest.Mocked<RedisDefenseService>;

  beforeEach(async () => {
    const mockRedisDefense = {
      isLockWithdrawalsActive: jest.fn(),
      setLockWithdrawals: jest.fn(),
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActiveDefenseGuard,
        {
          provide: RedisDefenseService,
          useValue: mockRedisDefense,
        },
      ],
    }).compile();

    guard = module.get<ActiveDefenseGuard>(ActiveDefenseGuard);
    redisDefenseService = module.get(RedisDefenseService);
  });

  const mockContext = {} as ExecutionContext;

  it('should allow transaction when active defense lock is NOT active', async () => {
    redisDefenseService.isLockWithdrawalsActive.mockResolvedValue(false);

    const canActivate = await guard.canActivate(mockContext);
    expect(canActivate).toBe(true);
    expect(redisDefenseService.isLockWithdrawalsActive).toHaveBeenCalledTimes(1);
  });

  it('should throw HttpException 423 (Locked) when active defense lock IS active', async () => {
    redisDefenseService.isLockWithdrawalsActive.mockResolvedValue(true);

    await expect(guard.canActivate(mockContext)).rejects.toThrow(HttpException);

    try {
      await guard.canActivate(mockContext);
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.LOCKED);
      expect(err.getResponse()).toMatchObject({
        statusCode: 423,
        error: 'Locked',
      });
    }
  });
});

describe('RedisDefenseService with Mock Redis Client', () => {
  let service: RedisDefenseService;
  let mockConfigService: jest.Mocked<WalletConfigService>;

  beforeEach(() => {
    mockConfigService = {
      redisHost: '127.0.0.1',
      redisPort: 6379,
      redisPassword: '',
      activeDefenseLockKey: 'AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS',
    } as any;

    service = new RedisDefenseService(mockConfigService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should return false if redisClient is not connected', async () => {
    const isLocked = await service.isLockWithdrawalsActive();
    expect(isLocked).toBe(false);
  });

  it('should correctly query redis key when connected', async () => {
    const mockGet = jest.fn().mockResolvedValue('true');
    const mockSet = jest.fn().mockResolvedValue('OK');
    const mockDel = jest.fn().mockResolvedValue(1);

    (service as any).redisClient = {
      get: mockGet,
      set: mockSet,
      del: mockDel,
      quit: jest.fn().mockResolvedValue('OK'),
    };
    (service as any).isConnected = true;

    // Check active
    const isLocked = await service.isLockWithdrawalsActive();
    expect(isLocked).toBe(true);
    expect(mockGet).toHaveBeenCalledWith('AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS');

    // Set locked to false (del)
    await service.setLockWithdrawals(false);
    expect(mockDel).toHaveBeenCalledWith('AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS');

    // Set locked to true (set)
    await service.setLockWithdrawals(true);
    expect(mockSet).toHaveBeenCalledWith('AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS', 'true');
  });
});
