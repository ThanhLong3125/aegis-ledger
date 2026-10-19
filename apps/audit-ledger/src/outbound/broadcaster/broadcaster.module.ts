import { Module } from '@nestjs/common';
import { EpochBroadcasterService } from './epoch-broadcaster.service';

@Module({
  providers: [EpochBroadcasterService],
  exports: [EpochBroadcasterService],
})
export class BroadcasterModule {}
