import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '@aegis/database';
import { MerkleTree, verifyProof } from '@aegis/crypto-core';
import { SseService } from './sse.service';

export interface IMerkleNode {
  id: string;
  layer: number;
  index: number;
  hash: string;
  isLeaf: boolean;
  leftChildId?: string;
  rightChildId?: string;
  data?: any;
}

@Injectable()
export class DashboardService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DashboardService.name);
  private redisClient: Redis | null = null;
  private readonly redisKey =
    process.env.ACTIVE_DEFENSE_LOCK_KEY || 'AEGIS:ACTIVE_DEFENSE:LOCK_WITHDRAWALS';

  constructor(
    private readonly prisma: PrismaService,
    private readonly sse: SseService
  ) {}

  onModuleInit(): void {
    try {
      this.redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || 'aegis_redis_pass_2026',
        lazyConnect: true,
      });

      void this.redisClient.connect().catch((err) => {
        this.logger.warn(`Redis connection warning: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.warn(`Lỗi khởi tạo Redis client: ${err.message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit().catch(() => {});
      this.redisClient = null;
    }
  }

  /**
   * Lấy số liệu tổng quan hệ thống (Overview Stats)
   */
  async getOverview(): Promise<{
    totalEpochs: number;
    totalLogs: number;
    anchoredEpochs: number;
    isDefenseLocked: boolean;
  }> {
    const totalEpochs = await this.prisma.epochBlock.count();
    const totalLogs = await this.prisma.auditLog.count();
    const anchoredEpochs = await this.prisma.epochBlock.count({
      where: { anchored: true },
    });

    const isDefenseLocked = await this.isDefenseLocked();

    return {
      totalEpochs,
      totalLogs,
      anchoredEpochs,
      isDefenseLocked,
    };
  }

  /**
   * Lấy danh sách các khối Epoch
   */
  async getEpochs(): Promise<any[]> {
    const epochs = await this.prisma.epochBlock.findMany({
      orderBy: { epochNumber: 'desc' },
      include: {
        externalAnchors: true,
      },
    });

    return epochs.map((e) => ({
      epochNumber: Number(e.epochNumber),
      startSequence: Number(e.startSequence),
      endSequence: Number(e.endSequence),
      totalLogs: e.totalLogs,
      merkleRoot: e.merkleRoot,
      previousEpochRoot: e.previousEpochRoot,
      signature: e.signature,
      signerPublicKey: e.signerPublicKey,
      anchored: e.anchored,
      anchorTxHash: e.anchorTxHash,
      createdAt: e.createdAt,
      externalAnchors: e.externalAnchors,
    }));
  }

  /**
   * Trích xuất cấu trúc cây Merkle hoàn chỉnh theo từng tầng (Layers) cho 1 khối Epoch
   */
  async getEpochTree(epochNumber: number): Promise<{
    epochNumber: number;
    merkleRoot: string;
    previousEpochRoot: string;
    signature: string;
    totalLogs: number;
    depth: number;
    nodes: IMerkleNode[];
    layersCount: number;
  }> {
    const epochBigInt = BigInt(epochNumber);

    const epochBlock = await this.prisma.epochBlock.findUnique({
      where: { epochNumber: epochBigInt },
    });

    if (!epochBlock) {
      throw new NotFoundException(`Không tìm thấy Epoch Block #${epochNumber}`);
    }

    // Tải toàn bộ log của Epoch này
    const logs = await this.prisma.auditLog.findMany({
      where: { epochNumber: epochBigInt },
      orderBy: { sequence: 'asc' },
    });

    const leafHashes = logs.map((l) => l.leafHash);

    if (leafHashes.length === 0) {
      return {
        epochNumber,
        merkleRoot: epochBlock.merkleRoot,
        previousEpochRoot: epochBlock.previousEpochRoot,
        signature: epochBlock.signature,
        totalLogs: 0,
        depth: 0,
        nodes: [],
        layersCount: 0,
      };
    }

    // Dựng cây Merkle trong RAM
    const merkleTree = new MerkleTree(leafHashes);
    const layers = (merkleTree as any).layers as string[][];

    const nodes: IMerkleNode[] = [];

    // Duyệt từ tầng 0 (Lá) lên tầng cao nhất (Root)
    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];
      const isLeafLayer = layerIdx === 0;

      for (let nodeIdx = 0; nodeIdx < layer.length; nodeIdx++) {
        const hash = layer[nodeIdx];
        const nodeId = `layer_${layerIdx}_node_${nodeIdx}`;

        let leftChildId: string | undefined;
        let rightChildId: string | undefined;
        let data: any;

        if (isLeafLayer) {
          const log = logs[nodeIdx];
          if (log) {
            data = {
              id: log.id,
              sequence: Number(log.sequence),
              epochNumber: Number(log.epochNumber),
              timestamp: log.timestamp,
              actor: log.actor,
              action: log.action,
              resource: log.resource,
              payload: log.payload,
              leafHash: log.leafHash,
            };
          }
        } else {
          // Các node tầng trên liên kết xuống tầng con bên dưới
          leftChildId = `layer_${layerIdx - 1}_node_${nodeIdx * 2}`;
          const rightIdx = nodeIdx * 2 + 1;
          const prevLayerLen = layers[layerIdx - 1].length;
          rightChildId = `layer_${layerIdx - 1}_node_${
            rightIdx < prevLayerLen ? rightIdx : nodeIdx * 2
          }`;
        }

        nodes.push({
          id: nodeId,
          layer: layerIdx,
          index: nodeIdx,
          hash,
          isLeaf: isLeafLayer,
          leftChildId,
          rightChildId,
          data,
        });
      }
    }

    return {
      epochNumber,
      merkleRoot: epochBlock.merkleRoot,
      previousEpochRoot: epochBlock.previousEpochRoot,
      signature: epochBlock.signature,
      totalLogs: epochBlock.totalLogs,
      depth: merkleTree.getDepth(),
      nodes,
      layersCount: layers.length,
    };
  }

  /**
   * Sinh Merkle Proof cho 1 sequence và tự xác minh
   */
  async getProof(sequenceNumber: number): Promise<any> {
    const seqBigInt = BigInt(sequenceNumber);

    const log = await this.prisma.auditLog.findUnique({
      where: { sequence: seqBigInt },
    });

    if (!log) {
      throw new NotFoundException(`Không tìm thấy Audit Log với Sequence #${sequenceNumber}`);
    }

    const epochBlock = await this.prisma.epochBlock.findUnique({
      where: { epochNumber: log.epochNumber },
    });

    if (!epochBlock) {
      throw new NotFoundException(`Không tìm thấy Epoch Block #${log.epochNumber}`);
    }

    const epochLogs = await this.prisma.auditLog.findMany({
      where: { epochNumber: log.epochNumber },
      orderBy: { sequence: 'asc' },
      select: { sequence: true, leafHash: true },
    });

    const leafHashes = epochLogs.map((l) => l.leafHash);
    const merkleTree = new MerkleTree(leafHashes);
    const leafIndex = epochLogs.findIndex((l) => l.sequence === seqBigInt);

    const proof = merkleTree.getProof(leafIndex);
    const isValid = verifyProof(log.leafHash, proof, epochBlock.merkleRoot);

    return {
      sequence: sequenceNumber,
      epochNumber: Number(log.epochNumber),
      leafHash: log.leafHash,
      merkleRoot: epochBlock.merkleRoot,
      proof,
      isValid,
    };
  }

  /**
   * Kiểm tra cờ đỏ tự vệ Active Defense trên Redis
   */
  async isDefenseLocked(): Promise<boolean> {
    if (!this.redisClient) return false;
    try {
      const val = await this.redisClient.get(this.redisKey);
      return val === 'true' || val === '1';
    } catch {
      return false;
    }
  }

  /**
   * Reset cờ đỏ tự vệ về bình thường (phục vụ nút Reset trên Dashboard khi demo)
   */
  async resetDefenseLock(): Promise<{ success: boolean; message: string }> {
    if (!this.redisClient) {
      return { success: false, message: 'Redis client chưa kết nối' };
    }

    try {
      await this.redisClient.del(this.redisKey);
      this.sse.emit({
        type: 'security:reset',
        data: { isDefenseLocked: false },
      });
      return { success: true, message: 'Đã dỡ bỏ cờ đỏ tự vệ thành công' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }
}
