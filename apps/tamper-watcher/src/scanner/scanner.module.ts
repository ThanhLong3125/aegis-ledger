import { Module } from '@nestjs/common';
import { DatabaseModule } from '@aegis/database';
import { AlertModule } from '../alert/alert.module';
import { IntegrityScannerService } from './integrity-scanner.service';

@Module({
  imports: [DatabaseModule, AlertModule],
  providers: [IntegrityScannerService],
  exports: [IntegrityScannerService],
})
export class ScannerModule {}
