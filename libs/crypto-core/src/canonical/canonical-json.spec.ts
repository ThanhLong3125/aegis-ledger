import { canonicalStringify } from './canonical-json';

describe('Canonical JSON (RFC 8785)', () => {
  it('should format primitives predictably', () => {
    expect(canonicalStringify(null)).toBe('null');
    expect(canonicalStringify(true)).toBe('true');
    expect(canonicalStringify(false)).toBe('false');
    expect(canonicalStringify(123)).toBe('123');
    expect(canonicalStringify(3.14159)).toBe('3.14159');
    expect(canonicalStringify('hello world')).toBe('"hello world"');
    expect(canonicalStringify(BigInt(9007199254740991))).toBe('9007199254740991');
    expect(canonicalStringify(NaN)).toBe('null');
    expect(canonicalStringify(Infinity)).toBe('null');
  });

  it('should sort object keys in lexicographical order regardless of insertion', () => {
    const objA = { b: 2, a: 1, c: 3 };
    const objB = { c: 3, a: 1, b: 2 };
    const objC = { a: 1, b: 2, c: 3 };

    const expected = '{"a":1,"b":2,"c":3}';

    expect(canonicalStringify(objA)).toBe(expected);
    expect(canonicalStringify(objB)).toBe(expected);
    expect(canonicalStringify(objC)).toBe(expected);
  });

  it('should recursively sort nested objects', () => {
    const nestedA = {
      user: {
        role: 'admin',
        id: 42,
        meta: { z: 1, a: 2 },
      },
      action: 'LOGIN',
    };

    const nestedB = {
      action: 'LOGIN',
      user: {
        meta: { a: 2, z: 1 },
        id: 42,
        role: 'admin',
      },
    };

    const expected =
      '{"action":"LOGIN","user":{"id":42,"meta":{"a":2,"z":1},"role":"admin"}}';

    expect(canonicalStringify(nestedA)).toBe(expected);
    expect(canonicalStringify(nestedB)).toBe(expected);
  });

  it('should preserve array element order while canonicalizing contents', () => {
    const obj = {
      list: [{ y: 2, x: 1 }, 10, 'foo'],
    };

    const expected = '{"list":[{"x":1,"y":2},10,"foo"]}';
    expect(canonicalStringify(obj)).toBe(expected);
  });

  it('should omit undefined, function and symbol keys in objects', () => {
    const obj = {
      valid: 'yes',
      skippedUndef: undefined,
      skippedFunc: () => {},
      skippedSymbol: Symbol('test'),
    };

    expect(canonicalStringify(obj)).toBe('{"valid":"yes"}');
  });

  it('should support toJSON() serialization', () => {
    const date = new Date('2026-10-12T00:00:00.000Z');
    const obj = { timestamp: date };

    expect(canonicalStringify(obj)).toBe('{"timestamp":"2026-10-12T00:00:00.000Z"}');
  });

  it('should throw TypeError when detecting circular reference', () => {
    const circularObj: Record<string, unknown> = { a: 1 };
    circularObj['self'] = circularObj;

    expect(() => canonicalStringify(circularObj)).toThrow(TypeError);
  });
});
