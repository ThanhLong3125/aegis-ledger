import { sha256, hashLeaf, combineHashes } from './hasher';

describe('Hasher (SHA-256 with Domain Separation)', () => {
  it('should compute standard SHA-256 for strings', () => {
    // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(sha256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );

    // SHA-256("hello")
    expect(sha256('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('should hash leaves deterministically regardless of field order', () => {
    const logA = { id: 'evt-1', amount: 100, user: 'alice' };
    const logB = { user: 'alice', amount: 100, id: 'evt-1' };

    const hashA = hashLeaf(logA);
    const hashB = hashLeaf(logB);

    expect(hashA).toHaveLength(64);
    expect(hashA).toBe(hashB);
  });

  it('should produce different hashes for slight changes (Avalanche Effect)', () => {
    const log1 = { id: 'evt-1', amount: 100 };
    const log2 = { id: 'evt-1', amount: 101 };

    expect(hashLeaf(log1)).not.toBe(hashLeaf(log2));
  });

  it('should combine hashes with domain separation (0x01 prefix)', () => {
    const left = '1111111111111111111111111111111111111111111111111111111111111111';
    const right = '2222222222222222222222222222222222222222222222222222222222222222';

    const parent = combineHashes(left, right);
    expect(parent).toHaveLength(64);

    // combineHashes should be asymmetric: combine(L, R) != combine(R, L)
    const reversed = combineHashes(right, left);
    expect(parent).not.toBe(reversed);
  });
});
