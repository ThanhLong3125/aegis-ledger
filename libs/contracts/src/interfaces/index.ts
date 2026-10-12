import { AuditAction, BreachType, AlertSeverity } from '../enums';

export interface IActor {
  userId: string;
  role?: string;
  ipAddress: string;
  userAgent: string;
}

export interface IResource {
  type: string; // ví dụ: "WALLET", "USER", "ROLE"
  id: string;   // ví dụ: "wal_12345"
}

// 1. Event phát sinh từ nghiệp vụ (Kafka Ingestion)
export interface IAuditEvent {
  eventId: string;
  streamKey: string; // Key phân vùng Kafka (vd: walletId)
  timestamp: string; // ISO 8601 UTC
  actor: IActor;
  action: AuditAction | string;
  resource: IResource;
  payload: Record<string, any>;
}

// 2. Bản ghi Log (Lá Merkle trong PostgreSQL)
export interface IAuditLogLeaf {
  id: string;
  sequence: number;           // Số thứ tự tăng dần 1, 2, 3...
  epochNumber: number;        // Thuộc Epoch nào
  timestamp: string;          // ISO 8601 UTC
  actor: IActor;
  action: string;
  resource: IResource;
  payload: Record<string, any>;
  leafHash: string;           // SHA-256 của toàn bộ nội dung canonical
}

// 3. Khối Epoch Block (Merkle Root trong PostgreSQL)
export interface IEpochBlock {
  epochNumber: number;
  startSequence: number;
  endSequence: number;
  totalLogs: number;
  merkleRoot: string;         // Root hash của cây Merkle
  previousEpochRoot: string;  // Root của Epoch liền trước (xâu chuỗi)
  signature: string;          // Chữ ký Ed25519
  signerPublicKey: string;    // Public key dùng để verify
  anchored: boolean;          // Đã neo ra môi trường bất biến chưa
  anchorTxHash?: string;      // Hash mốc neo (nếu có)
  createdAt: string;
}

// 4. Bằng chứng kiểm toán O(log N)
export interface IMerkleProofStep {
  position: 'left' | 'right';
  hash: string;
}

export interface IMerkleProof {
  sequence: number;
  epochNumber: number;
  leafHash: string;
  merkleRoot: string;
  proof: IMerkleProofStep[];
}

// 5. Cảnh báo vi phạm CDC (Active Defense)
export interface ITamperAlert {
  alertId: string;
  severity: AlertSeverity;
  breachType: BreachType;
  targetTable: string;
  affectedId: string | number;
  detectedAt: string;
  message: string;
  details?: Record<string, any>;
}
