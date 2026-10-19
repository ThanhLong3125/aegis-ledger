import { Module } from '@nestjs/common';
import { KeysModule } from '../keys/keys.module';
import { PersistenceModule } from '../outbound/persistence/persistence.module';
import { BroadcasterModule } from '../outbound/broadcaster/broadcaster.module';
import { SequenceTrackerService } from './sequence-tracker.service';
import { EpochEngineService } from './epoch-engine.service';

@Module({
  imports: [KeysModule, PersistenceModule, BroadcasterModule],
  providers: [SequenceTrackerService, EpochEngineService],
  exports: [SequenceTrackerService, EpochEngineService],
})
export class EngineModule {}
