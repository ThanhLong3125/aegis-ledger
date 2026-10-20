import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

export class DepositDto {
  @IsString()
  @IsNotEmpty()
  walletId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;
}
