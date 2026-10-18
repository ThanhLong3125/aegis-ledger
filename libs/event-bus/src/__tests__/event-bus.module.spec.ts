import { Test } from '@nestjs/testing';
import { EventBusModule } from '../modules/event-bus.module';
import { KafkaProducerService } from '../services/kafka-producer.service';
import { KafkaConsumerService } from '../services/kafka-consumer.service';
import { KafkaClientFactory } from '../services/kafka-client.factory';

describe('EventBusModule', () => {
  it('phải biên dịch thành công với EventBusModule.forRoot()', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        EventBusModule.forRoot({
          clientId: 'test-app',
          brokers: ['localhost:9092'],
        }),
      ],
    }).compile();

    const producer = moduleRef.get<KafkaProducerService>(KafkaProducerService);
    const consumer = moduleRef.get<KafkaConsumerService>(KafkaConsumerService);
    const factory = moduleRef.get<KafkaClientFactory>(KafkaClientFactory);

    expect(producer).toBeDefined();
    expect(consumer).toBeDefined();
    expect(factory).toBeDefined();
    expect(factory.getOptions().clientId).toBe('test-app');
  });

  it('phải biên dịch thành công với EventBusModule.forRootAsync()', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        EventBusModule.forRootAsync({
          useFactory: () => ({
            clientId: 'test-async-app',
            brokers: ['kafka.production:9092'],
            sourceService: 'test-service',
          }),
        }),
      ],
    }).compile();

    const factory = moduleRef.get<KafkaClientFactory>(KafkaClientFactory);
    expect(factory.getOptions().clientId).toBe('test-async-app');
    expect(factory.getOptions().sourceService).toBe('test-service');
  });
});
