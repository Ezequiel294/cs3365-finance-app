import type { Broker, BrokerRule } from "@finance/shared";
import { NotFoundError, ValidationError } from "../http/errors";
import type { ReferenceRepository } from "../repositories/reference-repository";

/**
 * Each broker has one commission rule (`flatCents` and/or `percentBps`), used to estimate the cost
 * of selling. Editing it does not change commissions already stored on past transactions.
 */
export class BrokerService {
  constructor(private readonly reference: ReferenceRepository) {}

  /** `version` 0 creates the broker; otherwise the update is guarded by the version last read. */
  async update(userId: string, brokerId: string, rule: Omit<BrokerRule, "version">, version: number): Promise<Broker> {
    if (!/^[a-z0-9-]{1,40}$/.test(brokerId)) throw new ValidationError("broker id must be lower-case letters, digits, and dashes");
    if (!Number.isInteger(rule.flatCents) || rule.flatCents < 0) throw new ValidationError("flatCents must be a whole number of cents, 0 or more");
    if (!Number.isInteger(rule.percentBps) || rule.percentBps < 0) throw new ValidationError("percentBps must be whole basis points, 0 or more");
    let name = rule.name;
    if (version > 0) {
      const current = await this.reference.getBroker(userId, brokerId);
      if (!current) throw new NotFoundError("broker not found");
      name = name ?? current.name;
    }
    if (!name) throw new ValidationError("a new broker needs a name");
    const broker: Broker = { id: brokerId, name, flatCents: rule.flatCents, percentBps: rule.percentBps, version: version + 1 };
    await this.reference.updateBroker(userId, broker, version);
    return broker;
  }

  list(userId: string): Promise<Broker[]> {
    return this.reference.listBrokers(userId);
  }
}
