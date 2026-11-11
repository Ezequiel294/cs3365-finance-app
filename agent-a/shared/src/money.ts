/**
 * Exact integer money arithmetic. No floating point is used for money.
 */

/** Divides two BigInts and rounds half to even. Works for negative values too. */
export function divRoundHalfEven(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('Division by zero');
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const negative = numerator < 0n;
  const n = negative ? -numerator : numerator;
  let q = n / denominator;
  const r = n % denominator;
  const twice = r * 2n;
  if (twice > denominator || (twice === denominator && q % 2n === 1n)) q += 1n;
  return negative ? -q : q;
}

/** Parses a decimal string ("510.95", "-0.5", "1e-3" not allowed) into a BigInt scaled by 10^scale, rounding half-even. */
export function parseDecimal(text: string, scale: number): bigint {
  const s = text.trim();
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) throw new Error(`Not a decimal number: ${text}`);
  const sign = m[1] === '-' ? -1n : 1n;
  const intPart = m[2] || '0';
  const frac = m[3] ?? '';
  const digits = BigInt(intPart + frac);
  const fracLen = frac.length;
  let value: bigint;
  if (fracLen <= scale) value = digits * 10n ** BigInt(scale - fracLen);
  else value = divRoundHalfEven(digits, 10n ** BigInt(fracLen - scale));
  return sign * value;
}

/** Converts a JS number to a plain decimal string without exponent notation. */
export function numberToDecimalString(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Not a finite number: ${n}`);
  const s = String(n);
  if (!/e/i.test(s)) return s;
  return n.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
}

/** Formats a BigInt scaled by 10^scale as a decimal string. */
export function formatScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(scale);
  const int = abs / base;
  const frac = (abs % base).toString().padStart(scale, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${int}${frac ? '.' + frac : ''}`;
}

/** `quantityMicro × priceMicros ÷ 10^12` in cents, half-even, with BigInt. */
export function marketValueCents(quantityMicro: number, priceMicros: number): number {
  const value = divRoundHalfEven(BigInt(quantityMicro) * BigInt(priceMicros), 10n ** 10n);
  return Number(value);
}
