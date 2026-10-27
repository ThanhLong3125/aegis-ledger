import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('TamperWatcherBootstrap');
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );

  app.enableShutdownHooks();

  const shutdown = async (signal: string) => {
    logger.log(`Nhận tín hiệu dừng [${signal}]. Dừng Tamper Watcher an toàn...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  const port = parseInt(process.env.TAMPER_WATCHER_PORT || '4002', 10);
  await app.listen({ port, host: '0.0.0.0' });

  logger.log(`🛡️ AegisLedger Tamper Watcher (Fastify) đã khởi động và đang giám sát tại http://localhost:${port}`);
}

bootstrap().catch((err) => {
  console.error('Lỗi khởi động TamperWatcher:', err);
  process.exit(1);
});
