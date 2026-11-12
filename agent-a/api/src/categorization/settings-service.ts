import type { SettingsChanges } from '../../../shared/schemas';
import type { UserSettings } from '../../../shared/types';
import type { BudgetService } from '../budgets/budget-service';
import type { ReferenceRepository } from '../repositories/reference-repository';

export const DEFAULT_TIME_ZONE = 'America/Costa_Rica';

export function defaultSettings(userId: string): UserSettings {
  return { userId, timeZone: DEFAULT_TIME_ZONE, weekStart: 'MONDAY', baseCurrency: 'USD' };
}

export class SettingsService {
  constructor(
    private readonly reference: Pick<ReferenceRepository, 'getSettings' | 'putSettings'>,
    private readonly budgets: () => Pick<BudgetService, 'rebuildWeekly'>,
  ) {}

  async get(userId: string): Promise<UserSettings> {
    return (await this.reference.getSettings(userId)) ?? defaultSettings(userId);
  }

  async update(userId: string, changes: SettingsChanges): Promise<UserSettings> {
    const current = await this.get(userId);
    const next: UserSettings = {
      ...current,
      userId,
      baseCurrency: 'USD',
      weekStart: changes.weekStart ?? current.weekStart,
      timeZone: changes.timeZone ?? current.timeZone,
    };
    await this.reference.putSettings(userId, next);
    if (next.weekStart !== current.weekStart) {
      await this.budgets().rebuildWeekly(userId);
    }
    return next;
  }
}
