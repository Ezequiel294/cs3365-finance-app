/**
 * Words that describe where or how a card was used rather than who was paid. They are dropped so
 * "AUTOMERCADO ESCAZU 042" and "AUTOMERCADO CURRIDABAT 017" share the key `automercado`.
 */
const NOISE_WORDS = new Set([
  // Costa Rica places commonly appended by card terminals
  "cr", "costa", "rica", "sj", "sjo", "san", "jose", "escazu", "heredia", "alajuela", "cartago", "puntarenas",
  "limon", "guanacaste", "liberia", "curridabat", "santa", "ana", "rohrmoser", "sabana", "moravia", "tibas",
  "desamparados", "zapote", "pavas", "belen", "lindora", "guadalupe", "montes", "oca", "paseo", "colon",
  "tres", "rios", "grecia", "naranjo", "atenas", "uruca", "centro", "mall", "multiplaza", "terramall",
  // processors and terminal noise
  "sq", "pos", "www", "com", "inc", "sa", "srl", "ltda", "ltd", "llc", "compra", "pago", "datafono", "tarjeta",
  "suc", "sucursal", "store", "tienda", "no", "nro",
]);

const PROCESSOR_PREFIXES = /^(paypal|sq|sp|tst|pp|dlo|apple\.com\/bill)\s*\*\s*/i;

export class Normalizer {
  /** Lower-cases, strips accents, digits, store numbers, and padding, and returns a stable merchant key. */
  normalize(merchantRaw: string): string {
    const text = merchantRaw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(PROCESSOR_PREFIXES, "")
      .toLowerCase()
      .replace(/[*#/\\_.,:;'"()[\]{}+&@!?|-]/g, " ");
    const tokens = text
      .split(/\s+/)
      .filter((t) => t.length > 0)
      .filter((t) => !/\d/.test(t)) // store numbers, references, terminal IDs
      .filter((t) => t.length > 1)
      .filter((t) => !NOISE_WORDS.has(t));
    const key = tokens.slice(0, 2).join("-").replace(/[^a-z0-9-]/g, "").slice(0, 64);
    return key || "unknown";
  }
}
