import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsBoolean,
  IsOptional,
  IsISO8601,
} from 'class-validator';
import { IEpochBlock } from '../interfaces';

export class EpochBlockDto implements IEpochBlock {
  @IsNumber()
  @IsPositive()
  epochNumber!: number;

  @IsNumber()
  @IsPositive()
  startSequence!: number;

  @IsNumber()
  @IsPositive()
  endSequence!: number;

  @IsNumber()
  @IsPositive()
  totalLogs!: number;

  @IsString()
  @IsNotEmpty()
  merkleRoot!: string;

  @IsString()
  @IsNotEmpty()
  previousEpochRoot!: string;

  @IsString()
  @IsNotEmpty()
  signature!: string;

  @IsString()
  @IsNotEmpty()
  signerPublicKey!: string;

  @IsBoolean()
  anchored!: boolean;

  @IsString()
  @IsOptional()
  anchorTxHash?: string;

  @IsISO8601()
  @IsNotEmpty()
  createdAt!: string;
}
