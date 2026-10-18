import { Injectable, Logger } from '@nestjs/common';
import { RecordMetadata } from 'kafkajs';
import * as crypto from 'crypto';
import { KafkaClientFactory } from './kafka-client.factory';
import {
  TOPIC_AUDIT_EVENTS,
  TOPIC_TAMPER_ALERTS,
  HEADER_CORRELATION_ID,
  HEADER_EVENT_TYPE,
  HEADER_SOURCE_SERVICE,
  HEADER_SENT_AT,
} from '../constants';
import { AuditEventDto, TamperAlertDto } from '@aegis/contracts';

@Injectable()
export class KafkaProducerService {
  private readonly logger = new Logger(KafkaProducerService.name);

  constructor(private readonly clientFactory: KafkaClientFactory) {}

  /**
   * Bắn sự kiện kiểm toán nghiệp vụ (AuditEvent) vào topic aegis.audit.events.
   * Tự động trích xuất streamKey (ví dụ walletId) làm Message Key để bảo toàn thứ tự FIFO.
   */
  public async publishAuditEvent(
    event: AuditEventDto,
    customHeaders?: Record<string, string>,
  ): Promise<RecordMetadata[]> {
    if (!event.streamKey) {
      throw new Error('AuditEvent bắt buộc phải có trường "streamKey" để đảm bảo định tuyến phân vùng!');
    }

    return this.publish<AuditEventDto>(
      TOPIC_AUDIT_EVENTS,
      event.streamKey,
      event,
      {
        [HEADER_EVENT_TYPE]: 'AuditEventDto',
        ...customHeaders,
      },
    );
  }

  /**
   * Bắn sự kiện cảnh báo vi phạm WORM (TamperAlert) vào topic aegis.tamper.alerts.
   */
  public async publishTamperAlert(
    alert: TamperAlertDto,
    customHeaders?: Record<string, string>,
  ): Promise<RecordMetadata[]> {
    return this.publish<TamperAlertDto>(
      TOPIC_TAMPER_ALERTS,
      alert.alertId,
      alert,
      {
        [HEADER_EVENT_TYPE]: 'TamperAlertDto',
        ...customHeaders,
      },
    );
  }

  /**
   * Phương thức tổng quát bắn một thông điệp bất kỳ vào Kafka Topic với Type-Safe.
   */
  public async publish<T>(
    topic: string,
    key: string,
    payload: T,
    customHeaders?: Record<string, string>,
  ): Promise<RecordMetadata[]> {
    const producer = await this.clientFactory.getProducer();
    const options = this.clientFactory.getOptions();

    const correlationId =
      customHeaders?.[HEADER_CORRELATION_ID] || crypto.randomUUID();
    const sourceService =
      customHeaders?.[HEADER_SOURCE_SERVICE] || options.sourceService || 'aegis-service';
    const sentAt =
      customHeaders?.[HEADER_SENT_AT] || new Date().toISOString();

    const headers: Record<string, string> = {
      [HEADER_CORRELATION_ID]: correlationId,
      [HEADER_SOURCE_SERVICE]: sourceService,
      [HEADER_SENT_AT]: sentAt,
      ...(customHeaders || {}),
    };

    const value = Buffer.from(JSON.stringify(payload), 'utf8');

    try {
      const recordMetadata = await producer.send({
        topic,
        messages: [
          {
            key,
            value,
            headers,
          },
        ],
      });

      this.logger.debug(
        `Đã bắn message thành công vào [${topic}] (Key: ${key}, Partition: ${recordMetadata[0]?.partition}, Offset: ${recordMetadata[0]?.offset})`,
      );

      return recordMetadata;
    } catch (error: any) {
      this.logger.error(
        `Lỗi khi bắn message vào Kafka topic [${topic}] với key [${key}]: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
