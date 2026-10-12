import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsObject,
  ValidateNested,
  IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ActorDto, ResourceDto } from './audit-event.dto';
import { IAuditLogLeaf } from '../interfaces';

export class AuditLogLeafDto implements IAuditLogLeaf {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsNumber()
  @IsPositive()
  sequence!: number;

  @IsNumber()
  @IsPositive()
  epochNumber!: number;

  @IsISO8601()
  @IsNotEmpty()
  timestamp!: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor!: ActorDto;

  @IsString()
  @IsNotEmpty()
  action!: string;

  @ValidateNested()
  @Type(() => ResourceDto)
  resource!: ResourceDto;

  @IsObject()
  payload!: Record<string, any>;

  @IsString()
  @IsNotEmpty()
  leafHash!: string;
}
