import { Module } from '@nestjs/common';
import { DefenseModule } from '../defense/defense.module';
import { TelegramService } from './telegram.service';
import { AlertDispatcherService } from './alert-dispatcher.service';

@Module({
  imports: [DefenseModule],
  providers: [TelegramService, AlertDispatcherService],
  exports: [TelegramService, AlertDispatcherService],
})
export class AlertModule {}
