import { todayIn } from '@finance/shared';

export interface Clock {
  now(): Date;
  today(timeZone: string): string;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  today(timeZone: string): string {
    return todayIn(timeZone, this.now());
  }
}

/** A clock fixed at one instant, for tests. */
export class FixedClock implements Clock {
  constructor(private readonly instant: Date) {}

  now(): Date {
    return new Date(this.instant);
  }

  today(timeZone: string): string {
    return todayIn(timeZone, this.instant);
  }
}
