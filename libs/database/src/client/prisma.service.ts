import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Successfully connected to PostgreSQL via Prisma Client.');
    } catch (error) {
      this.logger.error('Failed to connect to PostgreSQL database:', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected Prisma Client connection pool.');
  }

  /**
   * Helper dọn dẹp dữ liệu bảng phục vụ kiểm thử tự động
   */
  async cleanDatabaseForTesting(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('cleanDatabaseForTesting is not allowed in production!');
    }
    await this.$executeRawUnsafe('TRUNCATE TABLE "audit_logs", "epoch_blocks", "external_anchors" CASCADE;');
  }
}
