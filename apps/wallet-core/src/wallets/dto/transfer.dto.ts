import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

export class TransferDto {
  @IsString()
  @IsNotEmpty()
  fromWalletId!: string;

  @IsString()
  @IsNotEmpty()
  toWalletId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;
}
