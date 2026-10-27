import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { KafkaProducerService } from '@aegis/event-bus';
import { RedisDefenseService } from '../src/defense/redis-defense.service';

describe('WalletCore E2E Integration Tests', () => {
  let app: NestFastifyApplication;
  let mockKafkaProducer: { publishAuditEvent: jest.Mock };
  let mockRedisDefense: {
    isLockWithdrawalsActive: jest.Mock;
    setLockWithdrawals: jest.Mock;
    onModuleInit: jest.Mock;
    onModuleDestroy: jest.Mock;
  };

  beforeAll(async () => {
    mockKafkaProducer = {
      publishAuditEvent: jest.fn().mockResolvedValue(undefined),
    };

    mockRedisDefense = {
      isLockWithdrawalsActive: jest.fn().mockResolvedValue(false),
      setLockWithdrawals: jest.fn(),
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(KafkaProducerService)
      .useValue(mockKafkaProducer)
      .overrideProvider(RedisDefenseService)
      .useValue(mockRedisDefense)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter()
    );
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      })
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisDefense.isLockWithdrawalsActive.mockResolvedValue(false);
  });

  describe('Auth Endpoints (/auth)', () => {
    it('POST /auth/login should return 200 and auth token on valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-device-id', 'test-device-uuid')
        .send({
          username: 'alice',
          password: 'password123',
        })
        .expect(200);

      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toMatchObject({
        userId: 'usr_alice',
        username: 'alice',
      });

      expect(mockKafkaProducer.publishAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_LOGIN_SUCCESS',
          actor: expect.objectContaining({
            userId: 'usr_alice',
          }),
        })
      );
    });

    it('POST /auth/login should return 401 on invalid credentials and emit USER_LOGIN_FAILED', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: 'alice',
          password: 'wrongpassword',
        })
        .expect(401);

      expect(mockKafkaProducer.publishAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_LOGIN_FAILED',
        })
      );
    });

    it('POST /auth/logout should return 200 and emit USER_LOGOUT', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .send({
          userId: 'usr_alice',
        })
        .expect(200);

      expect(res.body).toHaveProperty('message');
      expect(mockKafkaProducer.publishAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_LOGOUT',
          actor: expect.objectContaining({
            userId: 'usr_alice',
          }),
        })
      );
    });
  });

  describe('Wallets Endpoints (/wallets)', () => {
    it('GET /wallets/:id should return seeded wallet', async () => {
      const res = await request(app.getHttpServer())
        .get('/wallets/wal_alice_usd')
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'wal_alice_usd',
        userId: 'usr_alice',
        currency: 'USD',
      });
    });

    it('POST /wallets should create a new wallet', async () => {
      const res = await request(app.getHttpServer())
        .post('/wallets')
        .send({
          userId: 'usr_charlie',
          currency: 'USD',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        userId: 'usr_charlie',
        balance: 0,
        currency: 'USD',
      });
    });

    it('POST /wallets/deposit should increase balance and emit WALLET_DEPOSIT', async () => {
      const res = await request(app.getHttpServer())
        .post('/wallets/deposit')
        .send({
          walletId: 'wal_alice_usd',
          amount: 200,
        })
        .expect(200);

      expect(res.body).toHaveProperty('txId');
      expect(res.body.wallet.balance).toBeGreaterThanOrEqual(1200);
      expect(mockKafkaProducer.publishAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WALLET_DEPOSIT',
          resource: expect.objectContaining({
            id: 'wal_alice_usd',
          }),
        })
      );
    });

    it('POST /wallets/withdraw should decrease balance and emit WALLET_WITHDRAW', async () => {
      const res = await request(app.getHttpServer())
        .post('/wallets/withdraw')
        .send({
          walletId: 'wal_alice_usd',
          amount: 100,
        })
        .expect(200);

      expect(res.body).toHaveProperty('txId');
      expect(res.body.wallet).toHaveProperty('balance');
      expect(mockKafkaProducer.publishAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WALLET_WITHDRAW',
          resource: expect.objectContaining({
            id: 'wal_alice_usd',
          }),
        })
      );
    });

    it('POST /wallets/transfer should transfer funds between wallets and emit WALLET_TRANSFER', async () => {
      const res = await request(app.getHttpServer())
        .post('/wallets/transfer')
        .send({
          fromWalletId: 'wal_alice_usd',
          toWalletId: 'wal_bob_usd',
          amount: 50,
        })
        .expect(200);

      expect(res.body.fromWallet.id).toBe('wal_alice_usd');
      expect(res.body.toWallet.id).toBe('wal_bob_usd');
      expect(mockKafkaProducer.publishAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WALLET_TRANSFER',
        })
      );
    });

    it('GET /wallets/:id/history should return audit history list', async () => {
      const res = await request(app.getHttpServer())
        .get('/wallets/wal_alice_usd/history')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe('Active Defense Lockdown Behavior (Tamper Alert Mitigation)', () => {
    it('should block POST /wallets/withdraw with 423 LOCKED when active defense is triggered', async () => {
      mockRedisDefense.isLockWithdrawalsActive.mockResolvedValue(true);

      const res = await request(app.getHttpServer())
        .post('/wallets/withdraw')
        .send({
          walletId: 'wal_alice_usd',
          amount: 100,
        })
        .expect(423);

      expect(res.body).toMatchObject({
        statusCode: 423,
        error: 'Locked',
      });
      expect(res.body.message).toContain('Emergency Lockdown');
      expect(mockKafkaProducer.publishAuditEvent).not.toHaveBeenCalled();
    });

    it('should block POST /wallets/transfer with 423 LOCKED when active defense is triggered', async () => {
      mockRedisDefense.isLockWithdrawalsActive.mockResolvedValue(true);

      const res = await request(app.getHttpServer())
        .post('/wallets/transfer')
        .send({
          fromWalletId: 'wal_alice_usd',
          toWalletId: 'wal_bob_usd',
          amount: 50,
        })
        .expect(423);

      expect(res.body).toMatchObject({
        statusCode: 423,
        error: 'Locked',
      });
      expect(mockKafkaProducer.publishAuditEvent).not.toHaveBeenCalled();
    });

    it('should still allow POST /wallets/deposit even when active defense lock is on', async () => {
      mockRedisDefense.isLockWithdrawalsActive.mockResolvedValue(true);

      const res = await request(app.getHttpServer())
        .post('/wallets/deposit')
        .send({
          walletId: 'wal_alice_usd',
          amount: 50,
        })
        .expect(200);

      expect(res.body).toHaveProperty('txId');
      expect(res.body.wallet).toHaveProperty('balance');
      expect(mockKafkaProducer.publishAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WALLET_DEPOSIT',
        })
      );
    });
  });
});
