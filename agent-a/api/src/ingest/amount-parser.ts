export const AmountParser = {
  /**
   * Keep digits, "." and ",". If the text ends in "." or "," plus exactly two digits, that
   * separator is the decimal point and the others are thousands separators; otherwise the
   * number is whole units. Returns integer minor units, or null for "no amount" (empty or 0).
   *   1,000.00 → 100000 · 3948.11 → 394811 · CRC 2,000.00 → 200000 · CRC 113,00 → 11300
   */
  parse(text: string | null | undefined): number | null {
    if (text == null) return null;
    const s = String(text).replace(/[^\d.,]/g, '');
    if (!/\d/.test(s)) return null;
    let minor: number;
    const decimal = /[.,](\d{2})$/.exec(s);
    if (decimal) {
      const whole = s.slice(0, -3).replace(/[.,]/g, '') || '0';
      minor = Number(whole) * 100 + Number(decimal[1]);
    } else {
      minor = Number(s.replace(/[.,]/g, '')) * 100;
    }
    if (!Number.isSafeInteger(minor) || minor === 0) return null;
    return minor;
  },
};
