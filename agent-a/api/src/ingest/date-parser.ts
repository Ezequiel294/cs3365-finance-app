const MONTHS: Record<string, number> = {
  ene: 1,
  jan: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  aug: 8,
  set: 9,
  sep: 9,
  oct: 10,
  nov: 11,
  dic: 12,
  dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isRealDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export const DateParser = {
  /** dd/mm/yyyy → yyyy-mm-dd, or null when unreadable. */
  dmy(text: string): string | null {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
    if (!m) return null;
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!isRealDate(y, mo, d)) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  },

  /** Three-letter month, Spanish or English, any case → 1..12, or null. */
  month(text: string): number | null {
    return MONTHS[text.trim().slice(0, 3).toLowerCase()] ?? null;
  },

  /** a.m./p.m. to 24-hour when given (12:05 a.m. → 00:05); otherwise already 24-hour. */
  time(hour: number, minute: number, ampm?: string | null): string {
    let h = hour;
    if (ampm) {
      const p = ampm.toLowerCase().startsWith('p');
      if (h === 12) h = p ? 12 : 0;
      else if (p) h += 12;
    }
    return `${pad(h)}:${pad(minute)}`;
  },

  /** Build localDate and occurredAt (America/Costa_Rica, UTC−6, no DST). */
  local(y: number, month: number, day: number, hhmm: string): { localDate: string; occurredAt: string } | null {
    if (!isRealDate(y, month, day)) return null;
    const localDate = `${y}-${pad(month)}-${pad(day)}`;
    return { localDate, occurredAt: `${localDate}T${hhmm}:00-06:00` };
  },
};
