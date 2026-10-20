import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ActiveDefenseGuard } from '../defense/active-defense.guard';
import { ClientInfo, IClientInfo } from '../common/client-info.decorator';
import { WalletsService } from './wallets.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { TransferDto } from './dto/transfer.dto';

@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createWallet(
    @Body() dto: CreateWalletDto,
    @ClientInfo() clientInfo: IClientInfo
  ) {
    return this.walletsService.createWallet(dto, clientInfo);
  }

  @Get(':id')
  getWallet(@Param('id') id: string) {
    return this.walletsService.getWallet(id);
  }

  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  async deposit(
    @Body() dto: DepositDto,
    @ClientInfo() clientInfo: IClientInfo
  ) {
    return this.walletsService.deposit(dto, clientInfo);
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ActiveDefenseGuard) // Bị chặn nếu Redis bật Active Defense
  async withdraw(
    @Body() dto: WithdrawDto,
    @ClientInfo() clientInfo: IClientInfo
  ) {
    return this.walletsService.withdraw(dto, clientInfo);
  }

  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ActiveDefenseGuard) // Bị chặn nếu Redis bật Active Defense
  async transfer(
    @Body() dto: TransferDto,
    @ClientInfo() clientInfo: IClientInfo
  ) {
    return this.walletsService.transfer(dto, clientInfo);
  }

  @Get(':id/history')
  getHistory(@Param('id') id: string) {
    return this.walletsService.getHistory(id);
  }
}
