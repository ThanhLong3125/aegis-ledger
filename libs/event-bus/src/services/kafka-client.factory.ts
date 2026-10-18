import { Injectable, Inject, OnModuleDestroy, Logger, Optional } from '@nestjs/common';
import { Kafka, Producer, Consumer, KafkaConfig, logLevel } from 'kafkajs';
import { KafkaConfigOptions } from '../interfaces';

export const EVENT_BUS_OPTIONS = 'EVENT_BUS_OPTIONS';

@Injectable()
export class KafkaClientFactory implements OnModuleDestroy {
  private readonly logger = new Logger(KafkaClientFactory.name);
  private kafkaInstance: Kafka | null = null;
  private producerInstance: Producer | null = null;
  private readonly consumers: Map<string, Consumer> = new Map();

  constructor(
    @Optional()
    @Inject(EVENT_BUS_OPTIONS)
    private readonly options?: KafkaConfigOptions,
  ) {}

  public getKafka(): Kafka {
    if (!this.kafkaInstance) {
      const brokers = this.options?.brokers?.length
        ? this.options.brokers
        : [process.env.KAFKA_BROKER || 'localhost:9092'];
      const clientId = this.options?.clientId || 'aegis-event-bus';

      const config: KafkaConfig = {
        clientId,
        brokers,
        ssl: this.options?.ssl ?? false,
        logLevel: logLevel.ERROR,
        retry: this.options?.retry
          ? {
              maxRetryTime: this.options.retry.maxRetryTime ?? 30000,
              initialRetryTime: this.options.retry.initialRetryTime ?? 300,
              factor: this.options.retry.factor ?? 0.2,
              multiplier: this.options.retry.multiplier ?? 2,
              retries: this.options.retry.retries ?? 5,
            }
          : undefined,
      };

      this.kafkaInstance = new Kafka(config);
      this.logger.log(`Khởi tạo kết nối Kafka Client với brokers: [${brokers.join(', ')}], clientId: ${clientId}`);
    }
    return this.kafkaInstance;
  }

  public async getProducer(): Promise<Producer> {
    if (!this.producerInstance) {
      const kafka = this.getKafka();
      // Kích hoạt idempotent producer để bảo vệ tính toàn vẹn và chống trùng lặp message
      this.producerInstance = kafka.producer({
        idempotent: true,
        allowAutoTopicCreation: true,
      });

      await this.producerInstance.connect();
      this.logger.log('Kafka Producer đã kết nối thành công (idempotent: true)');
    }
    return this.producerInstance;
  }

  public async getConsumer(groupId: string): Promise<Consumer> {
    const existing = this.consumers.get(groupId);
    if (existing) {
      return existing;
    }

    const kafka = this.getKafka();
    const consumer = kafka.consumer({
      groupId,
      allowAutoTopicCreation: true,
    });

    await consumer.connect();
    this.consumers.set(groupId, consumer);
    this.logger.log(`Kafka Consumer đã kết nối thành công cho Consumer Group: [${groupId}]`);
    return consumer;
  }

  public getOptions(): KafkaConfigOptions {
    return (
      this.options || {
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
        clientId: 'aegis-event-bus',
        dlqEnabled: true,
      }
    );
  }

  async onModuleDestroy() {
    this.logger.log('Đang thực hiện ngắt kết nối Kafka Client (Graceful Shutdown)...');

    if (this.producerInstance) {
      try {
        await this.producerInstance.disconnect();
        this.logger.log('Đã đóng kết nối Kafka Producer');
      } catch (err: any) {
        this.logger.error(`Lỗi khi đóng kết nối Producer: ${err.message}`);
      }
      this.producerInstance = null;
    }

    for (const [groupId, consumer] of this.consumers.entries()) {
      try {
        await consumer.disconnect();
        this.logger.log(`Đã đóng kết nối Consumer cho Group: [${groupId}]`);
      } catch (err: any) {
        this.logger.error(`Lỗi khi đóng kết nối Consumer [${groupId}]: ${err.message}`);
      }
    }
    this.consumers.clear();
  }
}
