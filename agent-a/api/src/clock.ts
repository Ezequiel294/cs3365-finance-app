export interface Clock {
  now(): Date;
  /** Today's date (yyyy-mm-dd) in the given IANA time zone. */
  today(timeZone: string): string;
}

export function dateInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
  today(timeZone: string): string {
    return dateInZone(new Date(), timeZone);
  }
}

/** A clock fixed at one instant, for tests. */
export class FixedClock implements Clock {
  constructor(private instant: Date) {}
  now(): Date {
    return new Date(this.instant.getTime());
  }
  today(timeZone: string): string {
    return dateInZone(this.instant, timeZone);
  }
  set(instant: Date): void {
    this.instant = instant;
  }
}
