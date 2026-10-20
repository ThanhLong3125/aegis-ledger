import { Module } from '@nestjs/common';
import { RedisDefenseService } from './redis-defense.service';
import { ActiveDefenseGuard } from './active-defense.guard';

@Module({
  providers: [RedisDefenseService, ActiveDefenseGuard],
  exports: [RedisDefenseService, ActiveDefenseGuard],
})
export class DefenseModule {}
