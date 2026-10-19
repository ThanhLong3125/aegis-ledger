import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { IAuditEvent } from '@aegis/contracts';
import { LedgerConfigService } from '../config/ledger-config.service';
import { EpochEngineService, IProcessEpochResult } from '../engine/epoch-engine.service';
import { BufferMutex } from './buffer-mutex';

export type FlushTriggerReason = 'THRESHOLD' | 'TIMEOUT' | 'MANUAL' | 'SHUTDOWN';

@Injectable()
export class SlidingWindowService implements OnModuleDestroy {
  private readonly logger = new Logger(SlidingWindowService.name);
  private queue: IAuditEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly mutex = new BufferMutex();
  private isDestroyed = false;

  constructor(
    private readonly configService: LedgerConfigService,
    private readonly epochEngine: EpochEngineService
  ) {}

  onModuleDestroy(): void {
    this.isDestroyed = true;
    this.clearTimer();
  }

  /**
   * Đẩy một sự kiện kiểm toán vào bộ đệm
   */
  async push(event: IAuditEvent): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('SlidingWindowService đang tắt, từ chối nhận thêm log.');
    }

    this.queue.push(event);

    // 1. Kiểm tra điều kiện dung lượng (Threshold Trigger)
    if (this.queue.length >= this.configService.epochMaxBatchSize) {
      this.clearTimer();
      // Kích hoạt flush bất đồng bộ nhưng không block người gọi push
      void this.flush('THRESHOLD');
      return;
    }

    // 2. Kích hoạt Timer nếu chưa có timer nào đang chạy
    if (!this.timer) {
      this.startTimer();
    }
  }

  /**
   * Bắt đầu đồng hồ đếm ngược chốt sổ theo thời gian
   */
  private startTimer(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush('TIMEOUT');
    }, this.configService.epochMaxWaitMs);
  }

  /**
   * Hủy đồng hồ đếm ngược hiện tại
   */
  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Thực hiện chốt sổ một lô sự kiện từ bộ đệm (được bảo vệ bởi Mutex)
   */
  async flush(reason: FlushTriggerReason): Promise<IProcessEpochResult | null> {
    await this.mutex.acquire();

    try {
      if (this.queue.length === 0) {
        return null;
      }

      this.clearTimer();

      const batchSize = this.configService.epochMaxBatchSize;
      const batchItems = this.queue.splice(0, batchSize);

      this.logger.log(
        `[FLUSH (${reason})] Bắt đầu chốt Epoch cho ${batchItems.length} logs (Còn lại trong buffer: ${this.queue.length})`
      );

      const result = await this.epochEngine.processBatch(batchItems);

      // Nếu trong queue vẫn còn dữ liệu
      if (this.queue.length >= batchSize) {
        // Vẫn còn đủ batch tiếp theo -> Kích hoạt flush tiếp theo
        setImmediate(() => {
          void this.flush('THRESHOLD');
        });
      } else if (this.queue.length > 0 && !this.isDestroyed) {
        // Còn ít hơn 1 batch -> Bật lại timer
        this.startTimer();
      }

      return result;
    } catch (err: any) {
      this.logger.error(`[FLUSH ERROR] Lỗi khi xử lý flush (${reason}): ${err.message}`, err.stack);
      throw err;
    } finally {
      this.mutex.release();
    }
  }

  /**
   * Xả sạch toàn bộ log tồn đọng trong buffer (dùng khi shutdown hoặc test)
   */
  async forceFlush(): Promise<IProcessEpochResult[]> {
    this.clearTimer();
    const results: IProcessEpochResult[] = [];

    while (this.queue.length > 0) {
      const res = await this.flush('SHUTDOWN');
      if (res) {
        results.push(res);
      }
    }

    return results;
  }

  /**
   * Lấy số lượng log đang chờ trong hàng đợi
   */
  getPendingCount(): number {
    return this.queue.length;
  }
}
