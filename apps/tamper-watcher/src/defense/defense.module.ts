import { Module } from '@nestjs/common';
import { ActiveDefenseService } from './active-defense.service';

@Module({
  providers: [ActiveDefenseService],
  exports: [ActiveDefenseService],
})
export class DefenseModule {}
