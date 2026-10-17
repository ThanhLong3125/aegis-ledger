import { Injectable } from '@nestjs/common';
import { ExternalAnchor } from '@prisma/client';
import { PrismaService } from '../client/prisma.service';

export interface IExternalAnchorData {
  id?: string;
  epochNumber: number;
  merkleRoot: string;
  anchorType: string;
  txHash: string;
  anchoredAt?: string;
}

@Injectable()
export class ExternalAnchorRepository {
  constructor(private readonly prisma: PrismaService) {}

  public toDto(record: ExternalAnchor): IExternalAnchorData {
    return {
      id: record.id,
      epochNumber: Number(record.epochNumber),
      merkleRoot: record.merkleRoot,
      anchorType: record.anchorType,
      txHash: record.txHash,
      anchoredAt: record.anchoredAt.toISOString(),
    };
  }

  async create(data: IExternalAnchorData): Promise<IExternalAnchorData> {
    const created = await this.prisma.externalAnchor.create({
      data: {
        id: data.id,
        epochNumber: BigInt(data.epochNumber),
        merkleRoot: data.merkleRoot,
        anchorType: data.anchorType,
        txHash: data.txHash,
        anchoredAt: data.anchoredAt ? new Date(data.anchoredAt) : new Date(),
      },
    });
    return this.toDto(created);
  }

  async findByEpochNumber(epochNumber: number): Promise<IExternalAnchorData | null> {
    const record = await this.prisma.externalAnchor.findFirst({
      where: { epochNumber: BigInt(epochNumber) },
    });
    return record ? this.toDto(record) : null;
  }

  async findAll(): Promise<IExternalAnchorData[]> {
    const records = await this.prisma.externalAnchor.findMany({
      orderBy: { epochNumber: 'desc' },
    });
    return records.map((r) => this.toDto(r));
  }
}
