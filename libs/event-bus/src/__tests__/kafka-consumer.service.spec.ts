import { KafkaConsumerService } from '../services/kafka-consumer.service';
import { KafkaClientFactory } from '../services/kafka-client.factory';
import { KafkaProducerService } from '../services/kafka-producer.service';
import { TOPIC_AUDIT_EVENTS, TOPIC_AUDIT_EVENTS_DLQ } from '../constants';
import { AuditEventDto, AuditAction } from '@aegis/contracts';

describe('KafkaConsumerService', () => {
  let consumerService: KafkaConsumerService;
  let mockConsumer: any;
  let mockClientFactory: any;
  let mockProducerService: any;
  let messageHandlerCallback: any;

  beforeEach(() => {
    mockConsumer = {
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockImplementation(async (config: any) => {
        messageHandlerCallback = config.eachMessage;
      }),
    };

    mockClientFactory = {
      getConsumer: jest.fn().mockResolvedValue(mockConsumer),
      getOptions: jest.fn().mockReturnValue({
        dlqEnabled: true,
      }),
    };

    mockProducerService = {
      publish: jest.fn().mockResolvedValue([]),
    };

    consumerService = new KafkaConsumerService(
      mockClientFactory as unknown as KafkaClientFactory,
      mockProducerService as unknown as KafkaProducerService,
    );
  });

  it('phải parse và validate thành công AuditEventDto hợp lệ rồi chuyển cho handler', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);

    await consumerService.subscribe<AuditEventDto>({
      topic: TOPIC_AUDIT_EVENTS,
      groupId: 'test-group',
      dtoClass: AuditEventDto,
      handler,
    });

    expect(mockConsumer.subscribe).toHaveBeenCalledWith({
      topic: TOPIC_AUDIT_EVENTS,
      fromBeginning: false,
    });
    expect(mockConsumer.run).toHaveBeenCalledTimes(1);

    const validPayload = {
      eventId: 'evt_valid_001',
      streamKey: 'wal_test_1',
      timestamp: '2026-10-18T00:00:00.000Z',
      action: AuditAction.WALLET_DEPOSIT,
      actor: {
        userId: 'usr_test',
        ipAddress: '127.0.0.1',
        userAgent: 'JestTest',
      },
      resource: {
        type: 'WALLET',
        id: 'wal_test_1',
      },
      payload: {
        amount: 100000,
      },
    };

    // Giả lập Kafka message đến
    await messageHandlerCallback({
      topic: TOPIC_AUDIT_EVENTS,
      partition: 1,
      message: {
        key: Buffer.from('wal_test_1'),
        value: Buffer.from(JSON.stringify(validPayload)),
        offset: '42',
        timestamp: '1600000000000',
        headers: {
          'x-correlation-id': Buffer.from('corr_123'),
        },
      },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const [receivedData, context] = handler.mock.calls[0];

    expect(receivedData).toBeInstanceOf(AuditEventDto);
    expect(receivedData.eventId).toBe('evt_valid_001');
    expect(context.partition).toBe(1);
    expect(context.offset).toBe('42');
    expect(context.headers['x-correlation-id']).toBe('corr_123');

    // Không kích hoạt DLQ
    expect(mockProducerService.publish).not.toHaveBeenCalled();
  });

  it('phải bắt lỗi Poison Pill khi gặp JSON hỏng và chuyển hướng sang DLQ mà không làm crash', async () => {
    const handler = jest.fn();

    await consumerService.subscribe<AuditEventDto>({
      topic: TOPIC_AUDIT_EVENTS,
      groupId: 'test-group',
      dtoClass: AuditEventDto,
      handler,
    });

    // Giả lập message chứa JSON hỏng
    await messageHandlerCallback({
      topic: TOPIC_AUDIT_EVENTS,
      partition: 0,
      message: {
        key: Buffer.from('wal_broken'),
        value: Buffer.from('{"broken_json": true, INVALID}'),
        offset: '99',
        timestamp: '1600000000000',
        headers: {},
      },
    });

    // Handler không bao giờ được gọi
    expect(handler).not.toHaveBeenCalled();

    // DLQ Producer phải được kích hoạt để cách ly
    expect(mockProducerService.publish).toHaveBeenCalledTimes(1);
    const [dlqTopic, dlqKey, dlqEnvelope] = mockProducerService.publish.mock.calls[0];

    expect(dlqTopic).toBe(TOPIC_AUDIT_EVENTS_DLQ);
    expect(dlqKey).toBe('wal_broken');
    expect(dlqEnvelope.errorReason).toContain('JSON Syntax Error');
    expect(dlqEnvelope.rawPayload).toBe('{"broken_json": true, INVALID}');
  });

  it('phải bắt lỗi Schema Breach khi thiếu trường bắt buộc và chuyển hướng sang DLQ', async () => {
    const handler = jest.fn();

    await consumerService.subscribe<AuditEventDto>({
      topic: TOPIC_AUDIT_EVENTS,
      groupId: 'test-group',
      dtoClass: AuditEventDto,
      handler,
    });

    // Message thiếu trường actor.ipAddress và streamKey
    const invalidPayload = {
      eventId: 'evt_invalid_002',
      timestamp: '2026-10-18T00:00:00.000Z',
      action: 'INVALID_ACTION',
      actor: {
        userId: 'usr_test',
        // thiếu ipAddress, userAgent
      },
    };

    await messageHandlerCallback({
      topic: TOPIC_AUDIT_EVENTS,
      partition: 2,
      message: {
        key: null,
        value: Buffer.from(JSON.stringify(invalidPayload)),
        offset: '105',
        timestamp: '1600000000000',
        headers: {},
      },
    });

    // Handler không được gọi
    expect(handler).not.toHaveBeenCalled();

    // DLQ phải được gọi
    expect(mockProducerService.publish).toHaveBeenCalledTimes(1);
    const [dlqTopic, dlqKey, dlqEnvelope] = mockProducerService.publish.mock.calls[0];

    expect(dlqTopic).toBe(TOPIC_AUDIT_EVENTS_DLQ);
    expect(dlqEnvelope.errorReason).toContain('Validation Failed');
    expect(dlqEnvelope.errorReason).toContain('streamKey');
  });
});
