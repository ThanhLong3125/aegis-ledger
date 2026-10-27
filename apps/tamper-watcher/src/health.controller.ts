import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'tamper-watcher',
      engine: 'fastify',
      timestamp: new Date().toISOString(),
    };
  }
}
