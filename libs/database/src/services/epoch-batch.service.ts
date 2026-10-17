import { Injectable, Logger } from '@nestjs/common';
import { IAuditLogLeaf, IEpochBlock } from '@aegis/contracts';
import { PrismaService } from '../client/prisma.service';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { EpochBlockRepository } from '../repositories/epoch-block.repository';

export interface ICommitEpochBatchResult {
  epochNumber: number;
  totalLogs: number;
  startSequence: number;
  endSequence: number;
  merkleRoot: string;
}

@Injectable()
export class EpochBatchService {
  private readonly logger = new Logger(EpochBatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly epochBlockRepo: EpochBlockRepository
  ) {}

  /**
   * Thực hiện lưu đồng thời toàn bộ các Lá (Logs) và Khối Epoch trong DUY NHẤT một Database Transaction.
   * Nếu có bất kỳ lỗi nào, toàn bộ Epoch và Logs sẽ bị Rollback hoàn toàn để bảo vệ tính toàn vẹn chuỗi.
   */
  async commitEpochBatch(params: {
    epochBlock: IEpochBlock;
    logs: IAuditLogLeaf[];
  }): Promise<ICommitEpochBatchResult> {
    const { epochBlock, logs } = params;

    if (!logs || logs.length === 0) {
      throw new Error('Cannot commit epoch batch with empty logs.');
    }

    if (logs.length !== epochBlock.totalLogs) {
      throw new Error(
        `Logs count mismatch: provided ${logs.length} logs but epochBlock declares ${epochBlock.totalLogs} logs.`
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        // 1. Lưu khối Epoch trước (đáp ứng foreign key constraint của audit_logs)
        await this.epochBlockRepo.create(epochBlock, tx);

        // 2. Bulk insert toàn bộ các lá vào audit_logs
        await this.auditLogRepo.insertLeaves(logs, tx);

        this.logger.log(
          `Committed Epoch #${epochBlock.epochNumber} atomically with ${logs.length} logs (Seq: ${epochBlock.startSequence}..${epochBlock.endSequence})`
        );

        return {
          epochNumber: epochBlock.epochNumber,
          totalLogs: logs.length,
          startSequence: epochBlock.startSequence,
          endSequence: epochBlock.endSequence,
          merkleRoot: epochBlock.merkleRoot,
        };
      },
      {
        isolationLevel: 'ReadCommitted',
        timeout: 10000,
      }
    );
  }
}
