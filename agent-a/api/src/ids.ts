import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"; // Crockford base32, lower case

export function randomId(length = 16): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % 32];
  return out;
}

/**
 * Transaction and investment transaction IDs carry their date (`20261014-xxxxxxxxxxxx`),
 * so `get(userId, id)` can rebuild the `TXN#<date>#<id>` sort key without an extra index.
 * The date of a record is therefore fixed once it is created.
 */
export function datedId(localDate: string): string {
  return `${localDate.replaceAll("-", "")}-${randomId(12)}`;
}

export function dateFromDatedId(id: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})-[0-9a-z]{6,}$/.exec(id);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
