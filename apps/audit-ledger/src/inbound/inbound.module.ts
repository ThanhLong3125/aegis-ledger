import { Module } from '@nestjs/common';
import { BufferModule } from '../buffer/buffer.module';
import { AuditEventConsumer } from './audit-event.consumer';

@Module({
  imports: [BufferModule],
  providers: [AuditEventConsumer],
  exports: [AuditEventConsumer],
})
export class InboundModule {}
