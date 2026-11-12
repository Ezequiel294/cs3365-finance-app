import { createHash, randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function randomId(length = 12): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

/** Id that carries its date, so the item's SK (TXN#<date>#<id>) can be rebuilt from the id. */
export function datedId(localDate: string): string {
  return `${localDate.replace(/-/g, '')}-${randomId(12)}`;
}

export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}
