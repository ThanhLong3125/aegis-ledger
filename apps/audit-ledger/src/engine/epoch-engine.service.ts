import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { IAuditEvent, IAuditLogLeaf, IEpochBlock } from '@aegis/contracts';
import { hashLeaf, MerkleTree } from '@aegis/crypto-core';
import { SequenceTrackerService } from './sequence-tracker.service';
import { ValidatorKeyProvider } from '../keys/validator-key.provider';
import { EpochPersistenceService } from '../outbound/persistence/epoch-persistence.service';
import { EpochBroadcasterService } from '../outbound/broadcaster/epoch-broadcaster.service';

export interface IProcessEpochResult {
  epochBlock: IEpochBlock;
  logs: IAuditLogLeaf[];
}

@Injectable()
export class EpochEngineService implements OnModuleInit {
  private readonly logger = new Logger(EpochEngineService.name);

  constructor(
    private readonly sequenceTracker: SequenceTrackerService,
    private readonly validatorKeyProvider: ValidatorKeyProvider,
    private readonly persistenceService: EpochPersistenceService,
    private readonly broadcasterService: EpochBroadcasterService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.sequenceTracker.initialize();
  }

  /**
   * Chốt sổ một danh sách sự kiện thành một khối Epoch hoàn chỉnh
   */
  async processBatch(events: IAuditEvent[]): Promise<IProcessEpochResult> {
    if (!events || events.length === 0) {
      throw new Error('Không thể chốt Epoch với danh sách sự kiện rỗng.');
    }

    if (!this.sequenceTracker.initialized) {
      await this.sequenceTracker.initialize();
    }

    const {
      nextEpochNumber,
      startSequence,
      endSequence,
      previousEpochRoot,
    } = this.sequenceTracker.reserveNextBatch(events.length);

    // 1. Chuyển đổi từng AuditEvent thành AuditLogLeaf và tính leafHash với domain separation
    const logs: IAuditLogLeaf[] = events.map((event, index) => {
      const sequence = startSequence + index;
      const id = event.eventId || crypto.randomUUID();
      const timestamp = event.timestamp || new Date().toISOString();

      const leafCanonicalPayload = {
        id,
        sequence,
        epochNumber: nextEpochNumber,
        timestamp,
        actor: event.actor,
        action: event.action,
        resource: event.resource,
        payload: event.payload,
      };

      const calculatedLeafHash = hashLeaf(leafCanonicalPayload);

      return {
        id,
        sequence,
        epochNumber: nextEpochNumber,
        timestamp,
        actor: event.actor,
        action: event.action,
        resource: event.resource,
        payload: event.payload,
        leafHash: calculatedLeafHash,
      };
    });

    // 2. Dựng Cây Merkle từ danh sách leafHash
    const leafHashes = logs.map((log) => log.leafHash);
    const merkleTree = new MerkleTree(leafHashes);
    const merkleRoot = merkleTree.getRoot();

    // 3. Ký số Ed25519 lên phong bì Epoch (epochNumber, merkleRoot, previousEpochRoot)
    const signature = this.validatorKeyProvider.signEpoch(
      nextEpochNumber,
      merkleRoot,
      previousEpochRoot
    );
    const signerPublicKey = this.validatorKeyProvider.getPublicKey();

    // 4. Tạo đối tượng EpochBlock
    const epochBlock: IEpochBlock = {
      epochNumber: nextEpochNumber,
      startSequence,
      endSequence,
      totalLogs: logs.length,
      merkleRoot,
      previousEpochRoot,
      signature,
      signerPublicKey,
      anchored: false,
      createdAt: new Date().toISOString(),
    };

    // 5. Lưu đồng thời (Atomic) vào cơ sở dữ liệu PostgreSQL WORM
    await this.persistenceService.commitEpoch({
      epochBlock,
      logs,
    });

    // 6. Cập nhật trạng thái bộ nhớ của SequenceTracker
    this.sequenceTracker.confirmBatchCommitted(
      nextEpochNumber,
      endSequence,
      merkleRoot
    );

    // 7. Bắn tín hiệu broadcast thông báo Epoch mới hình thành
    this.broadcasterService.broadcastEpoch(epochBlock, logs);

    return {
      epochBlock,
      logs,
    };
  }
}
