import { Module } from '@nestjs/common';
import { DatabaseModule } from '@aegis/database';
import { ApiModule } from './api/api.module';

@Module({
  imports: [DatabaseModule, ApiModule],
})
export class AppModule {}
