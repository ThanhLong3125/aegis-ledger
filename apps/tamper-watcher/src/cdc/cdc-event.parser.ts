export interface ICdcEvent {
  schema: string;
  table: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  rawColumns: string;
  columns: Record<string, string>;
}

export class CdcEventParser {
  // Mẫu: "table public.audit_logs: UPDATE: id[text]:'uuid-123' leaf_hash[text]:'abc'..."
  private static readonly EVENT_REGEX =
    /^table\s+([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+):\s+(INSERT|UPDATE|DELETE):\s*(.*)$/;

  // Mẫu bóc tách từng cột: column_name[type]:'value' hoặc column_name[type]:123
  private static readonly COLUMN_REGEX =
    /([a-zA-Z0-9_]+)\[[^\]]+\]:(?:'([^']*)'|(\S+))/g;

  /**
   * Phân tích dòng log thô từ PostgreSQL Logical Replication (test_decoding plugin)
   */
  static parse(rawData: string): ICdcEvent | null {
    if (!rawData || !rawData.startsWith('table ')) {
      return null;
    }

    const match = this.EVENT_REGEX.exec(rawData.trim());
    if (!match) {
      return null;
    }

    const [, schema, table, operationStr, rawColumns] = match;
    const operation = operationStr as 'INSERT' | 'UPDATE' | 'DELETE';

    const columns: Record<string, string> = {};
    let colMatch: RegExpExecArray | null;

    // Reset regex index trước khi chạy lặp
    this.COLUMN_REGEX.lastIndex = 0;
    while ((colMatch = this.COLUMN_REGEX.exec(rawColumns)) !== null) {
      const colName = colMatch[1];
      const quotedVal = colMatch[2];
      const unquotedVal = colMatch[3];
      columns[colName] = quotedVal !== undefined ? quotedVal : unquotedVal;
    }

    return {
      schema,
      table,
      operation,
      rawColumns,
      columns,
    };
  }
}
