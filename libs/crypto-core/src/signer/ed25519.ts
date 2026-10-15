import * as crypto from 'node:crypto';
import { sha256 } from '../hashing';

export interface Ed25519KeyPair {
  privateKey: string; // PEM format (PKCS#8)
  publicKey: string;  // PEM format (SPKI)
}

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
 * Returns base64 or hex signature. Defaults to hex for compatibility.
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
 */
export function verifySignature(
  message: string,
  signatureHex: string,
  publicKeyPem: string
): boolean {
  try {
    const dataBuffer = Buffer.from(message, 'utf8');
    const sigBuffer = Buffer.from(signatureHex, 'hex');
    return crypto.verify(null, dataBuffer, publicKeyPem, sigBuffer);
  } catch {
    return false;
  }
}

/**
 * Verifies Ed25519 signature of an epoch block envelope.
 */
export function verifyEpochSignature(
  epochNumber: number,
  merkleRoot: string,
  previousEpochRoot: string,
  signatureHex: string,
  publicKeyPem: string
): boolean {
  const message = formatEpochSignMessage(epochNumber, merkleRoot, previousEpochRoot);
  return verifySignature(message, signatureHex, publicKeyPem);
}
