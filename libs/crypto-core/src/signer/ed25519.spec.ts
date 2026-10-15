import {
  generateEd25519KeyPair,
  signEpochRoot,
  verifyEpochSignature,
  signMessage,
  verifySignature,
} from './ed25519';

describe('Signer Ed25519 (RFC 8032)', () => {
  it('should generate valid Ed25519 key pair in PEM format', () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();

    expect(privateKey).toContain('-----BEGIN PRIVATE KEY-----');
    expect(privateKey).toContain('-----END PRIVATE KEY-----');

    expect(publicKey).toContain('-----BEGIN PUBLIC KEY-----');
    expect(publicKey).toContain('-----END PUBLIC KEY-----');
  });

  it('should sign and verify arbitrary messages', () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const message = 'AegisLedger Audit Integrity Check';

    const signature = signMessage(message, privateKey);
    expect(signature).toHaveLength(128); // 64 bytes = 128 hex chars

    const isValid = verifySignature(message, signature, publicKey);
    expect(isValid).toBe(true);

    // Corrupted message should fail
    const isCorruptedValid = verifySignature(message + ' tampered', signature, publicKey);
    expect(isCorruptedValid).toBe(false);

    // Corrupted signature should fail
    const corruptedSig = signature.replace(/^[0-9a-f]/, (c) => (c === 'a' ? 'b' : 'a'));
    expect(verifySignature(message, corruptedSig, publicKey)).toBe(false);
  });

  it('should sign and verify Epoch Envelope correctly', () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();

    const epochNumber = 1;
    const merkleRoot = 'a'.repeat(64);
    const previousEpochRoot = '0'.repeat(64);

    const signature = signEpochRoot(epochNumber, merkleRoot, previousEpochRoot, privateKey);

    const isValid = verifyEpochSignature(
      epochNumber,
      merkleRoot,
      previousEpochRoot,
      signature,
      publicKey
    );
    expect(isValid).toBe(true);
  });

  it('should reject tampered Epoch parameters', () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();

    const epochNumber = 2;
    const merkleRoot = 'b'.repeat(64);
    const previousEpochRoot = 'a'.repeat(64);

    const signature = signEpochRoot(epochNumber, merkleRoot, previousEpochRoot, privateKey);

    // Tampered epochNumber
    expect(
      verifyEpochSignature(epochNumber + 1, merkleRoot, previousEpochRoot, signature, publicKey)
    ).toBe(false);

    // Tampered merkleRoot
    expect(
      verifyEpochSignature(epochNumber, 'c'.repeat(64), previousEpochRoot, signature, publicKey)
    ).toBe(false);

    // Tampered previousEpochRoot
    expect(
      verifyEpochSignature(epochNumber, merkleRoot, 'c'.repeat(64), signature, publicKey)
    ).toBe(false);

    // Verified against different public key (different keypair)
    const anotherKeyPair = generateEd25519KeyPair();
    expect(
      verifyEpochSignature(
        epochNumber,
        merkleRoot,
        previousEpochRoot,
        signature,
        anotherKeyPair.publicKey
      )
    ).toBe(false);
  });
});
