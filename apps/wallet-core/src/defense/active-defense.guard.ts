import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { RedisDefenseService } from './redis-defense.service';

@Injectable()
export class ActiveDefenseGuard implements CanActivate {
  private readonly logger = new Logger(ActiveDefenseGuard.name);

  constructor(private readonly redisDefense: RedisDefenseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isLocked = await this.redisDefense.isLockWithdrawalsActive();

    if (isLocked) {
      this.logger.warn(
        '🚫 [ACTIVE DEFENSE INTERCEPT] Chặn đứng giao dịch vì cờ tự vệ LOCK_WITHDRAWALS đang bật!'
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.LOCKED, // 423
          error: 'Locked',
          message:
            'SECURITY ALERT: System is currently in Emergency Lockdown due to detected ledger breach. Withdrawals and transfers are temporarily frozen.',
        },
        HttpStatus.LOCKED
      );
    }

    return true;
  }
}
