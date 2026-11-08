export interface Clock {
  now(): Date;
  /** Today's date as yyyy-mm-dd in the given IANA time zone. */
  today(timeZone: string): string;
}

export function localDateIn(date: Date, timeZone: string): string {
  // en-CA formats as yyyy-mm-dd.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
  today(timeZone: string): string {
    return localDateIn(this.now(), timeZone);
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
  today(timeZone: string): string {
    return localDateIn(this.current, timeZone);
  }
  set(date: Date): void {
    this.current = date;
  }
}
