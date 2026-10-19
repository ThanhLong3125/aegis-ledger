import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  generateEd25519KeyPair,
  signEpochRoot,
  verifyEpochSignature,
  exportPublicKeyRawHex,
} from '@aegis/crypto-core';
import { LedgerConfigService } from '../config/ledger-config.service';

@Injectable()
export class ValidatorKeyProvider implements OnModuleInit {
  private readonly logger = new Logger(ValidatorKeyProvider.name);
  private privateKeyPem!: string;
  private publicKeyPem!: string;
  private publicKeyRawHex!: string;
  private initialized = false;

  constructor(private readonly configService: LedgerConfigService) {
    this.ensureKeysLoaded();
  }

  onModuleInit(): void {
    this.ensureKeysLoaded();
  }

  private ensureKeysLoaded(): void {
    if (this.initialized) return;

    const envPrivKey = this.configService.validatorPrivateKey;
    const envPubKey = this.configService.validatorPublicKey;

    if (envPrivKey && envPubKey) {
      this.privateKeyPem = envPrivKey.replace(/\\n/g, '\n');
      this.publicKeyPem = envPubKey.replace(/\\n/g, '\n');
      this.logger.log('Đã nạp Validator Ed25519 Key Pair thành công từ biến môi trường.');
    } else {
      this.logger.warn(
        'Không tìm thấy VALIDATOR_PRIVATE_KEY trong cấu hình. Tự động sinh cặp khóa Ed25519 mới dùng cho phiên làm việc.'
      );
      const generated = generateEd25519KeyPair();
      this.privateKeyPem = generated.privateKey;
      this.publicKeyPem = generated.publicKey;
    }

    this.publicKeyRawHex = exportPublicKeyRawHex(this.publicKeyPem);
    this.initialized = true;
  }

  /**
   * Lấy Public Key dạng Raw Hex (32 bytes = 64 ký tự hex) lưu vào cột signer_public_key VarChar(64)
   */
  getPublicKey(): string {
    this.ensureKeysLoaded();
    return this.publicKeyRawHex;
  }

  /**
   * Lấy Public Key dạng chuẩn SPKI PEM
   */
  getPublicKeyPem(): string {
    this.ensureKeysLoaded();
    return this.publicKeyPem;
  }

  /**
   * Lấy Private Key PEM (nội bộ thẩm quyền)
   */
  getPrivateKey(): string {
    this.ensureKeysLoaded();
    return this.privateKeyPem;
  }

  /**
   * Ký số thẩm quyền lên cấu trúc phong bì Epoch
   */
  signEpoch(
    epochNumber: number,
    merkleRoot: string,
    previousEpochRoot: string
  ): string {
    this.ensureKeysLoaded();
    return signEpochRoot(
      epochNumber,
      merkleRoot,
      previousEpochRoot,
      this.privateKeyPem
    );
  }

  /**
   * Xác minh chữ ký của một Epoch Block
   */
  verifyEpoch(
    epochNumber: number,
    merkleRoot: string,
    previousEpochRoot: string,
    signatureHex: string,
    publicKeyInput?: string
  ): boolean {
    this.ensureKeysLoaded();
    return verifyEpochSignature(
      epochNumber,
      merkleRoot,
      previousEpochRoot,
      signatureHex,
      publicKeyInput || this.publicKeyRawHex
    );
  }
}
