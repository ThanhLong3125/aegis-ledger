import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../client/prisma.service';

/**
 * Tiện ích phân tách các câu lệnh SQL từ file, tự động bảo toàn các khối lệnh PL/pgSQL ($$...$$)
 */
export function parseSqlStatements(sqlContent: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollarQuote = false;
  let dollarQuoteTag = '';

  const lines = sqlContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Bỏ qua dòng comment ngoài khối hàm
    if (!inDollarQuote && trimmed.startsWith('--')) {
      continue;
    }

    current += line + '\n';

    // Bắt các cặp dollar-quote ($$ hoặc $tag$) của PL/pgSQL
    const dollarMatches = line.match(/\$[a-zA-Z0-9_]*\$/g);
    if (dollarMatches) {
      for (const match of dollarMatches) {
        if (!inDollarQuote) {
          inDollarQuote = true;
          dollarQuoteTag = match;
        } else if (match === dollarQuoteTag) {
          inDollarQuote = false;
          dollarQuoteTag = '';
        }
      }
    }

    // Nếu không nằm trong thân hàm và dòng kết thúc bằng dấu chấm phẩy
    if (!inDollarQuote && /;\s*(--.*)?$/.test(trimmed)) {
      const stmt = current.trim();
      if (stmt.length > 0) {
        statements.push(stmt);
      }
      current = '';
    }
  }

  const remainder = current.trim();
  if (remainder.length > 0) {
    statements.push(remainder);
  }

  return statements;
}

@Injectable()
export class WormManagerService {
  private readonly logger = new Logger(WormManagerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Đọc trực tiếp từ file worm-rules.sql duy nhất và áp dụng vào PostgreSQL
   */
  async applyWormRules(): Promise<void> {
    const sqlPath = this.resolveSqlPath();
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
    const statements = parseSqlStatements(sqlContent);

    this.logger.log(`Applying ${statements.length} WORM statements from ${path.basename(sqlPath)}...`);

    for (const statement of statements) {
      await this.prisma.$executeRawUnsafe(statement);
    }

    this.logger.log('WORM security triggers successfully registered on PostgreSQL.');
  }

  /**
   * Kiểm tra xem 3 Trigger WORM có đang hoạt động trên cả 3 bảng trong PostgreSQL không
   */
  async verifyWormTriggersActive(): Promise<boolean> {
    const result: any[] = await this.prisma.$queryRawUnsafe(`
      SELECT trigger_name, event_manipulation, event_object_table
      FROM information_schema.triggers
      WHERE event_object_table IN ('audit_logs', 'epoch_blocks', 'external_anchors')
        AND trigger_name IN (
          'trg_audit_logs_worm_guard',
          'trg_epoch_blocks_immutability',
          'trg_external_anchors_worm_guard'
        );
    `);

    return result.length >= 3;
  }

  /**
   * Tìm đường dẫn chính xác tới file worm-rules.sql
   */
  private resolveSqlPath(): string {
    const candidates = [
      path.resolve(__dirname, '../../prisma/worm-rules.sql'),
      path.resolve(process.cwd(), 'libs/database/prisma/worm-rules.sql'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    throw new Error(`Cannot locate worm-rules.sql in paths: ${candidates.join(', ')}`);
  }
}
