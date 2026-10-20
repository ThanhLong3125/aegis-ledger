import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { AuditAction, AuditEventDto } from '@aegis/contracts';
import { KafkaProducerService } from '@aegis/event-bus';
import { WalletConfigService } from '../config/wallet-config.service';
import { IClientInfo } from '../common/client-info.decorator';
import { IWallet, ITransactionRecord } from './entities/wallet.entity';
import { WalletStore } from './store/wallet.store';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { TransferDto } from './dto/transfer.dto';

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    private readonly store: WalletStore,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly configService: WalletConfigService
  ) {}

  /**
   * Tạo ví mới cho người dùng
   */
  async createWallet(dto: CreateWalletDto, clientInfo: IClientInfo): Promise<IWallet> {
    const id = `wal_${dto.userId}_${Date.now().toString(36)}`;
    const wallet: IWallet = {
      id,
      userId: dto.userId,
      balance: 0,
      currency: dto.currency || 'USD',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const created = this.store.createWallet(wallet);
    this.logger.log(`Đã tạo ví mới: [${created.id}] cho user [${dto.userId}]`);

    return created;
  }

  /**
   * Xem thông tin và số dư ví
   */
  getWallet(id: string): IWallet {
    const wallet = this.store.getWallet(id);
    if (!wallet) {
      throw new NotFoundException(`Ví [${id}] không tồn tại trên hệ thống.`);
    }
    return wallet;
  }

  /**
   * Nạp tiền vào ví
   */
  async deposit(
    dto: DepositDto,
    clientInfo: IClientInfo
  ): Promise<{ wallet: IWallet; txId: string }> {
    const wallet = this.getWallet(dto.walletId);
    const txId = `tx_dep_${crypto.randomUUID()}`;

    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + dto.amount;

    const updated = this.store.updateBalance(wallet.id, balanceAfter);

    const txRecord: ITransactionRecord = {
      id: txId,
      type: 'DEPOSIT',
      amount: dto.amount,
      currency: wallet.currency,
      toWalletId: wallet.id,
      balanceBefore,
      balanceAfter,
      timestamp: new Date(),
    };
    this.store.addTransaction(wallet.id, txRecord);

    // Bắn vết kiểm toán AuditEvent sang Kafka
    await this.emitAuditEvent({
      eventId: crypto.randomUUID(),
      streamKey: wallet.id,
      timestamp: new Date().toISOString(),
      actor: {
        userId: wallet.userId,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
      },
      action: AuditAction.WALLET_DEPOSIT,
      resource: { type: 'WALLET', id: wallet.id },
      payload: {
        txId,
        amount: dto.amount,
        currency: wallet.currency,
        balanceBefore,
        balanceAfter,
        deviceId: clientInfo.deviceId,
      },
    });

    this.logger.log(
      `[DEPOSIT] Nạp ${dto.amount} ${wallet.currency} vào ví [${wallet.id}]. Số dư: ${balanceBefore} -> ${balanceAfter}`
    );

    return { wallet: updated, txId };
  }

  /**
   * Rút tiền từ ví
   */
  async withdraw(
    dto: WithdrawDto,
    clientInfo: IClientInfo
  ): Promise<{ wallet: IWallet; txId: string }> {
    const wallet = this.getWallet(dto.walletId);

    if (wallet.balance < dto.amount) {
      throw new BadRequestException(
        `Số dư không đủ. Số dư hiện tại: ${wallet.balance} ${wallet.currency}, yêu cầu rút: ${dto.amount} ${wallet.currency}.`
      );
    }

    const txId = `tx_wdr_${crypto.randomUUID()}`;
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore - dto.amount;

    const updated = this.store.updateBalance(wallet.id, balanceAfter);

    const txRecord: ITransactionRecord = {
      id: txId,
      type: 'WITHDRAW',
      amount: dto.amount,
      currency: wallet.currency,
      fromWalletId: wallet.id,
      balanceBefore,
      balanceAfter,
      timestamp: new Date(),
    };
    this.store.addTransaction(wallet.id, txRecord);

    // Bắn vết kiểm toán AuditEvent sang Kafka
    await this.emitAuditEvent({
      eventId: crypto.randomUUID(),
      streamKey: wallet.id,
      timestamp: new Date().toISOString(),
      actor: {
        userId: wallet.userId,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
      },
      action: AuditAction.WALLET_WITHDRAW,
      resource: { type: 'WALLET', id: wallet.id },
      payload: {
        txId,
        amount: dto.amount,
        currency: wallet.currency,
        balanceBefore,
        balanceAfter,
        deviceId: clientInfo.deviceId,
      },
    });

    this.logger.log(
      `[WITHDRAW] Rút ${dto.amount} ${wallet.currency} từ ví [${wallet.id}]. Số dư: ${balanceBefore} -> ${balanceAfter}`
    );

    return { wallet: updated, txId };
  }

  /**
   * Chuyển tiền giữa 2 ví
   */
  async transfer(
    dto: TransferDto,
    clientInfo: IClientInfo
  ): Promise<{ txId: string; fromWallet: IWallet; toWallet: IWallet }> {
    if (dto.fromWalletId === dto.toWalletId) {
      throw new BadRequestException('Không thể chuyển tiền cho chính ví gửi.');
    }

    const fromWallet = this.getWallet(dto.fromWalletId);
    const toWallet = this.getWallet(dto.toWalletId);

    if (fromWallet.currency !== toWallet.currency) {
      throw new BadRequestException(
        `Không cùng loại tiền tệ: [${fromWallet.currency}] khác [${toWallet.currency}].`
      );
    }

    if (fromWallet.balance < dto.amount) {
      throw new BadRequestException(
        `Số dư không đủ để chuyển tiền. Số dư hiện tại: ${fromWallet.balance} ${fromWallet.currency}, yêu cầu: ${dto.amount} ${fromWallet.currency}.`
      );
    }

    const txId = `tx_trf_${crypto.randomUUID()}`;

    const fromBefore = fromWallet.balance;
    const fromAfter = fromBefore - dto.amount;

    const toBefore = toWallet.balance;
    const toAfter = toBefore + dto.amount;

    const updatedFrom = this.store.updateBalance(fromWallet.id, fromAfter);
    const updatedTo = this.store.updateBalance(toWallet.id, toAfter);

    const txRecord: ITransactionRecord = {
      id: txId,
      type: 'TRANSFER',
      amount: dto.amount,
      currency: fromWallet.currency,
      fromWalletId: fromWallet.id,
      toWalletId: toWallet.id,
      balanceBefore: fromBefore,
      balanceAfter: fromAfter,
      timestamp: new Date(),
    };

    this.store.addTransaction(fromWallet.id, txRecord);
    this.store.addTransaction(toWallet.id, {
      ...txRecord,
      balanceBefore: toBefore,
      balanceAfter: toAfter,
    });

    // Bắn vết kiểm toán Kế toán kép (Double-Entry Audit Event)
    await this.emitAuditEvent({
      eventId: crypto.randomUUID(),
      streamKey: fromWallet.id,
      timestamp: new Date().toISOString(),
      actor: {
        userId: fromWallet.userId,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
      },
      action: AuditAction.WALLET_TRANSFER,
      resource: { type: 'WALLET', id: fromWallet.id },
      payload: {
        txId,
        amount: dto.amount,
        currency: fromWallet.currency,
        fromWalletId: fromWallet.id,
        toWalletId: toWallet.id,
        fromBalanceBefore: fromBefore,
        fromBalanceAfter: fromAfter,
        toBalanceBefore: toBefore,
        toBalanceAfter: toAfter,
        deviceId: clientInfo.deviceId,
      },
    });

    this.logger.log(
      `[TRANSFER] Chuyển ${dto.amount} ${fromWallet.currency} từ [${fromWallet.id}] sang [${toWallet.id}]. TX: ${txId}`
    );

    return { txId, fromWallet: updatedFrom, toWallet: updatedTo };
  }

  /**
   * Xem lịch sử giao dịch của ví
   */
  getHistory(walletId: string): ITransactionRecord[] {
    this.getWallet(walletId); // kiểm tra tồn tại
    return this.store.getTransactions(walletId);
  }

  /**
   * Helper bắn sự kiện kiểm toán sang Kafka phi đồng bộ
   */
  private async emitAuditEvent(event: AuditEventDto): Promise<void> {
    try {
      await this.kafkaProducer.publishAuditEvent(event);
    } catch (err: any) {
      this.logger.error(`Lỗi bắn AuditEvent sang Kafka: ${err.message}`, err.stack);
      // Không throw error để nghiệp vụ ví không bị đổ vỡ khi broker Kafka gặp sự cố mạng
    }
  }
}
