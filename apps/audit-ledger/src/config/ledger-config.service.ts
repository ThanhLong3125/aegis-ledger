import { Injectable, Logger } from '@nestjs/common';
import { ILedgerConfig, DEFAULT_LEDGER_CONFIG } from './ledger.config';

@Injectable()
export class LedgerConfigService {
  private readonly logger = new Logger(LedgerConfigService.name);
  private readonly config: ILedgerConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): ILedgerConfig {
    const rawBrokers = process.env.KAFKA_BROKERS;
    const kafkaBrokers = rawBrokers
      ? rawBrokers.split(',').map((b) => b.trim()).filter(Boolean)
      : DEFAULT_LEDGER_CONFIG.kafkaBrokers;

    const rawBatchSize = process.env.EPOCH_MAX_BATCH_SIZE;
    const epochMaxBatchSize = rawBatchSize ? parseInt(rawBatchSize, 10) : DEFAULT_LEDGER_CONFIG.epochMaxBatchSize;

    const rawWaitMs = process.env.EPOCH_MAX_WAIT_MS;
    const epochMaxWaitMs = rawWaitMs ? parseInt(rawWaitMs, 10) : DEFAULT_LEDGER_CONFIG.epochMaxWaitMs;

    const rawPort = process.env.PORT;
    const port = rawPort ? parseInt(rawPort, 10) : DEFAULT_LEDGER_CONFIG.port;

    return {
      nodeEnv: process.env.NODE_ENV || DEFAULT_LEDGER_CONFIG.nodeEnv,
      port,
      kafkaBrokers,
      kafkaClientId: process.env.KAFKA_CLIENT_ID || DEFAULT_LEDGER_CONFIG.kafkaClientId,
      kafkaGroupId: process.env.KAFKA_GROUP_ID || DEFAULT_LEDGER_CONFIG.kafkaGroupId,
      kafkaTopic: process.env.KAFKA_TOPIC || DEFAULT_LEDGER_CONFIG.kafkaTopic,
      epochMaxBatchSize: isNaN(epochMaxBatchSize) || epochMaxBatchSize < 1 ? 10 : epochMaxBatchSize,
      epochMaxWaitMs: isNaN(epochMaxWaitMs) || epochMaxWaitMs < 100 ? 2000 : epochMaxWaitMs,
      validatorPrivateKey: process.env.VALIDATOR_PRIVATE_KEY,
      validatorPublicKey: process.env.VALIDATOR_PUBLIC_KEY,
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

  get kafkaGroupId(): string {
    return this.config.kafkaGroupId;
  }

  get kafkaTopic(): string {
    return this.config.kafkaTopic;
  }

  get epochMaxBatchSize(): number {
    return this.config.epochMaxBatchSize;
  }

  get epochMaxWaitMs(): number {
    return this.config.epochMaxWaitMs;
  }

  get validatorPrivateKey(): string | undefined {
    return this.config.validatorPrivateKey;
  }

  get validatorPublicKey(): string | undefined {
    return this.config.validatorPublicKey;
  }
}
