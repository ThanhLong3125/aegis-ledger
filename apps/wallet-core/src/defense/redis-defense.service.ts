import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { WalletConfigService } from '../config/wallet-config.service';

@Injectable()
export class RedisDefenseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisDefenseService.name);
  private redisClient: Redis | null = null;
  private isConnected = false;

  constructor(private readonly configService: WalletConfigService) {}

  onModuleInit(): void {
    try {
      this.redisClient = new Redis({
        host: this.configService.redisHost,
        port: this.configService.redisPort,
        password: this.configService.redisPassword,
        lazyConnect: true,
        connectTimeout: 3000,
        maxRetriesPerRequest: 1,
      });

      this.redisClient.on('connect', () => {
        this.isConnected = true;
        this.logger.log('Đã kết nối thành công tới Redis Active Defense channel.');
      });

      this.redisClient.on('error', (err) => {
        this.isConnected = false;
        this.logger.warn(`Redis Defense warning: ${err.message}. Tiếp tục với fallback an toàn.`);
      });

      // Thử kết nối ngầm
      void this.redisClient.connect().catch((err) => {
        this.logger.warn(`Không thể kết nối ngay tới Redis [${this.configService.redisHost}:${this.configService.redisPort}]: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.warn(`Lỗi khởi tạo Redis client: ${err.message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit().catch(() => {});
      this.redisClient = null;
    }
  }

  /**
   * Kiểm tra cờ Active Defense từ Redis
   * Nếu có cờ LOCK_WITHDRAWALS=true, hệ thống đang bị tấn công -> khóa cổng tiền
   */
  async isLockWithdrawalsActive(): Promise<boolean> {
    if (!this.redisClient || !this.isConnected) {
      return false;
    }

    try {
      const value = await this.redisClient.get(this.configService.activeDefenseLockKey);
      return value === 'true' || value === '1';
    } catch (err: any) {
      this.logger.error(`Lỗi đọc cờ Active Defense từ Redis: ${err.message}`);
      return false;
    }
  }

  /**
   * Cập nhật cờ Active Defense (phục vụ test hoặc API khẩn cấp)
   */
  async setLockWithdrawals(locked: boolean): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    try {
      if (locked) {
        await this.redisClient.set(this.configService.activeDefenseLockKey, 'true');
        this.logger.warn('🚨 ĐÃ KÍCH HOẠT CỜ ĐỎ ACTIVE DEFENSE: KHÓA TOÀN BỘ CỔNG RÚT/CHUYỂN TIỀN!');
      } else {
        await this.redisClient.del(this.configService.activeDefenseLockKey);
        this.logger.log('Đã dỡ bỏ cờ Active Defense. Cổng thanh toán trở lại bình thường.');
      }
    } catch (err: any) {
      this.logger.error(`Lỗi cập nhật cờ Active Defense: ${err.message}`);
    }
  }
}
