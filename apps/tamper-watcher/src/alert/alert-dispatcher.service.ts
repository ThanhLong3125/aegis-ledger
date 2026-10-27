import { Injectable, Logger, Optional } from '@nestjs/common';
import { TamperAlertDto } from '@aegis/contracts';
import { KafkaProducerService } from '@aegis/event-bus';
import { ActiveDefenseService } from '../defense/active-defense.service';
import { TelegramService } from './telegram.service';

@Injectable()
export class AlertDispatcherService {
  private readonly logger = new Logger(AlertDispatcherService.name);

  constructor(
    private readonly activeDefense: ActiveDefenseService,
    private readonly telegramService: TelegramService,
    @Optional() private readonly kafkaProducer?: KafkaProducerService
  ) {}

  /**
   * Điều phối kích hoạt phòng vệ chủ động và phát cảnh báo đa kênh
   * 1. Khóa cổng tài chính trên Redis (< 200ms)
   * 2. Bắn thông điệp TamperAlertDto vào Kafka topic aegis.tamper.alerts
   * 3. Gửi tin nhắn cảnh báo đỏ qua Telegram Bot
   */
  async dispatchBreachAlert(
    alert: TamperAlertDto
  ): Promise<{ latencyMs: number; lockdownSuccess: boolean }> {
    const startTime = process.hrtime.bigint();

    this.logger.error(
      `🚨 [TAMPER DETECTED] Bắt quả tang hành vi can thiệp trái phép [${alert.breachType}] trên bảng [${alert.targetTable}]!`
    );

    // 1. Tuyến phản xạ đầu tiên: Kích hoạt ngay cờ đỏ Active Defense trên Redis
    const defenseResult = await this.activeDefense.triggerLockdown(
      `${alert.breachType} on ${alert.targetTable} (ID: ${alert.affectedId})`
    );

    // 2. Bắn sự kiện sang Kafka Topic aegis.tamper.alerts
    if (this.kafkaProducer) {
      try {
        await this.kafkaProducer.publishTamperAlert(alert);
        this.logger.log(`Đã phát tán sự kiện cảnh báo vào Kafka topic [aegis.tamper.alerts].`);
      } catch (err: any) {
        this.logger.error(`Lỗi phát tán Kafka Tamper Alert: ${err.message}`);
      }
    }

    // 3. Gửi tin nhắn khẩn cấp qua Telegram Bot (hoặc mô phỏng)
    void this.telegramService.sendTamperAlert(alert).catch((err) => {
      this.logger.error(`Lỗi gửi thông báo Telegram: ${err.message}`);
    });

    const endTime = process.hrtime.bigint();
    const totalLatencyMs = Number(endTime - startTime) / 1_000_000;

    this.logger.error(
      `⚡ [RAPID DEFENSE METRIC] Tổng thời gian từ lúc phát hiện đến khi hoàn tất phòng vệ: ${totalLatencyMs.toFixed(
        2
      )}ms (SLA < 200ms: ${totalLatencyMs < 200 ? 'ĐẠT CHUẨN ✅' : 'VƯỢT NGƯỠNG ❌'})`
    );

    return {
      latencyMs: totalLatencyMs,
      lockdownSuccess: defenseResult.success,
    };
  }
}
