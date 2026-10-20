import { Injectable, Logger } from '@nestjs/common';
import { IWalletConfig, DEFAULT_WALLET_CONFIG } from './wallet.config';

@Injectable()
export class WalletConfigService {
  private readonly logger = new Logger(WalletConfigService.name);
  private readonly config: IWalletConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): IWalletConfig {
    const rawBrokers = process.env.KAFKA_BROKERS;
    const kafkaBrokers = rawBrokers
      ? rawBrokers.split(',').map((b) => b.trim()).filter(Boolean)
      : DEFAULT_WALLET_CONFIG.kafkaBrokers;

    const rawPort = process.env.PORT || process.env.WALLET_CORE_PORT;
    const port = rawPort ? parseInt(rawPort, 10) : DEFAULT_WALLET_CONFIG.port;

    const rawRedisPort = process.env.REDIS_PORT;
    const redisPort = rawRedisPort ? parseInt(rawRedisPort, 10) : DEFAULT_WALLET_CONFIG.redisPort;

    return {
      nodeEnv: process.env.NODE_ENV || DEFAULT_WALLET_CONFIG.nodeEnv,
      port: isNaN(port) ? DEFAULT_WALLET_CONFIG.port : port,
      kafkaBrokers,
      kafkaClientId: process.env.KAFKA_CLIENT_ID || DEFAULT_WALLET_CONFIG.kafkaClientId,
      kafkaTopic: process.env.KAFKA_TOPIC || DEFAULT_WALLET_CONFIG.kafkaTopic,
      redisHost: process.env.REDIS_HOST || DEFAULT_WALLET_CONFIG.redisHost,
      redisPort: isNaN(redisPort) ? DEFAULT_WALLET_CONFIG.redisPort : redisPort,
      redisPassword: process.env.REDIS_PASSWORD || DEFAULT_WALLET_CONFIG.redisPassword,
      activeDefenseLockKey:
        process.env.ACTIVE_DEFENSE_LOCK_KEY || DEFAULT_WALLET_CONFIG.activeDefenseLockKey,
    };
  }

  get isDevelopment(): boolean {
    return this.config.nodeEnv !== 'production';
  }

  get port(): number {
    return this.config.port;
  }

  get kafkaBrokers(): string[] {
    return this.config.kafkaBrokers;
  }

  get kafkaClientId(): string {
    return this.config.kafkaClientId;
  }

  get kafkaTopic(): string {
    return this.config.kafkaTopic;
  }

  get redisHost(): string {
    return this.config.redisHost;
  }

  get redisPort(): number {
    return this.config.redisPort;
  }

  get redisPassword(): string | undefined {
    return this.config.redisPassword;
  }

  get activeDefenseLockKey(): string {
    return this.config.activeDefenseLockKey;
  }
}
