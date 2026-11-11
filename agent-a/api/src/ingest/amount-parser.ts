/** Parses bank amounts into integer minor units (bank-formats.md section 1). */
export class AmountParser {
  /**
   * Keeps digits, `.` and `,`. A final separator followed by exactly two digits is
   * the decimal point; every other separator is a thousands separator. Otherwise
   * the number is whole units. Empty text and zero both mean "no amount" (null).
   */
  static parse(text: string | null | undefined): number | null {
    if (text === null || text === undefined) return null;
    const cleaned = String(text).replace(/[^\d.,]/g, '');
    if (!/\d/.test(cleaned)) return null;
    const m = /^(.*)[.,](\d{2})$/.exec(cleaned);
    let minor: number;
    if (m) {
      const whole = m[1].replace(/[.,]/g, '') || '0';
      minor = Number(whole) * 100 + Number(m[2]);
    } else {
      minor = Number(cleaned.replace(/[.,]/g, '')) * 100;
    }
    if (!Number.isSafeInteger(minor)) return null;
    return minor === 0 ? null : minor;
  }
}
