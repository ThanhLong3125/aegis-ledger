import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface IDashboardEvent {
  type: 'epoch:new' | 'security:breach' | 'security:reset' | 'ping';
  data: any;
  timestamp?: string;
}

@Injectable()
export class SseService {
  private readonly eventSubject = new Subject<IDashboardEvent>();

  /**
   * Phát sự kiện thời gian thực tới tất cả các trình duyệt đang mở Dashboard
   */
  emit(event: IDashboardEvent): void {
    this.eventSubject.next({
      ...event,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Lấy luồng SSE (Server-Sent Events)
   */
  getStream(): Observable<{ data: IDashboardEvent }> {
    return this.eventSubject.asObservable().pipe(
      map((event) => ({
        data: event,
      }))
    );
  }
}
