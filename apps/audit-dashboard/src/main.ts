import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { join } from 'path';
import { existsSync } from 'fs';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('DashboardBootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });

  // Xác định đường dẫn thư mục public (hoạt động cả khi chạy ts-node dev lẫn dist build)
  const distPublic = join(__dirname, 'public');
  const srcPublic = join(process.cwd(), 'apps', 'audit-dashboard', 'src', 'public');
  const staticPath = existsSync(distPublic) ? distPublic : srcPublic;

  app.useStaticAssets(staticPath);
  logger.log(`Serving static assets from: ${staticPath}`);

  const port = process.env.PORT || process.env.DASHBOARD_PORT || 3333;
  await app.listen(port);
  logger.log(`Aegis Audit Dashboard is running on: http://localhost:${port}`);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
