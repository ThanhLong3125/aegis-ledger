import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('TamperWatcherBootstrap');
  const app = await NestFactory.createApplicationContext(AppModule);

  app.enableShutdownHooks();

  const shutdown = async (signal: string) => {
    logger.log(`Nhận tín hiệu dừng [${signal}]. Dừng Tamper Watcher an toàn...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  logger.log('🛡️ AegisLedger Tamper Watcher (Autonomous Active Defense) đã khởi động và đang giám sát.');
}

bootstrap().catch((err) => {
  console.error('Lỗi khởi động TamperWatcher:', err);
  process.exit(1);
});
