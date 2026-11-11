import type { Broker, FeeSchedule } from '@finance/shared';
import { ConflictError, NotFoundError } from '../errors';
import { ConditionFailedError } from '../repositories/dynamo-store';
import type { ReferenceRepository } from '../repositories/reference-repository';

/** Brokers and their fee schedules (07-S03). Editing fees never changes stored commissions. */
export class BrokerService {
  constructor(private readonly reference: ReferenceRepository) {}

  async list(userId: string): Promise<Broker[]> {
    return (await this.reference.listBrokers(userId)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(userId: string, name: string, fees: FeeSchedule): Promise<Broker> {
    const existing = await this.reference.listBrokers(userId);
    if (existing.some((b) => b.name.toLowerCase() === name.toLowerCase())) throw new ConflictError(`A broker named "${name}" already exists`);
    const broker: Broker = { id: `brk-${crypto.randomUUID()}`, name, fees, version: 1 };
    await this.reference.putBroker(userId, broker);
    return broker;
  }

  async update(userId: string, brokerId: string, fees: FeeSchedule, version: number): Promise<Broker> {
    const current = await this.reference.getBroker(userId, brokerId);
    if (!current) throw new NotFoundError('Broker not found');
    const next: Broker = { ...current, fees, version: current.version + 1 };
    try {
      await this.reference.updateBroker(userId, next, version);
    } catch (err) {
      if (err instanceof ConditionFailedError) throw new ConflictError('The broker was edited elsewhere; reload and try again');
      throw err;
    }
    return next;
  }
}
