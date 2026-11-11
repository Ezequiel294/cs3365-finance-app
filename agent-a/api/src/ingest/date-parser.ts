const MONTHS: Record<string, number> = {
  ene: 1, jan: 1,
  feb: 2,
  mar: 3,
  abr: 4, apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8, aug: 8,
  set: 9, sep: 9,
  oct: 10,
  nov: 11,
  dic: 12, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

function isRealDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Bank date and time helpers. Every bank date is local time in America/Costa_Rica (UTC−6). */
export class DateParser {
  static readonly OFFSET = '-06:00';

  /** `dd/mm/yyyy` → `yyyy-mm-dd`; null when it is not a real date. */
  static dmy(text: string): string | null {
    const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(text ?? '');
    if (!m) return null;
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isRealDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }

  /** Three-letter month, Spanish or English, any case → 1..12; null when unknown. */
  static month(text: string): number | null {
    return MONTHS[(text ?? '').trim().slice(0, 3).toLowerCase()] ?? null;
  }

  /** `a.m.`/`p.m.` to 24-hour when given (12:05 a.m. → 00:05); otherwise already 24-hour. */
  static time(hour: number, minute: number, ampm?: string | null): string | null {
    let h = hour;
    if (ampm) {
      const p = ampm.toLowerCase().startsWith('p');
      if (h < 1 || h > 12) return null;
      h = (h % 12) + (p ? 12 : 0);
    }
    if (h < 0 || h > 23 || minute < 0 || minute > 59) return null;
    return `${pad(h)}:${pad(minute)}`;
  }

  /** `yyyy-mm-dd` from year, month, day; null when not a real date. */
  static ymd(year: number, month: number, day: number): string | null {
    return isRealDate(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : null;
  }

  static occurredAt(localDate: string, time: string): string {
    return `${localDate}T${time}:00${DateParser.OFFSET}`;
  }
}
