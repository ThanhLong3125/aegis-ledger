import { Injectable, Logger } from '@nestjs/common';
import { IHeaders, KafkaMessage } from 'kafkajs';
import { plainToInstance } from 'class-transformer';
import { validateOrReject, ValidationError } from 'class-validator';
import { KafkaClientFactory } from './kafka-client.factory';
import { KafkaProducerService } from './kafka-producer.service';
import { IMessageContext, IPoisonPillEnvelope } from '../interfaces';
import { getDlqTopicName } from '../constants';

export type ClassType<T> = new (...args: any[]) => T;

export interface SubscribeOptions<T extends object> {
  topic: string;
  groupId: string;
  dtoClass?: ClassType<T>;
  handler: (data: T, context: IMessageContext) => Promise<void>;
  fromBeginning?: boolean;
  autoCommit?: boolean;
}

@Injectable()
export class KafkaConsumerService {
  private readonly logger = new Logger(KafkaConsumerService.name);

  constructor(
    private readonly clientFactory: KafkaClientFactory,
    private readonly producerService: KafkaProducerService,
  ) {}

  /**
   * Đăng ký lắng nghe sự kiện từ Topic với cơ chế tự động thẩm định DTO và chuyển hướng DLQ an toàn.
   */
  public async subscribe<T extends object>(options: SubscribeOptions<T>): Promise<void> {
    const { topic, groupId, dtoClass, handler, fromBeginning = false, autoCommit = true } = options;
    const consumer = await this.clientFactory.getConsumer(groupId);

    await consumer.subscribe({
      topic,
      fromBeginning,
    });

    this.logger.log(`Đã subscribe vào topic [${topic}] với consumer group [${groupId}]`);

    await consumer.run({
      autoCommit,
      eachMessage: async ({ topic: currentTopic, partition, message }) => {
        const rawPayload = message.value ? message.value.toString('utf8') : '';
        const key = message.key ? message.key.toString('utf8') : null;
        const headers = this.extractHeaders(message.headers);

        const context: IMessageContext = {
          topic: currentTopic,
          partition,
          offset: message.offset,
          timestamp: message.timestamp,
          key,
          headers,
        };

        // 1. Phân tích chuỗi JSON
        let parsedData: any;
        try {
          if (!rawPayload.trim()) {
            throw new Error('Payload rỗng hoặc không có dữ liệu');
          }
          parsedData = JSON.parse(rawPayload);
        } catch (jsonErr: any) {
          this.logger.warn(
            `[POISON PILL] Nhận được message lỗi cú pháp JSON tại topic [${currentTopic}], partition [${partition}], offset [${message.offset}]: ${jsonErr.message}`,
          );
          await this.handlePoisonPill(currentTopic, key, rawPayload, `JSON Syntax Error: ${jsonErr.message}`, headers);
          return;
        }

        // 2. Hydrate & Validate với Class DTO (nếu có cung cấp)
        let validatedData: T = parsedData;
        if (dtoClass) {
          try {
            const instance = plainToInstance(dtoClass, parsedData);
            await validateOrReject(instance as object, {
              whitelist: true,
              forbidNonWhitelisted: false,
            });
            validatedData = instance;
          } catch (valErr: any) {
            const reason = this.formatValidationErrors(valErr);
            this.logger.warn(
              `[SCHEMA BREACH] Nhận được message vi phạm DTO validation tại topic [${currentTopic}], partition [${partition}], offset [${message.offset}]: ${reason}`,
            );
            await this.handlePoisonPill(currentTopic, key, rawPayload, `Validation Failed: ${reason}`, headers);
            return;
          }
        }

        // 3. Chuyển giao dữ liệu hợp lệ cho tầng nghiệp vụ
        try {
          await handler(validatedData, context);
        } catch (handlerErr: any) {
          this.logger.error(
            `Lỗi trong quá trình xử lý nghiệp vụ tại topic [${currentTopic}], offset [${message.offset}]: ${handlerErr.message}`,
            handlerErr.stack,
          );
          throw handlerErr; // Rethrow để Kafka retry hoặc rebalance nếu là lỗi tạm thời của handler
        }
      },
    });
  }

  /**
   * Xử lý cách ly tin nhắn hỏng (Poison Pill) và chuyển tiếp an toàn sang Dead Letter Queue
   */
  private async handlePoisonPill(
    originalTopic: string,
    originalKey: string | null,
    rawPayload: string,
    errorReason: string,
    headers: Record<string, string | undefined>,
  ): Promise<void> {
    const options = this.clientFactory.getOptions();
    if (options.dlqEnabled === false) {
      return;
    }

    const dlqTopic = options.defaultDlqTopic || getDlqTopicName(originalTopic);
    const envelope: IPoisonPillEnvelope = {
      originalTopic,
      originalKey,
      failedAt: new Date().toISOString(),
      errorReason,
      rawPayload,
      headers,
    };

    try {
      await this.producerService.publish<IPoisonPillEnvelope>(
        dlqTopic,
        originalKey || 'unknown-key',
        envelope,
        {
          'x-original-topic': originalTopic,
          'x-error-reason': errorReason.substring(0, 200),
        },
      );
      this.logger.log(`Đã chuyển hướng tin nhắn hỏng sang DLQ topic [${dlqTopic}]`);
    } catch (dlqErr: any) {
      this.logger.error(`Không thể chuyển hướng tin nhắn sang DLQ [${dlqTopic}]: ${dlqErr.message}`);
    }
  }

  private extractHeaders(headers?: IHeaders): Record<string, string | undefined> {
    const result: Record<string, string | undefined> = {};
    if (!headers) {
      return result;
    }

    for (const [k, v] of Object.entries(headers)) {
      if (Buffer.isBuffer(v)) {
        result[k] = v.toString('utf8');
      } else if (typeof v === 'string') {
        result[k] = v;
      } else if (Array.isArray(v)) {
        result[k] = v.map((item) => (Buffer.isBuffer(item) ? item.toString('utf8') : item)).join(',');
      } else {
        result[k] = undefined;
      }
    }
    return result;
  }

  private formatValidationErrors(errors: any): string {
    if (!Array.isArray(errors)) {
      return String(errors);
    }

    return errors
      .map((err: ValidationError) => {
        if (err.constraints) {
          return `${err.property}: [${Object.values(err.constraints).join(', ')}]`;
        }
        if (err.children && err.children.length > 0) {
          return `${err.property} -> ${this.formatValidationErrors(err.children)}`;
        }
        return err.property;
      })
      .join('; ');
  }
}
