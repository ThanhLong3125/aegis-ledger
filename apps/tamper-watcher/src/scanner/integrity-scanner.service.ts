import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { PrismaService } from '@aegis/database';
import { AlertSeverity, BreachType, TamperAlertDto } from '@aegis/contracts';
import { verifyEpochSignature } from '@aegis/crypto-core';
import { WatcherConfigService } from '../config/watcher-config.service';
import { AlertDispatcherService } from '../alert/alert-dispatcher.service';

@Injectable()
export class IntegrityScannerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IntegrityScannerService.name);
  private scanTimer: NodeJS.Timeout | null = null;
  private isScanning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WatcherConfigService,
    private readonly alertDispatcher: AlertDispatcherService
  ) {}

  onModuleInit(): void {
    // Khởi động vòng quét định kỳ
    this.scanTimer = setInterval(() => {
      void this.runFullScan().catch((err) => {
        this.logger.error(`Lỗi trong tiến trình quét toàn vẹn: ${err.message}`);
      });
    }, this.config.scanIntervalMs);

    this.logger.log(
      `Cryptographic Integrity Scanner đã sẵn sàng (Chu kỳ quét: ${this.config.scanIntervalMs}ms).`
    );
  }

  onModuleDestroy(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
  }

  /**
   * Thực thi quét toàn diện tính toàn vẹn của chuỗi mật mã:
   * 1. Sequence Continuity trên audit_logs (Phát hiện SEQUENCE_GAP)
   * 2. Hash Chain Continuity trên epoch_blocks (Phát hiện HISTORICAL_REWRITE)
   * 3. Chữ ký số Ed25519 trên epoch_blocks (Phát hiện SIGNATURE_FORGERY)
   */
  async runFullScan(): Promise<{
    breachesFound: number;
    checkedLogs: number;
    checkedEpochs: number;
  }> {
    if (this.isScanning) {
      return { breachesFound: 0, checkedLogs: 0, checkedEpochs: 0 };
    }

    this.isScanning = true;
    let breachesFound = 0;
    let checkedLogs = 0;
    let checkedEpochs = 0;

    try {
      // 1. Kiểm tra Sequence Continuity trên audit_logs
      const logs = await this.prisma.auditLog.findMany({
        orderBy: { sequence: 'asc' },
        select: { id: true, sequence: true, leafHash: true },
      });
      checkedLogs = logs.length;

      let expectedSeq = 1n;
      for (const log of logs) {
        if (log.sequence !== expectedSeq) {
          breachesFound++;
          const alert: TamperAlertDto = {
            alertId: `alt_${crypto.randomUUID()}`,
            severity: AlertSeverity.CRITICAL,
            breachType: BreachType.SEQUENCE_GAP,
            targetTable: 'audit_logs',
            affectedId: expectedSeq.toString(),
            detectedAt: new Date().toISOString(),
            message: `PHÁT HIỆN GÃY CHUỖI SEQUENCE: Kỳ vọng log #${expectedSeq} nhưng nhận được log #${log.sequence}. Dữ liệu đã bị xóa trái phép!`,
            details: {
              expectedSequence: Number(expectedSeq),
              actualSequence: Number(log.sequence),
              brokenLogId: log.id,
            },
          };
          await this.alertDispatcher.dispatchBreachAlert(alert);
          expectedSeq = log.sequence; // Cập nhật để tiếp tục kiểm tra phần còn lại
        }
        expectedSeq++;
      }

      // 2. Kiểm tra Hash Chain và Chữ ký số Ed25519 trên epoch_blocks
      const epochs = await this.prisma.epochBlock.findMany({
        orderBy: { epochNumber: 'asc' },
      });
      checkedEpochs = epochs.length;

      for (let i = 0; i < epochs.length; i++) {
        const current = epochs[i];
        const epochNum = Number(current.epochNumber);

        // 2a. Đối chiếu Hash Chain (previous_epoch_root)
        if (i > 0) {
          const previous = epochs[i - 1];
          if (current.previousEpochRoot !== previous.merkleRoot) {
            breachesFound++;
            const alert: TamperAlertDto = {
              alertId: `alt_${crypto.randomUUID()}`,
              severity: AlertSeverity.CRITICAL,
              breachType: BreachType.HISTORICAL_REWRITE,
              targetTable: 'epoch_blocks',
              affectedId: epochNum,
              detectedAt: new Date().toISOString(),
              message: `PHÁT HIỆN ĐỨT GÃY HASH CHAIN: previous_epoch_root của Epoch #${epochNum} không khớp với merkle_root của Epoch #${Number(
                previous.epochNumber
              )}!`,
              details: {
                epochNumber: epochNum,
                expectedPreviousRoot: previous.merkleRoot,
                actualPreviousRoot: current.previousEpochRoot,
              },
            };
            await this.alertDispatcher.dispatchBreachAlert(alert);
          }
        }

        // 2b. Kiểm tra Chữ ký số Ed25519
        const isValidSignature = verifyEpochSignature(
          epochNum,
          current.merkleRoot,
          current.previousEpochRoot,
          current.signature,
          current.signerPublicKey
        );

        if (!isValidSignature) {
          breachesFound++;
          const alert: TamperAlertDto = {
            alertId: `alt_${crypto.randomUUID()}`,
            severity: AlertSeverity.CRITICAL,
            breachType: BreachType.SIGNATURE_FORGERY,
            targetTable: 'epoch_blocks',
            affectedId: epochNum,
            detectedAt: new Date().toISOString(),
            message: `PHÁT HIỆN GIẢ MẠO CHỮ KÝ: Chữ ký số Ed25519 của Epoch #${epochNum} không hợp lệ với public key được lưu trữ!`,
            details: {
              epochNumber: epochNum,
              merkleRoot: current.merkleRoot,
              signature: current.signature,
              signerPublicKey: current.signerPublicKey,
            },
          };
          await this.alertDispatcher.dispatchBreachAlert(alert);
        }
      }
    } finally {
      this.isScanning = false;
    }

    return { breachesFound, checkedLogs, checkedEpochs };
  }
}
