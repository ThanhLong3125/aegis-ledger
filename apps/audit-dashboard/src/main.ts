import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { join } from 'path';
import { existsSync } from 'fs';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('DashboardBootstrap');
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );

  app.enableCors({
    origin: '*',
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  });

  // Xác định đường dẫn thư mục public (hoạt động cả khi chạy ts-node dev lẫn dist build)
  const distPublic = join(__dirname, 'public');
  const srcPublic = join(process.cwd(), 'apps', 'audit-dashboard', 'src', 'public');
  const staticPath = existsSync(distPublic) ? distPublic : srcPublic;

  app.useStaticAssets({
    root: staticPath,
    prefix: '/',
  });
  logger.log(`Serving static assets with Fastify from: ${staticPath}`);

  const port = parseInt(process.env.PORT || process.env.DASHBOARD_PORT || '3333', 10);
  await app.listen({ port, host: '0.0.0.0' });
  logger.log(`🚀 Aegis Audit Dashboard (Fastify) is running on: http://localhost:${port}`);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
