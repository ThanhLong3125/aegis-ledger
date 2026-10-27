import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { WalletConfigService } from './config/wallet-config.service';

async function bootstrap() {
  const logger = new Logger('WalletCoreBootstrap');
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    })
  );

  app.enableCors();
  app.enableShutdownHooks();

  const config = app.get(WalletConfigService);
  const port = config.port;

  await app.listen({ port, host: '0.0.0.0' });
  logger.log(`🚀 AegisLedger Wallet Core Service (Fastify) đã sẵn sàng chạy tại http://localhost:${port}`);
}

bootstrap().catch((err) => {
  console.error('Lỗi khởi động Wallet Core:', err);
  process.exit(1);
});
