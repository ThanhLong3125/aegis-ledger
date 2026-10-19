export interface ILedgerConfig {
  nodeEnv: string;
  port: number;
  kafkaBrokers: string[];
  kafkaClientId: string;
  kafkaGroupId: string;
  kafkaTopic: string;
  epochMaxBatchSize: number;
  epochMaxWaitMs: number;
  validatorPrivateKey?: string;
  validatorPublicKey?: string;
}

export const DEFAULT_LEDGER_CONFIG: ILedgerConfig = {
  nodeEnv: 'development',
  port: 3001,
  kafkaBrokers: ['localhost:9092'],
  kafkaClientId: 'aegis-audit-ledger',
  kafkaGroupId: 'aegis-audit-ledger-group',
  kafkaTopic: 'audit.events',
  epochMaxBatchSize: 10,
  epochMaxWaitMs: 2000,
};
