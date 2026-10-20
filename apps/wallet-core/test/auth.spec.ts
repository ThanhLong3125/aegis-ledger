import { UnauthorizedException } from '@nestjs/common';
import { AuditAction } from '@aegis/contracts';
import { KafkaProducerService } from '@aegis/event-bus';
import { AuthService } from '../src/auth/auth.service';
import { WalletConfigService } from '../src/config/wallet-config.service';
import { IClientInfo } from '../src/common/client-info.decorator';

describe('AuthService - Authentication & Session Audit Trail', () => {
  let authService: AuthService;
  let mockKafkaProducer: { publishAuditEvent: jest.Mock };
  let mockConfig: Partial<WalletConfigService>;

  const clientInfo: IClientInfo = {
    ipAddress: '192.168.1.50',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15',
    deviceId: 'iphone_15_pro_alice',
  };

  beforeEach(() => {
    mockKafkaProducer = {
      publishAuditEvent: jest.fn().mockResolvedValue([]),
    };
    mockConfig = {
      kafkaTopic: 'aegis.audit.events',
    };

    authService = new AuthService(
      mockKafkaProducer as unknown as KafkaProducerService,
      mockConfig as WalletConfigService
    );
  });

  it('1. Đăng nhập thành công: Trả về token và bắn sự kiện USER_LOGIN_SUCCESS sang Kafka', async () => {
    const result = await authService.login(
      { username: 'alice', password: 'password123', deviceId: 'iphone_15_pro_alice' },
      clientInfo
    );

    expect(result.token).toBeDefined();
    expect(result.user.username).toBe('alice');
    expect(result.user.role).toBe('USER');

    expect(mockKafkaProducer.publishAuditEvent).toHaveBeenCalledTimes(1);
    const event = mockKafkaProducer.publishAuditEvent.mock.calls[0][0];

    expect(event.action).toBe(AuditAction.USER_LOGIN_SUCCESS);
    expect(event.actor.userId).toBe('usr_alice');
    expect(event.actor.ipAddress).toBe(clientInfo.ipAddress);
    expect(event.actor.userAgent).toBe(clientInfo.userAgent);
    expect(event.payload.deviceId).toBe('iphone_15_pro_alice');
  });

  it('2. Đăng nhập thất bại (Sai mật khẩu): Báo lỗi 401 và vẫn bắn sự kiện USER_LOGIN_FAILED để lưu vết tấn công', async () => {
    await expect(
      authService.login(
        { username: 'alice', password: 'wrong_password_123', deviceId: 'iphone_15_pro_alice' },
        clientInfo
      )
    ).rejects.toThrow(UnauthorizedException);

    expect(mockKafkaProducer.publishAuditEvent).toHaveBeenCalledTimes(1);
    const event = mockKafkaProducer.publishAuditEvent.mock.calls[0][0];

    expect(event.action).toBe(AuditAction.USER_LOGIN_FAILED);
    expect(event.actor.ipAddress).toBe(clientInfo.ipAddress);
    expect(event.payload.reason).toBe('INVALID_CREDENTIALS');
  });

  it('3. Đăng xuất: Đóng phiên làm việc và bắn sự kiện USER_LOGOUT sang Kafka', async () => {
    const result = await authService.logout(
      { userId: 'usr_alice', deviceId: 'iphone_15_pro_alice' },
      clientInfo
    );

    expect(result.message).toBe('Đăng xuất thành công.');
    expect(mockKafkaProducer.publishAuditEvent).toHaveBeenCalledTimes(1);
    const event = mockKafkaProducer.publishAuditEvent.mock.calls[0][0];

    expect(event.action).toBe(AuditAction.USER_LOGOUT);
    expect(event.actor.userId).toBe('usr_alice');
    expect(event.payload.deviceId).toBe('iphone_15_pro_alice');
  });
});
