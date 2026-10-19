import { Injectable, Logger } from '@nestjs/common';
import { EpochPersistenceService, GENESIS_EPOCH_ROOT } from '../outbound/persistence/epoch-persistence.service';

@Injectable()
export class SequenceTrackerService {
  private readonly logger = new Logger(SequenceTrackerService.name);
  private currentSequence = 0;
  private currentEpochNumber = 0;
  private currentPreviousRoot = GENESIS_EPOCH_ROOT;
  private isInitialized = false;

  constructor(private readonly persistenceService: EpochPersistenceService) {}

  /**
   * Khởi tạo đồng bộ sequence và epochNumber từ Database
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const state = await this.persistenceService.getLatestState();
    this.currentSequence = state.latestSequence;
    this.currentEpochNumber = state.latestEpochNumber;
    this.currentPreviousRoot = state.latestMerkleRoot;
    this.isInitialized = true;

    this.logger.log(
      `SequenceTracker đã sẵn sàng: Epoch hiện tại = #${this.currentEpochNumber}, Sequence hiện tại = #${this.currentSequence}`
    );
  }

  get initialized(): boolean {
    return this.isInitialized;
  }

  getCurrentSequence(): number {
    return this.currentSequence;
  }

  getCurrentEpochNumber(): number {
    return this.currentEpochNumber;
  }

  getPreviousRoot(): string {
    return this.currentPreviousRoot;
  }

  /**
   * Cấp phát dải sequence cho một batch mới
   */
  reserveNextBatch(count: number): {
    nextEpochNumber: number;
    startSequence: number;
    endSequence: number;
    previousEpochRoot: string;
  } {
    if (!this.isInitialized) {
      throw new Error('SequenceTrackerService chưa được khởi tạo từ Database!');
    }

    const nextEpochNumber = this.currentEpochNumber + 1;
    const startSequence = this.currentSequence + 1;
    const endSequence = this.currentSequence + count;
    const previousEpochRoot = this.currentPreviousRoot;

    return {
      nextEpochNumber,
      startSequence,
      endSequence,
      previousEpochRoot,
    };
  }

  /**
   * Cập nhật trạng thái sau khi commit DB thành công
   */
  confirmBatchCommitted(
    newEpochNumber: number,
    endSequence: number,
    newMerkleRoot: string
  ): void {
    this.currentEpochNumber = newEpochNumber;
    this.currentSequence = endSequence;
    this.currentPreviousRoot = newMerkleRoot;
  }
}
