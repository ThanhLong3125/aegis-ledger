import { Module } from '@nestjs/common';
import { ValidatorKeyProvider } from './validator-key.provider';

@Module({
  providers: [ValidatorKeyProvider],
  exports: [ValidatorKeyProvider],
})
export class KeysModule {}
