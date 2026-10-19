import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { IEpochBlock, IAuditLogLeaf } from '@aegis/contracts';

export interface IEpochFormedEvent {
  epochBlock: IEpochBlock;
  logs: IAuditLogLeaf[];
  formedAt: string;
}

@Injectable()
export class EpochBroadcasterService {
  private readonly logger = new Logger(EpochBroadcasterService.name);
  private readonly epochSubject = new Subject<IEpochFormedEvent>();

  /**
   * Observable stream cho các consumer nội bộ hoặc WebSocket Gateway lắng nghe
   */
  get onEpochFormed$(): Observable<IEpochFormedEvent> {
    return this.epochSubject.asObservable();
  }

  /**
   * Phát thông báo khi một khối Epoch được chốt sổ thành công
   */
  broadcastEpoch(epochBlock: IEpochBlock, logs: IAuditLogLeaf[]): void {
    const event: IEpochFormedEvent = {
      epochBlock,
      logs,
      formedAt: new Date().toISOString(),
    };

    this.logger.log(
      `[BROADCAST] Khối Epoch #${epochBlock.epochNumber} đã chốt sổ thành công với ${logs.length} logs (Root: ${epochBlock.merkleRoot.substring(0, 16)}...)`
    );

    this.epochSubject.next(event);
  }
}
