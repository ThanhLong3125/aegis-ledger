import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { AuditAction, AuditEventDto } from '@aegis/contracts';
import { KafkaProducerService } from '@aegis/event-bus';
import { WalletConfigService } from '../config/wallet-config.service';
import { IClientInfo } from '../common/client-info.decorator';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';

interface IUserRecord {
  userId: string;
  username: string;
  password: string; // Plaintext cho mock service
  role: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Danh sách user mẫu trong hệ thống mock
  private readonly users: IUserRecord[] = [
    {
      userId: 'usr_alice',
      username: 'alice',
      password: 'password123',
      role: 'USER',
    },
    {
      userId: 'usr_bob',
      username: 'bob',
      password: 'password123',
      role: 'USER',
    },
    {
      userId: 'usr_admin',
      username: 'admin',
      password: 'admin_secure_pass',
      role: 'ADMIN',
    },
  ];

  constructor(
    private readonly kafkaProducer: KafkaProducerService,
    private readonly configService: WalletConfigService
  ) {}

  /**
   * Xử lý đăng nhập và lưu vết AuditEvent
   */
  async login(
    dto: LoginDto,
    clientInfo: IClientInfo
  ): Promise<{ token: string; user: { userId: string; username: string; role: string } }> {
    const user = this.users.find(
      (u) => u.username.toLowerCase() === dto.username.toLowerCase()
    );

    // KỊCH BẢN 1: ĐĂNG NHẬP THẤT BẠI
    if (!user || user.password !== dto.password) {
      this.logger.warn(
        `[LOGIN FAILED] Thử đăng nhập thất bại với username: [${dto.username}] từ IP: [${clientInfo.ipAddress}]`
      );

      // Bắn AuditEvent USER_LOGIN_FAILED vào Kafka
      await this.emitAuditEvent({
        eventId: crypto.randomUUID(),
        streamKey: dto.username, // gom cụm theo username để phát hiện brute-force
        timestamp: new Date().toISOString(),
        actor: {
          userId: user ? user.userId : dto.username,
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
        },
        action: AuditAction.USER_LOGIN_FAILED,
        resource: { type: 'USER', id: user ? user.userId : dto.username },
        payload: {
          attemptedUsername: dto.username,
          deviceId: dto.deviceId || clientInfo.deviceId,
          reason: 'INVALID_CREDENTIALS',
        },
      });

      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không chính xác.');
    }

    // KỊCH BẢN 2: ĐĂNG NHẬP THÀNH CÔNG
    const mockToken = `token_mock_${user.userId}_${Date.now()}`;

    // Bắn AuditEvent USER_LOGIN_SUCCESS vào Kafka
    await this.emitAuditEvent({
      eventId: crypto.randomUUID(),
      streamKey: user.userId,
      timestamp: new Date().toISOString(),
      actor: {
        userId: user.userId,
        role: user.role,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
      },
      action: AuditAction.USER_LOGIN_SUCCESS,
      resource: { type: 'USER', id: user.userId },
      payload: {
        deviceId: dto.deviceId || clientInfo.deviceId,
        loginMethod: 'PASSWORD',
      },
    });

    this.logger.log(`[LOGIN SUCCESS] User [${user.username}] đăng nhập thành công.`);

    return {
      token: mockToken,
      user: {
        userId: user.userId,
        username: user.username,
        role: user.role,
      },
    };
  }

  /**
   * Xử lý đăng xuất và lưu vết AuditEvent
   */
  async logout(
    dto: LogoutDto,
    clientInfo: IClientInfo
  ): Promise<{ message: string }> {
    // Bắn AuditEvent USER_LOGOUT vào Kafka
    await this.emitAuditEvent({
      eventId: crypto.randomUUID(),
      streamKey: dto.userId,
      timestamp: new Date().toISOString(),
      actor: {
        userId: dto.userId,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
      },
      action: AuditAction.USER_LOGOUT,
      resource: { type: 'USER', id: dto.userId },
      payload: {
        deviceId: dto.deviceId || clientInfo.deviceId,
        logoutReason: 'USER_INITIATED',
      },
    });

    this.logger.log(`[LOGOUT] User [${dto.userId}] đã đăng xuất.`);

    return { message: 'Đăng xuất thành công.' };
  }

  /**
   * Helper bắn sự kiện sang Kafka
   */
  private async emitAuditEvent(event: AuditEventDto): Promise<void> {
    try {
      await this.kafkaProducer.publishAuditEvent(event);
    } catch (err: any) {
      this.logger.error(`Lỗi bắn AuditEvent sang Kafka: ${err.message}`, err.stack);
    }
  }
}
