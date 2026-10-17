import { Injectable } from '@nestjs/common';
import { Prisma, EpochBlock } from '@prisma/client';
import { IEpochBlock } from '@aegis/contracts';
import { PrismaService } from '../client/prisma.service';

@Injectable()
export class EpochBlockRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Chuyển đổi từ Prisma Model sang IEpochBlock contract chuẩn
   */
  public toContract(record: EpochBlock): IEpochBlock {
    return {
      epochNumber: Number(record.epochNumber),
      startSequence: Number(record.startSequence),
      endSequence: Number(record.endSequence),
      totalLogs: record.totalLogs,
      merkleRoot: record.merkleRoot,
      previousEpochRoot: record.previousEpochRoot,
      signature: record.signature,
      signerPublicKey: record.signerPublicKey,
      anchored: record.anchored,
      anchorTxHash: record.anchorTxHash ?? undefined,
      createdAt: record.createdAt.toISOString(),
    };
  }

  /**
   * Thêm một khối Epoch mới
   */
  async create(
    block: IEpochBlock,
    tx?: Prisma.TransactionClient
  ): Promise<IEpochBlock> {
    const client = tx || this.prisma;
    const created = await client.epochBlock.create({
      data: {
        epochNumber: BigInt(block.epochNumber),
        startSequence: BigInt(block.startSequence),
        endSequence: BigInt(block.endSequence),
        totalLogs: block.totalLogs,
        merkleRoot: block.merkleRoot,
        previousEpochRoot: block.previousEpochRoot,
        signature: block.signature,
        signerPublicKey: block.signerPublicKey,
        anchored: block.anchored,
        anchorTxHash: block.anchorTxHash,
        createdAt: block.createdAt ? new Date(block.createdAt) : new Date(),
      },
    });

    return this.toContract(created);
  }

  /**
   * Tìm khối Epoch theo số thứ tự epochNumber
   */
  async findByEpochNumber(epochNumber: number): Promise<IEpochBlock | null> {
    const record = await this.prisma.epochBlock.findUnique({
      where: { epochNumber: BigInt(epochNumber) },
    });
    return record ? this.toContract(record) : null;
  }

  /**
   * Lấy khối Epoch mới nhất (dùng để lấy previousEpochRoot cho Epoch tiếp theo)
   */
  async findLatest(): Promise<IEpochBlock | null> {
    const record = await this.prisma.epochBlock.findFirst({
      orderBy: { epochNumber: 'desc' },
    });
    return record ? this.toContract(record) : null;
  }

  /**
   * Cập nhật trạng thái neo ngoại vi (Thao tác UPDATE duy nhất được phép theo WORM trigger)
   */
  async markAnchored(
    epochNumber: number,
    anchorTxHash: string
  ): Promise<IEpochBlock> {
    const updated = await this.prisma.epochBlock.update({
      where: { epochNumber: BigInt(epochNumber) },
      data: {
        anchored: true,
        anchorTxHash,
      },
    });
    return this.toContract(updated);
  }

  /**
   * Lấy danh sách khối Epoch theo trang
   */
  async findAll(limit = 50, offset = 0): Promise<IEpochBlock[]> {
    const records = await this.prisma.epochBlock.findMany({
      orderBy: { epochNumber: 'desc' },
      take: limit,
      skip: offset,
    });
    return records.map((r) => this.toContract(r));
  }

  /**
   * Đếm tổng số Epoch
   */
  async count(): Promise<number> {
    return this.prisma.epochBlock.count();
  }
}
