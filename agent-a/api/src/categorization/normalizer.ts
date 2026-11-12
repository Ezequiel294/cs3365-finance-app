/**
 * Turns raw merchant text into a stable merchantKey: lower-case, no accents, digits, store
 * numbers, padding, punctuation, or trailing place names. "AUTOMERCADO ESCAZU 042" becomes
 * "automercado"; words are joined with "-" so the key is safe in a URL.
 */
const PLACE_WORDS = new Set([
  'cr',
  'costa',
  'rica',
  'san',
  'jose',
  'sj',
  'escazu',
  'heredia',
  'alajuela',
  'cartago',
  'curridabat',
  'santa',
  'ana',
  'moravia',
  'tibas',
  'pavas',
  'sabana',
  'rohrmoser',
  'belen',
  'liberia',
  'limon',
  'puntarenas',
  'guanacaste',
  'desamparados',
  'goicoechea',
  'montes',
  'oca',
  'pedro',
  'zapote',
  'guadalupe',
]);

export class Normalizer {
  normalize(merchantRaw: string): string {
    const words = merchantRaw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[0-9]+/g, ' ')
      .replace(/[^a-z]+/g, ' ')
      .split(' ')
      .filter(Boolean);
    // Drop trailing place names ("... escazu", "... san jose", "... cr") but never the first word.
    while (words.length > 1 && PLACE_WORDS.has(words[words.length - 1]!)) words.pop();
    const key = words.join('-').slice(0, 80);
    return key || 'unknown';
  }
}
