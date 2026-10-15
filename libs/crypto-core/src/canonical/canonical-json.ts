/**
 * Deterministic JSON stringify implementing RFC 8785 (JSON Canonicalization Scheme - JCS).
 * Ensures lexicographical sorting of keys, uniform formatting of primitives,
 * and detection of circular references.
 */

export function canonicalStringify(value: unknown, seen = new WeakSet<object>()): string {
  if (value === null) {
    return 'null';
  }

  const type = typeof value;

  if (type === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (type === 'number') {
    if (!Number.isFinite(value as number)) {
      return 'null';
    }
    return (value as number).toString();
  }

  if (type === 'string') {
    return JSON.stringify(value);
  }

  if (type === 'bigint') {
    return (value as bigint).toString();
  }

  if (type === 'symbol' || type === 'function' || type === 'undefined') {
    return 'null';
  }

  if (type === 'object') {
    const obj = value as object;

    if (seen.has(obj)) {
      throw new TypeError('Converting circular structure to JSON');
    }

    seen.add(obj);

    try {
      if (typeof (obj as { toJSON?: () => unknown }).toJSON === 'function') {
        const jsonVal = (obj as { toJSON: () => unknown }).toJSON();
        return canonicalStringify(jsonVal, seen);
      }

      if (Array.isArray(obj)) {
        const elements = obj.map((item) => {
          const itemType = typeof item;
          if (itemType === 'symbol' || itemType === 'function' || itemType === 'undefined') {
            return 'null';
          }
          return canonicalStringify(item, seen);
        });
        return `[${elements.join(',')}]`;
      }

      // Normal object
      const keys = Object.keys(obj).sort();
      const entries: string[] = [];

      for (const key of keys) {
        const val = (obj as Record<string, unknown>)[key];
        const valType = typeof val;

        // Skip undefined, functions, and symbols on object keys (standard JSON behavior)
        if (valType === 'undefined' || valType === 'function' || valType === 'symbol') {
          continue;
        }

        const serializedKey = JSON.stringify(key);
        const serializedVal = canonicalStringify(val, seen);
        entries.push(`${serializedKey}:${serializedVal}`);
      }

      return `{${entries.join(',')}}`;
    } finally {
      seen.delete(obj);
    }
  }

  return 'null';
}
