import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { WatcherConfigService } from '../config/watcher-config.service';

@Injectable()
export class ActiveDefenseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ActiveDefenseService.name);
  private redisClient: Redis | null = null;
  private isConnected = false;

  constructor(private readonly config: WatcherConfigService) {}

  onModuleInit(): void {
    try {
      this.redisClient = new Redis({
        host: this.config.redisHost,
        port: this.config.redisPort,
        password: this.config.redisPassword,
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

      void this.redisClient.connect().catch((err) => {
        this.logger.warn(
          `Không thể kết nối ngay tới Redis [${this.config.redisHost}:${this.config.redisPort}]: ${err.message}`
        );
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
   * Kích hoạt cờ đỏ khẩn cấp: Đóng băng toàn bộ cổng rút và chuyển tiền
   * Đo lường thời gian phản ứng (latency SLA < 200ms)
   */
  async triggerLockdown(reason?: string): Promise<{ latencyMs: number; success: boolean }> {
    const startTime = process.hrtime.bigint();

    if (!this.redisClient) {
      this.logger.error('Không thể kích hoạt Active Defense: Redis client chưa được khởi tạo!');
      return { latencyMs: 0, success: false };
    }

    try {
      await this.redisClient.set(this.config.activeDefenseLockKey, 'true');
      const endTime = process.hrtime.bigint();
      const latencyMs = Number(endTime - startTime) / 1_000_000;

      this.logger.error(
        `🚨 [ACTIVE DEFENSE ENGAGED] ĐÃ KÍCH HOẠT CỜ ĐỎ KHÓA CỔNG RÚT TIỀN TRONG ${latencyMs.toFixed(
          2
        )}ms! Lý do: ${reason || 'Phát hiện can thiệp cơ sở dữ liệu'}`
      );

      return { latencyMs, success: true };
    } catch (err: any) {
      this.logger.error(`Thất bại khi kích hoạt Active Defense trên Redis: ${err.message}`);
      return { latencyMs: 0, success: false };
    }
  }

  /**
   * Gỡ bỏ cờ đỏ khẩn cấp (phục hồi trạng thái bình thường)
   */
  async releaseLockdown(): Promise<void> {
    if (!this.redisClient) return;

    try {
      await this.redisClient.del(this.config.activeDefenseLockKey);
      this.logger.log('Đã dỡ bỏ cờ đỏ Active Defense. Hệ thống trở lại hoạt động bình thường.');
    } catch (err: any) {
      this.logger.error(`Lỗi dỡ bỏ cờ Active Defense: ${err.message}`);
    }
  }

  /**
   * Kiểm tra xem hệ thống có đang trong trạng thái phong tỏa (lockdown) hay không
   */
  async isLockdownActive(): Promise<boolean> {
    if (!this.redisClient) return false;

    try {
      const val = await this.redisClient.get(this.config.activeDefenseLockKey);
      return val === 'true' || val === '1';
    } catch {
      return false;
    }
  }
}
