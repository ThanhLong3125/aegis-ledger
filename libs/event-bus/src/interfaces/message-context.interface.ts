export interface IMessageContext {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
  key: string | null;
  headers: Record<string, string | undefined>;
}

export interface IPoisonPillEnvelope {
  originalTopic: string;
  originalKey: string | null;
  failedAt: string;
  errorReason: string;
  rawPayload: string;
  headers?: Record<string, string | undefined>;
}
