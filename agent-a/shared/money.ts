/**
 * Integer money helpers shared by the web app and the API.
 * Money is always integer minor units; nothing here uses floating point for amounts.
 */

/** Divide two BigInts and round half to even. Works for negative numerators. */
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

/** roundHalfEven(a × b ÷ c) for safe integers, computed with BigInt. */
export function mulDivRoundHalfEven(a: number, b: number, c: number): number {
  return Number(divRoundHalfEven(BigInt(a) * BigInt(b), BigInt(c)));
}

/** Round a ratio a ÷ b to the nearest integer (half to even). */
export function roundRatio(a: number, b: number): number {
  return Number(divRoundHalfEven(BigInt(a), BigInt(b)));
}

/**
 * Parse a decimal string ("510.95", "0.002712") into an integer scaled by 10^scale.
 * Extra digits are rounded half to even.
 */
export function decimalToScaled(text: string, scale: number): bigint {
  const t = text.trim();
  const m = /^(-?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(t);
  if (!m) throw new Error(`Not a decimal number: ${text}`);
  const [, sign, intPart = '', fracPart = '', exp] = m;
  const digits = (intPart || '0') + fracPart;
  const pointPos = (intPart || '0').length + (exp ? Number(exp) : 0);
  // value = digits × 10^(pointPos − digits.length); scaled = value × 10^scale
  const shift = scale - (digits.length - pointPos);
  const value =
    shift >= 0
      ? BigInt(digits) * 10n ** BigInt(shift)
      : divRoundHalfEven(BigInt(digits), 10n ** BigInt(-shift));
  return sign === '-' ? -value : value;
}

/** Format integer cents as a plain decimal string ("1234.56"). */
export function centsToDecimal(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return neg ? `-${s}` : s;
}

/**
 * Format money for display: "$1,234.56" for USD, "₡14,000" for CRC (no decimals).
 * Negative amounts use a real minus sign "−$52.30"; `signed` adds "+" to positives.
 */
export function formatMoney(minor: number, currency: string = 'USD', signed = false): string {
  const neg = minor < 0;
  const abs = Math.abs(minor);
  let body: string;
  if (currency === 'CRC') {
    const units = Number(divRoundHalfEven(BigInt(abs), 100n));
    body = `₡${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(units)}`;
  } else {
    const fmt = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    body = fmt.format(abs / 100);
  }
  if (neg) return `−${body}`;
  if (signed && minor > 0) return `+${body}`;
  return body;
}

/** Whole-dollar label for chart axes ("$1,000"). */
export function formatWholeDollars(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `${dollars < 0 ? '−' : ''}$${new Intl.NumberFormat('en-US').format(Math.abs(dollars))}`;
}

/** Basis points as a percent string: 155 → "1.55%", 1300 → "13%". */
export function formatBps(bps: number, signed = false): string {
  const neg = bps < 0;
  const abs = Math.abs(bps);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  let s = frac === 0 ? `${whole}` : `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
  s += '%';
  if (neg) return `−${s}`;
  if (signed && bps > 0) return `+${s}`;
  return s;
}
