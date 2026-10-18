import { KafkaProducerService } from '../services/kafka-producer.service';
import { KafkaClientFactory } from '../services/kafka-client.factory';
import { TOPIC_AUDIT_EVENTS, TOPIC_TAMPER_ALERTS } from '../constants';
import { AuditEventDto, TamperAlertDto, AuditAction, AlertSeverity, BreachType } from '@aegis/contracts';

describe('KafkaProducerService', () => {
  let producerService: KafkaProducerService;
  let mockKafkaProducer: any;
  let mockClientFactory: any;

  beforeEach(() => {
    mockKafkaProducer = {
      send: jest.fn().mockResolvedValue([
        {
          topicName: TOPIC_AUDIT_EVENTS,
          partition: 0,
          errorCode: 0,
          offset: '100',
          timestamp: '1600000000000',
        },
      ]),
    };

    mockClientFactory = {
      getProducer: jest.fn().mockResolvedValue(mockKafkaProducer),
      getOptions: jest.fn().mockReturnValue({
        sourceService: 'test-wallet-service',
      }),
    };

    producerService = new KafkaProducerService(mockClientFactory as unknown as KafkaClientFactory);
  });

  it('phải bắn AuditEvent thành công với streamKey làm Message Key', async () => {
    const event: AuditEventDto = {
      eventId: 'evt_12345',
      streamKey: 'wal_user_9988',
      timestamp: '2026-10-18T00:00:00.000Z',
      action: AuditAction.WALLET_TRANSFER,
      actor: {
        userId: 'usr_alex',
        ipAddress: '192.168.1.1',
        userAgent: 'JestTest/1.0',
      },
      resource: {
        type: 'WALLET',
        id: 'wal_user_9988',
      },
      payload: {
        amount: 500000,
        currency: 'VND',
      },
    };

    const result = await producerService.publishAuditEvent(event);

    expect(mockKafkaProducer.send).toHaveBeenCalledTimes(1);
    const sendArgs = mockKafkaProducer.send.mock.calls[0][0];

    expect(sendArgs.topic).toBe(TOPIC_AUDIT_EVENTS);
    expect(sendArgs.messages).toHaveLength(1);

    const message = sendArgs.messages[0];
    expect(message.key).toBe('wal_user_9988');
    expect(JSON.parse(message.value.toString())).toEqual(event);
    expect(message.headers['x-event-type']).toBe('AuditEventDto');
    expect(message.headers['x-source-service']).toBe('test-wallet-service');
    expect(message.headers['x-correlation-id']).toBeDefined();
    expect(message.headers['x-sent-at']).toBeDefined();

    expect(result[0].offset).toBe('100');
  });

  it('phải ném lỗi nếu AuditEvent thiếu trường streamKey', async () => {
    const invalidEvent = {
      eventId: 'evt_missing_key',
      streamKey: '',
      timestamp: '2026-10-18T00:00:00.000Z',
    } as unknown as AuditEventDto;

    await expect(producerService.publishAuditEvent(invalidEvent)).rejects.toThrow(
      'AuditEvent bắt buộc phải có trường "streamKey"',
    );
  });

  it('phải bắn TamperAlert vào topic aegis.tamper.alerts với alertId làm Message Key', async () => {
    mockKafkaProducer.send.mockResolvedValueOnce([
      {
        topicName: TOPIC_TAMPER_ALERTS,
        partition: 0,
        errorCode: 0,
        offset: '5',
      },
    ]);

    const alert: TamperAlertDto = {
      alertId: 'alt_9999',
      severity: AlertSeverity.CRITICAL,
      breachType: BreachType.UNAUTHORIZED_UPDATE,
      targetTable: 'audit_logs',
      affectedId: 'evt_12345',
      detectedAt: '2026-10-18T00:00:01.000Z',
      message: 'Can thiệp SQL UPDATE trái phép!',
    };

    await producerService.publishTamperAlert(alert);

    expect(mockKafkaProducer.send).toHaveBeenCalledTimes(1);
    const sendArgs = mockKafkaProducer.send.mock.calls[0][0];

    expect(sendArgs.topic).toBe(TOPIC_TAMPER_ALERTS);
    expect(sendArgs.messages[0].key).toBe('alt_9999');
    expect(sendArgs.messages[0].headers['x-event-type']).toBe('TamperAlertDto');
  });
});
