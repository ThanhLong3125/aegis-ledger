import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from '@aegis/event-bus';
import { AuditEventDto } from '@aegis/contracts';
import { LedgerConfigService } from '../config/ledger-config.service';
import { SlidingWindowService } from '../buffer/sliding-window.service';

@Injectable()
export class AuditEventConsumer implements OnModuleInit {
  private readonly logger = new Logger(AuditEventConsumer.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly configService: LedgerConfigService,
    private readonly slidingWindow: SlidingWindowService
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.kafkaConsumer.subscribe<AuditEventDto>({
        topic: this.configService.kafkaTopic,
        groupId: this.configService.kafkaGroupId,
        dtoClass: AuditEventDto,
        handler: async (eventDto, context) => {
          this.logger.debug(
            `Nhận sự kiện kiểm toán: [${eventDto.eventId}] action=${eventDto.action} streamKey=${eventDto.streamKey}`
          );
          await this.slidingWindow.push(eventDto);
        },
      });

      this.logger.log(
        `AuditEventConsumer đã đăng ký lắng nghe topic [${this.configService.kafkaTopic}] (Group: ${this.configService.kafkaGroupId})`
      );
    } catch (err: any) {
      this.logger.warn(
        `Không thể kết nối ngay tới Kafka [${this.configService.kafkaBrokers.join(', ')}]: ${err.message}. Tiếp tục chạy ở chế độ Standalone/Offline.`
      );
    }
  }
}
