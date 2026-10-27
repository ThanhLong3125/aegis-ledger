import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import * as crypto from 'node:crypto';
import {
  generateEd25519KeyPair,
  signEpochRoot,
  exportPublicKeyRawHex,
  hashLeaf,
  MerkleTree,
} from '@aegis/crypto-core';

const prisma = new PrismaClient();

async function main() {
  console.log('================================================================');
  console.log('   AEGIS LEDGER - SEED DEMO DATA & GENESIS INITIALIZATION      ');
  console.log('================================================================');

  // 1. Tạm thời tắt triggers để dọn sạch dữ liệu cũ phục vụ demo
  console.log('\n[1/5] Dọn dẹp dữ liệu cũ trong cơ sở dữ liệu...');
  await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" DISABLE TRIGGER USER;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "epoch_blocks" DISABLE TRIGGER USER;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "external_anchors" DISABLE TRIGGER USER;`);

  await prisma.externalAnchor.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.epochBlock.deleteMany({});

  await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" ENABLE TRIGGER USER;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "epoch_blocks" ENABLE TRIGGER USER;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "external_anchors" ENABLE TRIGGER USER;`);
  console.log('  -> Đã làm sạch các bảng WORM và tái kích hoạt Security Triggers.');

  // 2. Sinh cặp khóa Validator Ed25519
  console.log('\n[2/5] Khởi tạo cặp khóa Validator Ed25519...');
  const keyPair = generateEd25519KeyPair();
  const signerPublicKeyRawHex = exportPublicKeyRawHex(keyPair.publicKey);
  console.log(`  -> Validator Public Key: ${signerPublicKeyRawHex}`);

  // 3. Tạo Epoch #0 (Sequences 1 -> 5)
  console.log('\n[3/5] Khởi tạo Epoch #0 (5 giao dịch tài chính khởi nguyên)...');
  const epoch0LogsData = [
    {
      actor: { userId: 'usr_alice', ipAddress: '192.168.1.10', userAgent: 'AegisWeb/1.0' },
      action: 'USER_LOGIN_SUCCESS',
      resource: { entity: 'auth_session', entityId: 'sess_alice_01' },
      payload: { method: 'password_2fa', status: 'authenticated' },
    },
    {
      actor: { userId: 'usr_alice', ipAddress: '192.168.1.10', userAgent: 'AegisWeb/1.0' },
      action: 'WALLET_DEPOSIT',
      resource: { entity: 'wallet', entityId: 'wal_alice_usd' },
      payload: { amount: 1000, currency: 'USD', bankRef: 'VN_VCB_992182' },
    },
    {
      actor: { userId: 'usr_bob', ipAddress: '10.0.0.5', userAgent: 'AegisMobile/2.4' },
      action: 'USER_LOGIN_SUCCESS',
      resource: { entity: 'auth_session', entityId: 'sess_bob_01' },
      payload: { method: 'biometric_fido2', status: 'authenticated' },
    },
    {
      actor: { userId: 'usr_bob', ipAddress: '10.0.0.5', userAgent: 'AegisMobile/2.4' },
      action: 'WALLET_DEPOSIT',
      resource: { entity: 'wallet', entityId: 'wal_bob_usd' },
      payload: { amount: 500, currency: 'USD', bankRef: 'VN_TCB_441920' },
    },
    {
      actor: { userId: 'usr_alice', ipAddress: '192.168.1.10', userAgent: 'AegisWeb/1.0' },
      action: 'WALLET_TRANSFER',
      resource: { entity: 'wallet', entityId: 'wal_alice_usd' },
      payload: { toWalletId: 'wal_bob_usd', amount: 200, currency: 'USD', note: 'Split lunch' },
    },
  ];

  const epoch0Logs = epoch0LogsData.map((data, idx) => {
    const seq = idx + 1;
    const id = crypto.randomUUID();
    const timestamp = new Date(Date.now() - 3600 * 1000 + idx * 60000).toISOString();
    const leafCanonical = {
      id,
      sequence: seq,
      epochNumber: 0,
      timestamp,
      actor: data.actor,
      action: data.action,
      resource: data.resource,
      payload: data.payload,
    };
    const leafHash = hashLeaf(leafCanonical);
    return {
      id,
      sequence: BigInt(seq),
      epochNumber: BigInt(0),
      timestamp: new Date(timestamp),
      actor: data.actor,
      action: data.action,
      resource: data.resource,
      payload: data.payload,
      leafHash,
    };
  });

  const epoch0Leaves = epoch0Logs.map((l) => l.leafHash);
  const epoch0Tree = new MerkleTree(epoch0Leaves);
  const epoch0Root = epoch0Tree.getRoot();
  const GENESIS_PREV_ROOT = '0'.repeat(64);
  const epoch0Sig = signEpochRoot(0, epoch0Root, GENESIS_PREV_ROOT, keyPair.privateKey);

  // Lưu Epoch #0
  await prisma.epochBlock.create({
    data: {
      epochNumber: BigInt(0),
      startSequence: BigInt(1),
      endSequence: BigInt(5),
      totalLogs: 5,
      merkleRoot: epoch0Root,
      previousEpochRoot: GENESIS_PREV_ROOT,
      signature: epoch0Sig,
      signerPublicKey: signerPublicKeyRawHex,
      anchored: true,
      anchorTxHash: '0x3a9f8b2c4d6e8a0f1b3c5d7e9a2b4c6e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c',
    },
  });

  await prisma.auditLog.createMany({
    data: epoch0Logs,
  });

  await prisma.externalAnchor.create({
    data: {
      epochNumber: BigInt(0),
      anchorType: 'ETHEREUM_SEPOLIA',
      merkleRoot: epoch0Root,
      txHash: '0x3a9f8b2c4d6e8a0f1b3c5d7e9a2b4c6e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c',
    },
  });
  console.log(`  -> Epoch #0 committed (Root: ${epoch0Root.substring(0, 16)}..., Anchored: OK)`);

  // 4. Tạo Epoch #1 (Sequences 6 -> 10)
  console.log('\n[4/5] Khởi tạo Epoch #1 (5 giao dịch tài chính tiếp theo)...');
  const epoch1LogsData = [
    {
      actor: { userId: 'usr_bob', ipAddress: '10.0.0.5', userAgent: 'AegisMobile/2.4' },
      action: 'WALLET_WITHDRAW',
      resource: { entity: 'wallet', entityId: 'wal_bob_usd' },
      payload: { amount: 150, currency: 'USD', targetAtm: 'ATM_HN_019' },
    },
    {
      actor: { userId: 'usr_alice', ipAddress: '192.168.1.10', userAgent: 'AegisWeb/1.0' },
      action: 'WALLET_TRANSFER',
      resource: { entity: 'wallet', entityId: 'wal_alice_usd' },
      payload: { toWalletId: 'wal_bob_usd', amount: 50, currency: 'USD', note: 'Coffee' },
    },
    {
      actor: { userId: 'usr_charlie', ipAddress: '172.16.0.4', userAgent: 'AegisCLI/1.0' },
      action: 'USER_LOGIN_SUCCESS',
      resource: { entity: 'auth_session', entityId: 'sess_charlie_01' },
      payload: { method: 'api_key_ed25519', status: 'authenticated' },
    },
    {
      actor: { userId: 'usr_charlie', ipAddress: '172.16.0.4', userAgent: 'AegisCLI/1.0' },
      action: 'WALLET_DEPOSIT',
      resource: { entity: 'wallet', entityId: 'wal_charlie_usd' },
      payload: { amount: 5000, currency: 'USD', bankRef: 'INTL_SWIFT_992' },
    },
    {
      actor: { userId: 'usr_alice', ipAddress: '192.168.1.10', userAgent: 'AegisWeb/1.0' },
      action: 'USER_LOGOUT',
      resource: { entity: 'auth_session', entityId: 'sess_alice_01' },
      payload: { durationSeconds: 3600 },
    },
  ];

  const epoch1Logs = epoch1LogsData.map((data, idx) => {
    const seq = idx + 6;
    const id = crypto.randomUUID();
    const timestamp = new Date(Date.now() - 1800 * 1000 + idx * 60000).toISOString();
    const leafCanonical = {
      id,
      sequence: seq,
      epochNumber: 1,
      timestamp,
      actor: data.actor,
      action: data.action,
      resource: data.resource,
      payload: data.payload,
    };
    const leafHash = hashLeaf(leafCanonical);
    return {
      id,
      sequence: BigInt(seq),
      epochNumber: BigInt(1),
      timestamp: new Date(timestamp),
      actor: data.actor,
      action: data.action,
      resource: data.resource,
      payload: data.payload,
      leafHash,
    };
  });

  const epoch1Leaves = epoch1Logs.map((l) => l.leafHash);
  const epoch1Tree = new MerkleTree(epoch1Leaves);
  const epoch1Root = epoch1Tree.getRoot();
  const epoch1Sig = signEpochRoot(1, epoch1Root, epoch0Root, keyPair.privateKey);

  await prisma.epochBlock.create({
    data: {
      epochNumber: BigInt(1),
      startSequence: BigInt(6),
      endSequence: BigInt(10),
      totalLogs: 5,
      merkleRoot: epoch1Root,
      previousEpochRoot: epoch0Root,
      signature: epoch1Sig,
      signerPublicKey: signerPublicKeyRawHex,
      anchored: true,
      anchorTxHash: '0x992b4c6e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c',
    },
  });

  await prisma.auditLog.createMany({
    data: epoch1Logs,
  });

  await prisma.externalAnchor.create({
    data: {
      epochNumber: BigInt(1),
      anchorType: 'RFC3161_TSA',
      merkleRoot: epoch1Root,
      txHash: '0x992b4c6e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c',
    },
  });
  console.log(`  -> Epoch #1 committed (Root: ${epoch1Root.substring(0, 16)}..., Anchored: OK)`);

  // 5. Reset cờ Active Defense trên Redis
  console.log('\n[5/5] Reset cờ bảo vệ Active Defense trên Redis...');
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || 'aegis_redis_pass_2026',
  });
  await redis.del('AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS');
  await redis.quit();
  console.log('  -> Đã mở khóa Redis AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS');

  console.log('\n================================================================');
  console.log('   SEED DEMO DATA THÀNH CÔNG! HỆ THỐNG Ở TRẠNG THÁI HOÀN TOÀN HỢP LỆ.');
  console.log('================================================================\n');
}

main()
  .catch((e) => {
    console.error('Lỗi khi seed data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
