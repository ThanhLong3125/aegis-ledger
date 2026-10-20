export interface IWalletConfig {
  nodeEnv: string;
  port: number;
  kafkaBrokers: string[];
  kafkaClientId: string;
  kafkaTopic: string;
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  activeDefenseLockKey: string;
}

export const DEFAULT_WALLET_CONFIG: IWalletConfig = {
  nodeEnv: 'development',
  port: 3000,
  kafkaBrokers: ['localhost:9092'],
  kafkaClientId: 'aegis-wallet-core',
  kafkaTopic: 'audit.events',
  redisHost: 'localhost',
  redisPort: 6379,
  redisPassword: 'aegis_redis_pass_2026',
  activeDefenseLockKey: 'AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS',
};
