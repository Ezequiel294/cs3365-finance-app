import type { Broker, FeeSchedule } from '../../../shared/types';
import { ConflictError, NotFoundError } from '../http/errors';
import { randomId } from '../ids';
import { isConditionalFailure } from '../repositories/dynamo-store';
import type { ReferenceRepository } from '../repositories/reference-repository';

/** Brokers and their fee schedules (07-S03). Editing fees never changes stored commissions. */
export class BrokerService {
  constructor(
    private readonly reference: Pick<ReferenceRepository, 'listBrokers' | 'getBroker' | 'putBroker' | 'updateBroker'>,
  ) {}

  async list(userId: string): Promise<Broker[]> {
    return this.reference.listBrokers(userId);
  }

  async create(userId: string, name: string, fees: FeeSchedule): Promise<Broker> {
    const existing = await this.reference.listBrokers(userId);
    const wanted = name.trim().toLocaleLowerCase();
    if (existing.some((b) => b.name.trim().toLocaleLowerCase() === wanted)) {
      const message = `You already have a broker called ${name.trim()}.`;
      throw new ConflictError(message, 'NAME_TAKEN', undefined, { name: message });
    }
    const broker: Broker = { id: `brk-${randomId(8)}`, name: name.trim(), fees, version: 1 };
    await this.reference.putBroker(userId, broker);
    return broker;
  }

  async update(userId: string, brokerId: string, fees: FeeSchedule, version: number): Promise<Broker> {
    const current = await this.reference.getBroker(userId, brokerId);
    if (!current) throw new NotFoundError('Broker not found.');
    const next: Broker = { ...current, fees, version: current.version + 1 };
    try {
      await this.reference.updateBroker(userId, next, version);
    } catch (e) {
      if (isConditionalFailure(e)) {
        throw new ConflictError('These fees were changed somewhere else. Reload and try again.');
      }
      throw e;
    }
    return next;
  }
}
