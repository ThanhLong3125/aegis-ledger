import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface IClientInfo {
  ipAddress: string;
  userAgent: string;
  deviceId: string;
}

export const ClientInfo = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): IClientInfo => {
    const request = ctx.switchToHttp().getRequest();

    const rawIp =
      request.headers['x-forwarded-for'] ||
      request.socket?.remoteAddress ||
      request.ip ||
      '127.0.0.1';

    const ipAddress = Array.isArray(rawIp)
      ? rawIp[0]
      : typeof rawIp === 'string'
      ? rawIp.split(',')[0].trim()
      : '127.0.0.1';

    const userAgent = request.headers['user-agent'] || 'AegisWalletClient/1.0';
    const deviceId =
      request.headers['x-device-id'] ||
      request.body?.deviceId ||
      'dev_unknown';

    return {
      ipAddress,
      userAgent,
      deviceId: String(deviceId),
    };
  }
);
