import { Module, Global } from '@nestjs/common';
import { PrismaService } from './client/prisma.service';
import {
  AuditLogRepository,
  EpochBlockRepository,
  ExternalAnchorRepository,
} from './repositories';
import { EpochBatchService, WormManagerService } from './services';

@Global()
@Module({
  providers: [
    PrismaService,
    AuditLogRepository,
    EpochBlockRepository,
    ExternalAnchorRepository,
    EpochBatchService,
    WormManagerService,
  ],
  exports: [
    PrismaService,
    AuditLogRepository,
    EpochBlockRepository,
    ExternalAnchorRepository,
    EpochBatchService,
    WormManagerService,
  ],
})
export class DatabaseModule {}
