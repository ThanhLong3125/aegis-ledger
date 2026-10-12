import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsObject,
  IsISO8601,
} from 'class-validator';
import { BreachType, AlertSeverity } from '../enums';
import { ITamperAlert } from '../interfaces';

export class TamperAlertDto implements ITamperAlert {
  @IsString()
  @IsNotEmpty()
  alertId!: string;

  @IsEnum(AlertSeverity)
  severity!: AlertSeverity;

  @IsEnum(BreachType)
  breachType!: BreachType;

  @IsString()
  @IsNotEmpty()
  targetTable!: string;

  @IsNotEmpty()
  affectedId!: string | number;

  @IsISO8601()
  @IsNotEmpty()
  detectedAt!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsObject()
  @IsOptional()
  details?: Record<string, any>;
}
