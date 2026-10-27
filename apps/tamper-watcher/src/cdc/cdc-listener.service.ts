import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Client } from 'pg';
import * as crypto from 'node:crypto';
import { AlertSeverity, BreachType, TamperAlertDto } from '@aegis/contracts';
import { WatcherConfigService } from '../config/watcher-config.service';
import { AlertDispatcherService } from '../alert/alert-dispatcher.service';
import { CdcEventParser } from './cdc-event.parser';

@Injectable()
export class CdcListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CdcListenerService.name);
  private pgClient: Client | null = null;
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly config: WatcherConfigService,
    private readonly alertDispatcher: AlertDispatcherService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.startListener();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopListener();
  }

  async startListener(): Promise<void> {
    if (this.isRunning) return;

    try {
      this.pgClient = new Client({
        host: this.config.postgresHost,
        port: this.config.postgresPort,
        user: this.config.postgresUser,
        password: this.config.postgresPassword,
        database: this.config.postgresDb,
      });

      await this.pgClient.connect();
      this.logger.log('Đã kết nối thành công tới PostgreSQL CDC stream.');

      // Khởi tạo replication slot nếu chưa tồn tại
      await this.ensureReplicationSlot();

      this.isRunning = true;
      this.scheduleNextPoll(100);
    } catch (err: any) {
      this.logger.error(`Không thể khởi động CDC Listener: ${err.message}. Tiếp tục thử lại sau...`);
      // Thử kết nối lại sau 3s nếu DB chưa sẵn sàng
      setTimeout(() => void this.startListener(), 3000);
    }
  }

  async stopListener(): Promise<void> {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.pgClient) {
      await this.pgClient.end().catch(() => {});
      this.pgClient = null;
    }
    this.logger.log('Đã dừng PostgreSQL CDC Listener an toàn.');
  }

  private async ensureReplicationSlot(): Promise<void> {
    if (!this.pgClient) return;

    const slotName = this.config.replicationSlotName;
    const query = `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = '${slotName}') THEN
          PERFORM pg_create_logical_replication_slot('${slotName}', 'test_decoding');
        END IF;
      END
      $$;
    `;

    await this.pgClient.query(query);
    this.logger.log(`Replication slot [${slotName}] đã sẵn sàng.`);
  }

  private scheduleNextPoll(delayMs: number): void {
    if (!this.isRunning) return;

    this.pollTimer = setTimeout(() => {
      void this.pollCdcChanges();
    }, delayMs);
  }

  /**
   * Quét và tiêu thụ các bản ghi WAL mới từ PostgreSQL Logical Replication Slot
   */
  async pollCdcChanges(): Promise<number> {
    if (!this.isRunning || !this.pgClient || this.isProcessing) {
      return 0;
    }

    this.isProcessing = true;
    let changeCount = 0;

    try {
      const slotName = this.config.replicationSlotName;
      const res = await this.pgClient.query(
        `SELECT lsn, xid, data FROM pg_logical_slot_get_changes($1, NULL, NULL);`,
        [slotName]
      );

      changeCount = res.rows.length;

      for (const row of res.rows) {
        await this.handleWalRecord(row.data);
      }
    } catch (err: any) {
      this.logger.error(`Lỗi đọc CDC changes từ replication slot: ${err.message}`);
    } finally {
      this.isProcessing = false;
      this.scheduleNextPoll(this.config.cdcPollIntervalMs);
    }

    return changeCount;
  }

  /**
   * Xử lý từng dòng log WAL thô và phân loại vi phạm an ninh
   */
  async handleWalRecord(rawData: string): Promise<void> {
    const event = CdcEventParser.parse(rawData);
    if (!event) {
      return; // Bỏ qua BEGIN, COMMIT hoặc DDL không thuộc đối tượng theo dõi
    }

    const monitoredTables = ['audit_logs', 'epoch_blocks', 'external_anchors'];
    if (!monitoredTables.includes(event.table)) {
      return;
    }

    const getAffectedId = () =>
      event.columns['id'] ||
      event.columns['sequence_number'] ||
      event.columns['sequence'] ||
      event.columns['epoch_number'] ||
      'unknown';

    // 1. Phát hiện hành vi UPDATE trái phép trên bảng WORM
    if (event.operation === 'UPDATE') {
      const isEpochBlock = event.table === 'epoch_blocks';
      const breachType = isEpochBlock
        ? BreachType.HISTORICAL_REWRITE
        : BreachType.UNAUTHORIZED_UPDATE;

      const alert: TamperAlertDto = {
        alertId: `alt_${crypto.randomUUID()}`,
        severity: AlertSeverity.CRITICAL,
        breachType,
        targetTable: event.table,
        affectedId: getAffectedId(),
        detectedAt: new Date().toISOString(),
        message: `CẢNH BÁO XÂM PHẠM CẤP ĐỘ CAO: Phát hiện lệnh SQL UPDATE trái phép trên bảng Append-Only [${event.table}] qua WAL stream!`,
        details: {
          rawEvent: rawData,
          columns: event.columns,
        },
      };

      await this.alertDispatcher.dispatchBreachAlert(alert);
    }

    // 2. Phát hiện hành vi DELETE trái phép
    if (event.operation === 'DELETE') {
      const alert: TamperAlertDto = {
        alertId: `alt_${crypto.randomUUID()}`,
        severity: AlertSeverity.CRITICAL,
        breachType: BreachType.UNAUTHORIZED_DELETE,
        targetTable: event.table,
        affectedId: getAffectedId(),
        detectedAt: new Date().toISOString(),
        message: `CẢNH BÁO XÂM PHẠM CẤP ĐỘ CAO: Phát hiện lệnh SQL DELETE tiêu hủy bản ghi trên bảng WORM [${event.table}]!`,
        details: {
          rawEvent: rawData,
          columns: event.columns,
        },
      };

      await this.alertDispatcher.dispatchBreachAlert(alert);
    }
  }
}
