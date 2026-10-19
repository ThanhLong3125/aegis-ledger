import { Module } from '@nestjs/common';
import { EngineModule } from '../engine/engine.module';
import { SlidingWindowService } from './sliding-window.service';

@Module({
  imports: [EngineModule],
  providers: [SlidingWindowService],
  exports: [SlidingWindowService],
})
export class BufferModule {}
