import { Injectable } from '@nestjs/common';
import { IWatcherConfig, loadWatcherConfig } from './watcher.config';

@Injectable()
export class WatcherConfigService {
  private readonly config: IWatcherConfig;

  constructor() {
    this.config = loadWatcherConfig();
  }

  get kafkaBrokers(): string[] {
    return this.config.kafkaBrokers;
  }

  get kafkaClientId(): string {
    return this.config.kafkaClientId;
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

  get postgresHost(): string {
    return this.config.postgresHost;
  }

  get postgresPort(): number {
    return this.config.postgresPort;
  }

  get postgresUser(): string {
    return this.config.postgresUser;
  }

  get postgresPassword(): string | undefined {
    return this.config.postgresPassword;
  }

  get postgresDb(): string {
    return this.config.postgresDb;
  }

  get replicationSlotName(): string {
    return this.config.replicationSlotName;
  }

  get telegramBotToken(): string | undefined {
    return this.config.telegramBotToken;
  }

  get telegramChatId(): string | undefined {
    return this.config.telegramChatId;
  }

  get scanIntervalMs(): number {
    return this.config.scanIntervalMs;
  }

  get cdcPollIntervalMs(): number {
    return this.config.cdcPollIntervalMs;
  }
}
