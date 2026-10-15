import * as crypto from 'node:crypto';
import { canonicalStringify } from '../canonical';

/**
 * Calculates SHA-256 hash of a string or Buffer and returns a 64-char lowercase hex string.
 */
export function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Computes deterministic leaf hash from an arbitrary log object.
 * Prepend 0x00 domain separator prefix to prevent second pre-image attacks.
 */
export function hashLeaf(data: unknown): string {
  const canonical = canonicalStringify(data);
  // Domain separator: 0x00 for leaf node
  const buffer = Buffer.concat([Buffer.from([0x00]), Buffer.from(canonical, 'utf8')]);
  return sha256(buffer);
}

/**
 * Combines two 32-byte hashes into a parent node hash.
 * Prepend 0x01 domain separator prefix to prevent second pre-image attacks.
 */
export function combineHashes(leftHex: string, rightHex: string): string {
  const leftBuf = Buffer.from(leftHex, 'hex');
  const rightBuf = Buffer.from(rightHex, 'hex');
  const buffer = Buffer.concat([Buffer.from([0x01]), leftBuf, rightBuf]);
  return sha256(buffer);
}
