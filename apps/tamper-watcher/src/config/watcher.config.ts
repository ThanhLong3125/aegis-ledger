export interface IWatcherConfig {
  kafkaBrokers: string[];
  kafkaClientId: string;
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  activeDefenseLockKey: string;
  postgresHost: string;
  postgresPort: number;
  postgresUser: string;
  postgresPassword?: string;
  postgresDb: string;
  replicationSlotName: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  scanIntervalMs: number;
  cdcPollIntervalMs: number;
}

export const loadWatcherConfig = (): IWatcherConfig => {
  return {
    kafkaBrokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    kafkaClientId: process.env.KAFKA_CLIENT_ID || 'aegis-tamper-watcher',
    redisHost: process.env.REDIS_HOST || 'localhost',
    redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
    redisPassword: process.env.REDIS_PASSWORD || 'aegis_redis_pass_2026',
    activeDefenseLockKey:
      process.env.ACTIVE_DEFENSE_LOCK_KEY || 'AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS',
    postgresHost: process.env.POSTGRES_HOST || 'localhost',
    postgresPort: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    postgresUser: process.env.POSTGRES_USER || 'aegis_admin',
    postgresPassword: process.env.POSTGRES_PASSWORD || 'aegis_secure_password_2026',
    postgresDb: process.env.POSTGRES_DB || 'aegis_ledger_db',
    replicationSlotName: process.env.REPLICATION_SLOT_NAME || 'aegis_tamper_watcher_slot',
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
    scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS || '10000', 10),
    cdcPollIntervalMs: parseInt(process.env.CDC_POLL_INTERVAL_MS || '100', 10),
  };
};
