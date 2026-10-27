import { Module } from '@nestjs/common';
import { AlertModule } from '../alert/alert.module';
import { CdcListenerService } from './cdc-listener.service';

@Module({
  imports: [AlertModule],
  providers: [CdcListenerService],
  exports: [CdcListenerService],
})
export class CdcModule {}
