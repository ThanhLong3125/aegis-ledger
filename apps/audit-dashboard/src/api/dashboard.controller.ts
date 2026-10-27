import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { DashboardService } from './dashboard.service';
import { SseService } from './sse.service';

@Controller('api')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly sseService: SseService
  ) {}

  @Get('overview')
  getOverview() {
    return this.dashboardService.getOverview();
  }

  @Get('epochs')
  getEpochs() {
    return this.dashboardService.getEpochs();
  }

  @Get('epochs/:epochNumber/tree')
  getEpochTree(@Param('epochNumber', ParseIntPipe) epochNumber: number) {
    return this.dashboardService.getEpochTree(epochNumber);
  }

  @Get('proof/:sequence')
  getProof(@Param('sequence', ParseIntPipe) sequence: number) {
    return this.dashboardService.getProof(sequence);
  }

  @Get('security/status')
  async getSecurityStatus() {
    const isLocked = await this.dashboardService.isDefenseLocked();
    return { isDefenseLocked: isLocked };
  }

  @Post('security/reset')
  resetSecurityStatus() {
    return this.dashboardService.resetDefenseLock();
  }

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return this.sseService.getStream() as Observable<MessageEvent>;
  }
}
