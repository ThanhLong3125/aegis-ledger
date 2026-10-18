import { ModuleMetadata, Type } from '@nestjs/common';

export interface IRetryOptions {
  maxRetryTime?: number;
  initialRetryTime?: number;
  factor?: number;
  multiplier?: number;
  retries?: number;
}

export interface KafkaConfigOptions {
  brokers: string[];
  clientId: string;
  connectionTimeout?: number;
  requestTimeout?: number;
  retry?: IRetryOptions;
  ssl?: boolean;
  dlqEnabled?: boolean;
  defaultDlqTopic?: string;
  sourceService?: string;
}

export interface KafkaConfigOptionsFactory {
  createKafkaOptions(): Promise<KafkaConfigOptions> | KafkaConfigOptions;
}

export interface KafkaConfigAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useExisting?: Type<KafkaConfigOptionsFactory>;
  useClass?: Type<KafkaConfigOptionsFactory>;
  useFactory?: (...args: any[]) => Promise<KafkaConfigOptions> | KafkaConfigOptions;
  inject?: any[];
}
