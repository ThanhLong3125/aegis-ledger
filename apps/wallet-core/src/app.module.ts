import { Module } from '@nestjs/common';
import { EventBusModule } from '@aegis/event-bus';
import { ConfigModule } from './config/config.module';
import { WalletConfigService } from './config/wallet-config.service';
import { DefenseModule } from './defense/defense.module';
import { AuthModule } from './auth/auth.module';
import { WalletsModule } from './wallets/wallets.module';

@Module({
  imports: [
    // 1. Cấu hình ứng dụng
    ConfigModule,

    // 2. Tầng Tự vệ Chủ động (Active Defense - Redis)
    DefenseModule,

    // 3. Kafka Message Broker (Event Producer)
    EventBusModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: WalletConfigService) => ({
        brokers: config.kafkaBrokers,
        clientId: config.kafkaClientId,
      }),
      inject: [WalletConfigService],
    }),

    // 4. Các module nghiệp vụ
    AuthModule,
    WalletsModule,
  ],
})
export class AppModule {}
