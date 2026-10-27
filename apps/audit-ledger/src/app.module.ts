import { Module } from '@nestjs/common';
import { EventBusModule } from '@aegis/event-bus';
import { DatabaseModule } from '@aegis/database';
import { HealthController } from './health.controller';

import { ConfigModule } from './config/config.module';
import { LedgerConfigService } from './config/ledger-config.service';
import { KeysModule } from './keys/keys.module';
import { PersistenceModule } from './outbound/persistence/persistence.module';
import { BroadcasterModule } from './outbound/broadcaster/broadcaster.module';
import { EngineModule } from './engine/engine.module';
import { BufferModule } from './buffer/buffer.module';
import { InboundModule } from './inbound/inbound.module';

@Module({
  imports: [
    // 1. Cấu hình
    ConfigModule,

    // 2. Cơ sở dữ liệu WORM
    DatabaseModule,

    // 3. Message Stream Kafka
    EventBusModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: LedgerConfigService) => ({
        brokers: config.kafkaBrokers,
        clientId: config.kafkaClientId,
      }),
      inject: [LedgerConfigService],
    }),

    // 4. Lõi nghiệp vụ & Mật mã
    KeysModule,
    PersistenceModule,
    BroadcasterModule,
    EngineModule,
    BufferModule,
    InboundModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
