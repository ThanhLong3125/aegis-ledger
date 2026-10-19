import { Global, Module } from '@nestjs/common';
import { LedgerConfigService } from './ledger-config.service';

@Global()
@Module({
  providers: [LedgerConfigService],
  exports: [LedgerConfigService],
})
export class ConfigModule {}
