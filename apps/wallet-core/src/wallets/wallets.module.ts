import { Module } from '@nestjs/common';
import { DefenseModule } from '../defense/defense.module';
import { WalletStore } from './store/wallet.store';
import { WalletsService } from './wallets.service';
import { WalletsController } from './wallets.controller';

@Module({
  imports: [DefenseModule],
  controllers: [WalletsController],
  providers: [WalletStore, WalletsService],
  exports: [WalletsService, WalletStore],
})
export class WalletsModule {}
