import { Injectable } from '@nestjs/common';
import { Prisma, AuditLog } from '@prisma/client';
import { IAuditLogLeaf } from '@aegis/contracts';
import { PrismaService } from '../client/prisma.service';

@Injectable()
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Chuyển đổi từ Prisma Entity sang IAuditLogLeaf contract chuẩn
   */
  public toContract(record: AuditLog): IAuditLogLeaf {
    return {
      id: record.id,
      sequence: Number(record.sequence),
      epochNumber: Number(record.epochNumber),
      timestamp: record.timestamp.toISOString(),
      actor: record.actor as any,
      action: record.action,
      resource: record.resource as any,
      payload: record.payload as any,
      leafHash: record.leafHash,
    };
  }

  /**
   * Thêm một lá Merkle vào bảng audit_logs (Append-Only)
   */
  async insertLeaf(
    leaf: IAuditLogLeaf,
    tx?: Prisma.TransactionClient
  ): Promise<IAuditLogLeaf> {
    const client = tx || this.prisma;
    const created = await client.auditLog.create({
      data: {
        id: leaf.id,
        sequence: BigInt(leaf.sequence),
        epochNumber: BigInt(leaf.epochNumber),
        timestamp: new Date(leaf.timestamp),
        actor: leaf.actor as unknown as Prisma.InputJsonValue,
        action: leaf.action,
        resource: leaf.resource as unknown as Prisma.InputJsonValue,
        payload: leaf.payload as unknown as Prisma.InputJsonValue,
        leafHash: leaf.leafHash,
      },
    });

    return this.toContract(created);
  }

  /**
   * Bulk insert nhiều lá Merkle trong cùng một lô
   */
  async insertLeaves(
    leaves: IAuditLogLeaf[],
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    const client = tx || this.prisma;
    const result = await client.auditLog.createMany({
      data: leaves.map((leaf) => ({
        id: leaf.id,
        sequence: BigInt(leaf.sequence),
        epochNumber: BigInt(leaf.epochNumber),
        timestamp: new Date(leaf.timestamp),
        actor: leaf.actor as unknown as Prisma.InputJsonValue,
        action: leaf.action,
        resource: leaf.resource as unknown as Prisma.InputJsonValue,
        payload: leaf.payload as unknown as Prisma.InputJsonValue,
        leafHash: leaf.leafHash,
      })),
      skipDuplicates: false,
    });

    return result.count;
  }

  /**
   * Lấy lá theo số sequence cụ thể (phục vụ sinh Merkle Proof O(log N))
   */
  async findBySequence(sequence: number): Promise<IAuditLogLeaf | null> {
    const record = await this.prisma.auditLog.findUnique({
      where: { sequence: BigInt(sequence) },
    });
    return record ? this.toContract(record) : null;
  }

  /**
   * Lấy tất cả lá thuộc về một Epoch cụ thể
   */
  async findByEpoch(epochNumber: number): Promise<IAuditLogLeaf[]> {
    const records = await this.prisma.auditLog.findMany({
      where: { epochNumber: BigInt(epochNumber) },
      orderBy: { sequence: 'asc' },
    });
    return records.map((r) => this.toContract(r));
  }

  /**
   * Lấy danh sách lá trong một dải sequence [startSequence, endSequence]
   */
  async findRange(
    startSequence: number,
    endSequence: number
  ): Promise<IAuditLogLeaf[]> {
    const records = await this.prisma.auditLog.findMany({
      where: {
        sequence: {
          gte: BigInt(startSequence),
          lte: BigInt(endSequence),
        },
      },
      orderBy: { sequence: 'asc' },
    });
    return records.map((r) => this.toContract(r));
  }

  /**
   * Lấy số sequence lớn nhất hiện tại (dùng để xác định sequence tiếp theo)
   */
  async getLatestSequence(): Promise<number> {
    const latest = await this.prisma.auditLog.findFirst({
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    return latest ? Number(latest.sequence) : 0;
  }

  /**
   * Đếm tổng số lượng bản ghi log trong hệ thống
   */
  async count(): Promise<number> {
    return this.prisma.auditLog.count();
  }
}
