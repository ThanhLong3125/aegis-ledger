import * as crypto from 'node:crypto';
import { sha256 } from '../hashing';

export interface Ed25519KeyPair {
  privateKey: string; // PEM format (PKCS#8)
  publicKey: string;  // PEM format (SPKI)
}

const ED25519_SPKI_DER_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * Generates an Ed25519 key pair in standard PEM format.
 */
export function generateEd25519KeyPair(): Ed25519KeyPair {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
  });

  return { privateKey, publicKey };
}

/**
 * Converts a standard Ed25519 SPKI PEM public key into a 32-byte (64 hex chars) raw public key.
 */
export function exportPublicKeyRawHex(publicKeyPem: string): string {
  const key = crypto.createPublicKey(publicKeyPem);
  const der = key.export({ type: 'spki', format: 'der' });
  // The last 32 bytes of the Ed25519 SPKI DER structure is the raw public key
  return der.subarray(der.length - 32).toString('hex');
}

/**
 * Converts a 64-char raw hex Ed25519 public key back into a standard SPKI PEM public key.
 */
export function importPublicKeyFromRawHex(rawHex: string): string {
  const rawBuf = Buffer.from(rawHex, 'hex');
  if (rawBuf.length !== 32) {
    throw new Error(`Invalid Ed25519 raw public key length: expected 32 bytes (64 hex chars), got ${rawBuf.length} bytes.`);
  }
  const der = Buffer.concat([ED25519_SPKI_DER_PREFIX, rawBuf]);
  const key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
  return key.export({ type: 'spki', format: 'pem' }) as string;
}

/**
 * Helper to resolve either a 64-char raw hex public key or a standard PEM public key into a usable KeyObject or string.
 */
function resolvePublicKey(publicKeyInput: string): crypto.KeyObject | string {
  const trimmed = publicKeyInput.trim();
  if (trimmed.length === 64 && /^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const rawBuf = Buffer.from(trimmed, 'hex');
    const der = Buffer.concat([ED25519_SPKI_DER_PREFIX, rawBuf]);
    return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
  }
  return trimmed;
}

/**
 * Creates canonical string representation of an epoch block envelope to be signed.
 */
export function formatEpochSignMessage(
  epochNumber: number,
  merkleRoot: string,
  previousEpochRoot: string
): string {
  return `epoch:${epochNumber}|root:${merkleRoot}|prev:${previousEpochRoot}`;
}

/**
 * Signs arbitrary message string using Ed25519 private key PEM.
 * Returns hex signature (64 bytes = 128 hex chars).
 */
export function signMessage(message: string, privateKeyPem: string): string {
  const signBuffer = Buffer.from(message, 'utf8');
  const signature = crypto.sign(null, signBuffer, privateKeyPem);
  return signature.toString('hex');
}

/**
 * Signs an epoch block envelope.
 */
export function signEpochRoot(
  epochNumber: number,
  merkleRoot: string,
  previousEpochRoot: string,
  privateKeyPem: string
): string {
  const message = formatEpochSignMessage(epochNumber, merkleRoot, previousEpochRoot);
  return signMessage(message, privateKeyPem);
}

/**
 * Verifies Ed25519 signature on an arbitrary message.
 * Accepts either a PEM string or a 64-char raw hex string for publicKey.
 */
export function verifySignature(
  message: string,
  signatureHex: string,
  publicKeyInput: string
): boolean {
  try {
    const dataBuffer = Buffer.from(message, 'utf8');
    const sigBuffer = Buffer.from(signatureHex, 'hex');
    const resolvedKey = resolvePublicKey(publicKeyInput);
    return crypto.verify(null, dataBuffer, resolvedKey, sigBuffer);
  } catch {
    return false;
  }
}

/**
 * Verifies Ed25519 signature of an epoch block envelope.
 * Accepts either a PEM string or a 64-char raw hex string for publicKey.
 */
export function verifyEpochSignature(
  epochNumber: number,
  merkleRoot: string,
  previousEpochRoot: string,
  signatureHex: string,
  publicKeyInput: string
): boolean {
  const message = formatEpochSignMessage(epochNumber, merkleRoot, previousEpochRoot);
  return verifySignature(message, signatureHex, publicKeyInput);
}
