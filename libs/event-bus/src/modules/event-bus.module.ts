import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { KafkaClientFactory, EVENT_BUS_OPTIONS } from '../services/kafka-client.factory';
import { KafkaProducerService } from '../services/kafka-producer.service';
import { KafkaConsumerService } from '../services/kafka-consumer.service';
import {
  KafkaConfigOptions,
  KafkaConfigAsyncOptions,
  KafkaConfigOptionsFactory,
} from '../interfaces/event-bus-options.interface';

@Global()
@Module({
  providers: [KafkaClientFactory, KafkaProducerService, KafkaConsumerService],
  exports: [KafkaProducerService, KafkaConsumerService, KafkaClientFactory],
})
export class EventBusModule {
  /**
   * Cấu hình đồng bộ EventBusModule
   */
  static forRoot(options?: KafkaConfigOptions): DynamicModule {
    return {
      module: EventBusModule,
      providers: [
        {
          provide: EVENT_BUS_OPTIONS,
          useValue: options || {},
        },
        KafkaClientFactory,
        KafkaProducerService,
        KafkaConsumerService,
      ],
      exports: [KafkaProducerService, KafkaConsumerService, KafkaClientFactory],
    };
  }

  /**
   * Cấu hình bất đồng bộ EventBusModule (qua useFactory, useClass...)
   */
  static forRootAsync(asyncOptions: KafkaConfigAsyncOptions): DynamicModule {
    const asyncProviders = this.createAsyncProviders(asyncOptions);

    return {
      module: EventBusModule,
      imports: asyncOptions.imports || [],
      providers: [
        ...asyncProviders,
        KafkaClientFactory,
        KafkaProducerService,
        KafkaConsumerService,
      ],
      exports: [KafkaProducerService, KafkaConsumerService, KafkaClientFactory],
    };
  }

  private static createAsyncProviders(asyncOptions: KafkaConfigAsyncOptions): Provider[] {
    if (asyncOptions.useFactory) {
      return [
        {
          provide: EVENT_BUS_OPTIONS,
          useFactory: asyncOptions.useFactory,
          inject: asyncOptions.inject || [],
        },
      ];
    }

    if (asyncOptions.useClass) {
      return [
        {
          provide: EVENT_BUS_OPTIONS,
          useFactory: async (optionsFactory: KafkaConfigOptionsFactory) =>
            await optionsFactory.createKafkaOptions(),
          inject: [asyncOptions.useClass],
        },
        {
          provide: asyncOptions.useClass,
          useClass: asyncOptions.useClass,
        },
      ];
    }

    if (asyncOptions.useExisting) {
      return [
        {
          provide: EVENT_BUS_OPTIONS,
          useFactory: async (optionsFactory: KafkaConfigOptionsFactory) =>
            await optionsFactory.createKafkaOptions(),
          inject: [asyncOptions.useExisting],
        },
      ];
    }

    return [
      {
        provide: EVENT_BUS_OPTIONS,
        useValue: {},
      },
    ];
  }
}
