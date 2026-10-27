import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { SlidingWindowService } from './buffer/sliding-window.service';

async function bootstrap() {
  const logger = new Logger('AuditLedgerBootstrap');
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );

  app.enableShutdownHooks();

  const buffer = app.get(SlidingWindowService);

  const shutdown = async (signal: string) => {
    logger.log(`Nhận tín hiệu dừng [${signal}]. Bắt đầu xả sạch toàn bộ log tồn đọng trong bộ đệm...`);
    try {
      const flushed = await buffer.forceFlush();
      logger.log(`Đã chốt thành công ${flushed.length} Epoch tồn đọng. Zero data loss.`);
    } catch (err: any) {
      logger.error(`Lỗi khi xả bộ đệm lúc tắt: ${err.message}`);
    }
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  const port = parseInt(process.env.AUDIT_LEDGER_PORT || '4001', 10);
  await app.listen({ port, host: '0.0.0.0' });

  logger.log(`🛡️ AegisLedger Ingestion & Epoch Engine (Fastify) đã khởi động tại http://localhost:${port}`);
}

bootstrap().catch((err) => {
  console.error('Lỗi khởi động AuditLedger:', err);
  process.exit(1);
});
