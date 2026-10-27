import { Module } from '@nestjs/common';
import { DatabaseModule } from '@aegis/database';
import { SseService } from './sse.service';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [DashboardController],
  providers: [SseService, DashboardService],
  exports: [SseService, DashboardService],
})
export class ApiModule {}
