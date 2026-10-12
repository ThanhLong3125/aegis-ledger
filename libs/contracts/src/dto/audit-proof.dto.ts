import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsArray,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IMerkleProof, IMerkleProofStep } from '../interfaces';

export class MerkleProofStepDto implements IMerkleProofStep {
  @IsString()
  @IsIn(['left', 'right'])
  position!: 'left' | 'right';

  @IsString()
  @IsNotEmpty()
  hash!: string;
}

export class MerkleProofDto implements IMerkleProof {
  @IsNumber()
  @IsPositive()
  sequence!: number;

  @IsNumber()
  @IsPositive()
  epochNumber!: number;

  @IsString()
  @IsNotEmpty()
  leafHash!: string;

  @IsString()
  @IsNotEmpty()
  merkleRoot!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MerkleProofStepDto)
  proof!: MerkleProofStepDto[];
}
