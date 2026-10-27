import { Global, Module } from '@nestjs/common';
import { WatcherConfigService } from './watcher-config.service';

@Global()
@Module({
  providers: [WatcherConfigService],
  exports: [WatcherConfigService],
})
export class ConfigModule {}
