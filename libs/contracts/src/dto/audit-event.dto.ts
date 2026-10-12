import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsObject,
  ValidateNested,
  IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AuditAction } from '../enums';
import { IActor, IResource, IAuditEvent } from '../interfaces';

export class ActorDto implements IActor {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsOptional()
  role?: string;

  @IsString()
  @IsNotEmpty()
  ipAddress!: string;

  @IsString()
  @IsNotEmpty()
  userAgent!: string;
}

export class ResourceDto implements IResource {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsNotEmpty()
  id!: string;
}

export class AuditEventDto implements IAuditEvent {
  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  streamKey!: string;

  @IsISO8601()
  @IsNotEmpty()
  timestamp!: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor!: ActorDto;

  @IsNotEmpty()
  action!: AuditAction | string;

  @ValidateNested()
  @Type(() => ResourceDto)
  resource!: ResourceDto;

  @IsObject()
  payload!: Record<string, any>;
}
