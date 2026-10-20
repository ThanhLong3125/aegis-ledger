import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@aegis/contracts';
import { KafkaProducerService } from '@aegis/event-bus';
import { WalletsService } from '../src/wallets/wallets.service';
import { WalletStore } from '../src/wallets/store/wallet.store';
import { WalletConfigService } from '../src/config/wallet-config.service';
import { IClientInfo } from '../src/common/client-info.decorator';

describe('WalletsService - Financial Operations & Audit Trail', () => {
  let walletsService: WalletsService;
  let store: WalletStore;
  let mockKafkaProducer: { publishAuditEvent: jest.Mock };
  let mockConfig: Partial<WalletConfigService>;

  const clientInfo: IClientInfo = {
    ipAddress: '10.0.0.1',
    userAgent: 'AegisWalletApp/2.0',
    deviceId: 'dev_laptop_macbook',
  };

  beforeEach(() => {
    store = new WalletStore();
    mockKafkaProducer = {
      publishAuditEvent: jest.fn().mockResolvedValue([]),
    };
    mockConfig = {
      kafkaTopic: 'aegis.audit.events',
    };

    walletsService = new WalletsService(
      store,
      mockKafkaProducer as unknown as KafkaProducerService,
      mockConfig as WalletConfigService
    );
  });

  it('1. Tạo ví mới thành công với số dư ban đầu bằng 0', async () => {
    const wallet = await walletsService.createWallet(
      { userId: 'usr_charlie', currency: 'USD' },
      clientInfo
    );

    expect(wallet.id).toBeDefined();
    expect(wallet.userId).toBe('usr_charlie');
    expect(wallet.balance).toBe(0);
    expect(wallet.currency).toBe('USD');
  });

  it('2. Nạp tiền (Deposit): Tăng số dư và bắn sự kiện WALLET_DEPOSIT sang Kafka', async () => {
    const { wallet, txId } = await walletsService.deposit(
      { walletId: 'wal_alice_usd', amount: 500 },
      clientInfo
    );

    expect(wallet.balance).toBe(1500); // 1000 ban đầu + 500
    expect(txId).toBeDefined();

    expect(mockKafkaProducer.publishAuditEvent).toHaveBeenCalledTimes(1);
    const event = mockKafkaProducer.publishAuditEvent.mock.calls[0][0];

    expect(event.action).toBe(AuditAction.WALLET_DEPOSIT);
    expect(event.streamKey).toBe('wal_alice_usd');
    expect(event.payload.amount).toBe(500);
    expect(event.payload.balanceBefore).toBe(1000);
    expect(event.payload.balanceAfter).toBe(1500);
  });

  it('3. Rút tiền (Withdraw): Giảm số dư và bắn sự kiện WALLET_WITHDRAW sang Kafka', async () => {
    const { wallet } = await walletsService.withdraw(
      { walletId: 'wal_alice_usd', amount: 300 },
      clientInfo
    );

    expect(wallet.balance).toBe(700); // 1000 ban đầu - 300

    expect(mockKafkaProducer.publishAuditEvent).toHaveBeenCalledTimes(1);
    const event = mockKafkaProducer.publishAuditEvent.mock.calls[0][0];

    expect(event.action).toBe(AuditAction.WALLET_WITHDRAW);
    expect(event.payload.balanceBefore).toBe(1000);
    expect(event.payload.balanceAfter).toBe(700);
  });

  it('4. Rút tiền vượt quá số dư: Bị từ chối BadRequestException và không thay đổi số dư', async () => {
    await expect(
      walletsService.withdraw(
        { walletId: 'wal_bob_usd', amount: 500 }, // Bob chỉ có 200
        clientInfo
      )
    ).rejects.toThrow(BadRequestException);

    expect(mockKafkaProducer.publishAuditEvent).not.toHaveBeenCalled();
    const bobWallet = walletsService.getWallet('wal_bob_usd');
    expect(bobWallet.balance).toBe(200);
  });

  it('5. Chuyển tiền (Transfer): Trừ tiền ví gửi, cộng tiền ví nhận và bắn sự kiện Double-Entry', async () => {
    const result = await walletsService.transfer(
      {
        fromWalletId: 'wal_alice_usd',
        toWalletId: 'wal_bob_usd',
        amount: 250,
      },
      clientInfo
    );

    expect(result.fromWallet.balance).toBe(750); // 1000 - 250
    expect(result.toWallet.balance).toBe(450);   // 200 + 250

    expect(mockKafkaProducer.publishAuditEvent).toHaveBeenCalledTimes(1);
    const event = mockKafkaProducer.publishAuditEvent.mock.calls[0][0];

    expect(event.action).toBe(AuditAction.WALLET_TRANSFER);
    expect(event.streamKey).toBe('wal_alice_usd');
    expect(event.payload.fromBalanceBefore).toBe(1000);
    expect(event.payload.fromBalanceAfter).toBe(750);
    expect(event.payload.toBalanceBefore).toBe(200);
    expect(event.payload.toBalanceAfter).toBe(450);
  });

  it('6. Chuyển tiền cho chính mình: Bị từ chối BadRequestException', async () => {
    await expect(
      walletsService.transfer(
        {
          fromWalletId: 'wal_alice_usd',
          toWalletId: 'wal_alice_usd',
          amount: 50,
        },
        clientInfo
      )
    ).rejects.toThrow(BadRequestException);
  });
});
