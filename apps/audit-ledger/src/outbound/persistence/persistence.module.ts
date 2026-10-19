import { Module } from '@nestjs/common';
import { DatabaseModule } from '@aegis/database';
import { EpochPersistenceService } from './epoch-persistence.service';

@Module({
  imports: [DatabaseModule],
  providers: [EpochPersistenceService],
  exports: [EpochPersistenceService, DatabaseModule],
})
export class PersistenceModule {}
