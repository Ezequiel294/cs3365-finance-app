/**
 * Place names and filler words that banks append to merchant text. Removing them
 * keeps the key stable across branches ("AUTOMERCADO ESCAZU 042" → "automercado").
 */
const NOISE = new Set([
  'escazu', 'san', 'jose', 'heredia', 'alajuela', 'cartago', 'puntarenas', 'limon', 'guanacaste',
  'curridabat', 'santa', 'ana', 'moravia', 'tibas', 'desamparados', 'pavas', 'sabana', 'rohrmoser',
  'belen', 'liberia', 'costa', 'rica', 'cr', 'cri', 'sa', 'srl', 'ltda', 'inc', 'com', 'www',
]);

const MAX_TOKENS = 4;

/** Turns raw merchant text into a stable `merchantKey`. Deterministic. */
export class Normalizer {
  normalize(merchantRaw: string): string {
    const tokens = merchantRaw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .filter((t) => t.length > 0 && !/\d/.test(t));
    const kept = tokens.filter((t) => !NOISE.has(t));
    const chosen = (kept.length > 0 ? kept : tokens).slice(0, MAX_TOKENS);
    const key = chosen.join('-');
    return key || 'unknown';
  }
}
