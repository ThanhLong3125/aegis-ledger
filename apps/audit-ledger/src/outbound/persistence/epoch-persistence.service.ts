import { Injectable, Logger } from '@nestjs/common';
import { IEpochBlock, IAuditLogLeaf } from '@aegis/contracts';
import {
  EpochBatchService,
  EpochBlockRepository,
  AuditLogRepository,
  ICommitEpochBatchResult,
} from '@aegis/database';

export interface ILatestLedgerState {
  latestEpochNumber: number;
  latestSequence: number;
  latestMerkleRoot: string;
}

export const GENESIS_EPOCH_ROOT = '0000000000000000000000000000000000000000000000000000000000000000';

@Injectable()
export class EpochPersistenceService {
  private readonly logger = new Logger(EpochPersistenceService.name);

  constructor(
    private readonly epochBatchService: EpochBatchService,
    private readonly epochBlockRepo: EpochBlockRepository,
    private readonly auditLogRepo: AuditLogRepository
  ) {}

  /**
   * Lấy trạng thái mới nhất từ cơ sở dữ liệu khi khởi động service
   */
  async getLatestState(): Promise<ILatestLedgerState> {
    const latestEpoch = await this.epochBlockRepo.findLatest();
    const latestSeq = await this.auditLogRepo.getLatestSequence();

    if (!latestEpoch) {
      this.logger.log('Cơ sở dữ liệu chưa có Epoch nào. Khởi tạo trạng thái Genesis.');
      return {
        latestEpochNumber: 0,
        latestSequence: latestSeq,
        latestMerkleRoot: GENESIS_EPOCH_ROOT,
      };
    }

    this.logger.log(
      `Đã nạp trạng thái: Epoch #${latestEpoch.epochNumber}, Seq #${latestSeq}, Root: ${latestEpoch.merkleRoot.substring(0, 16)}...`
    );

    return {
      latestEpochNumber: latestEpoch.epochNumber,
      latestSequence: latestSeq,
      latestMerkleRoot: latestEpoch.merkleRoot,
    };
  }

  /**
   * Thực hiện lưu đồng thời toàn bộ logs và epoch block trong 1 Transaction duy nhất
   */
  async commitEpoch(params: {
    epochBlock: IEpochBlock;
    logs: IAuditLogLeaf[];
  }): Promise<ICommitEpochBatchResult> {
    try {
      return await this.epochBatchService.commitEpochBatch(params);
    } catch (err: any) {
      this.logger.error(
        `[CRITICAL] Lỗi khi commit Epoch #${params.epochBlock.epochNumber} vào PostgreSQL WORM: ${err.message}`,
        err.stack
      );
      throw err;
    }
  }
}
