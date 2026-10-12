import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  AuditEventDto,
  AuditLogLeafDto,
  EpochBlockDto,
  MerkleProofDto,
  TamperAlertDto,
  AuditAction,
  BreachType,
  AlertSeverity,
} from './index';

describe('Contracts Library Validation Tests', () => {
  describe('AuditEventDto', () => {
    it('should validate a valid audit event successfully', async () => {
      const plain = {
        eventId: '018f3a55-2244-7f12-9ab2-000000000001',
        streamKey: 'wal_user_999',
        timestamp: new Date().toISOString(),
        actor: {
          userId: 'user_123',
          role: 'ADMIN',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0 Chrome',
        },
        action: AuditAction.WALLET_TRANSFER,
        resource: {
          type: 'WALLET',
          id: 'wal_user_999',
        },
        payload: {
          amount: 50000,
          currency: 'VND',
        },
      };

      const dto = plainToInstance(AuditEventDto, plain);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail if required fields are missing', async () => {
      const plain = {
        eventId: '018f3a55-2244-7f12-9ab2-000000000001',
        // thiếu timestamp, actor, action...
      };

      const dto = plainToInstance(AuditEventDto, plain);
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('EpochBlockDto', () => {
    it('should validate a valid epoch block', async () => {
      const plain = {
        epochNumber: 1,
        startSequence: 1,
        endSequence: 7,
        totalLogs: 7,
        merkleRoot: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
        previousEpochRoot: '0000000000000000000000000000000000000000000000000000000000000000',
        signature: 'mock_ed25519_signature_base64_string',
        signerPublicKey: 'mock_ed25519_public_key',
        anchored: false,
        createdAt: new Date().toISOString(),
      };

      const dto = plainToInstance(EpochBlockDto, plain);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('TamperAlertDto', () => {
    it('should validate an alert event for CDC unauthorized update', async () => {
      const plain = {
        alertId: '018f3a55-2244-7f12-9ab2-000000000002',
        severity: AlertSeverity.CRITICAL,
        breachType: BreachType.UNAUTHORIZED_UPDATE,
        targetTable: 'audit_logs',
        affectedId: 'leaf_sequence_5',
        detectedAt: new Date().toISOString(),
        message: 'Direct SQL UPDATE detected on append-only audit_logs table via WAL replication',
      };

      const dto = plainToInstance(TamperAlertDto, plain);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('MerkleProofDto', () => {
    it('should validate a valid Merkle proof structure', async () => {
      const plain = {
        sequence: 3,
        epochNumber: 1,
        leafHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        merkleRoot: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
        proof: [
          { position: 'left', hash: 'd41d8cd98f00b204e9800998ecf8427e' },
          { position: 'right', hash: '900150983cd24fb0d6963f7d28e17f72' },
        ],
      };

      const dto = plainToInstance(MerkleProofDto, plain);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });
});
