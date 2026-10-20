import { Global, Module } from '@nestjs/common';
import { WalletConfigService } from './wallet-config.service';

@Global()
@Module({
  providers: [WalletConfigService],
  exports: [WalletConfigService],
})
export class ConfigModule {}
