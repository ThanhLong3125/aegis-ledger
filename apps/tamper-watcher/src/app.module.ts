import { Module } from '@nestjs/common';
import { EventBusModule } from '@aegis/event-bus';
import { DatabaseModule } from '@aegis/database';
import { ConfigModule } from './config/config.module';
import { WatcherConfigService } from './config/watcher-config.service';
import { DefenseModule } from './defense/defense.module';
import { AlertModule } from './alert/alert.module';
import { CdcModule } from './cdc/cdc.module';
import { ScannerModule } from './scanner/scanner.module';

@Module({
  imports: [
    // 1. Cấu hình ứng dụng
    ConfigModule,

    // 2. Tầng Phòng vệ Chủ động (Active Defense)
    DefenseModule,

    // 3. Kafka Message Broker (Event Producer cho tamper alerts)
    EventBusModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: WatcherConfigService) => ({
        brokers: config.kafkaBrokers,
        clientId: config.kafkaClientId,
      }),
      inject: [WatcherConfigService],
    }),

    // 4. Tầng Database (Prisma WORM)
    DatabaseModule,

    // 5. Tầng Cảnh báo (Telegram & Dispatcher)
    AlertModule,

    // 6. Tầng CDC Logical Replication Listener
    CdcModule,

    // 7. Tầng Integrity Scanner
    ScannerModule,
  ],
})
export class AppModule {}
