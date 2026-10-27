import { CdcEventParser } from '../src/cdc/cdc-event.parser';

describe('CdcEventParser', () => {
  it('should return null for non-table records (BEGIN, COMMIT)', () => {
    expect(CdcEventParser.parse('BEGIN 1234')).toBeNull();
    expect(CdcEventParser.parse('COMMIT 1234')).toBeNull();
    expect(CdcEventParser.parse('')).toBeNull();
  });

  it('should parse INSERT record correctly', () => {
    const raw = `table public.audit_logs: INSERT: id[text]:'log_123' sequence[bigint]:1 leaf_hash[text]:'abcdef'`;
    const parsed = CdcEventParser.parse(raw);

    expect(parsed).not.toBeNull();
    expect(parsed?.schema).toBe('public');
    expect(parsed?.table).toBe('audit_logs');
    expect(parsed?.operation).toBe('INSERT');
    expect(parsed?.columns['id']).toBe('log_123');
    expect(parsed?.columns['sequence']).toBe('1');
    expect(parsed?.columns['leaf_hash']).toBe('abcdef');
  });

  it('should parse UPDATE record correctly', () => {
    const raw = `table public.audit_logs: UPDATE: id[text]:'log_123' sequence[bigint]:1 leaf_hash[text]:'tampered_hash'`;
    const parsed = CdcEventParser.parse(raw);

    expect(parsed).not.toBeNull();
    expect(parsed?.table).toBe('audit_logs');
    expect(parsed?.operation).toBe('UPDATE');
    expect(parsed?.columns['leaf_hash']).toBe('tampered_hash');
  });

  it('should parse DELETE record correctly', () => {
    const raw = `table public.audit_logs: DELETE: id[text]:'log_999'`;
    const parsed = CdcEventParser.parse(raw);

    expect(parsed).not.toBeNull();
    expect(parsed?.table).toBe('audit_logs');
    expect(parsed?.operation).toBe('DELETE');
    expect(parsed?.columns['id']).toBe('log_999');
  });
});
