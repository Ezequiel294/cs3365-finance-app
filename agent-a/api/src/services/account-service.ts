import type { Account, AccountChangesInput, NewAccountInput } from '@finance/shared';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { ConditionFailedError } from '../repositories/dynamo-store';
import type { ReferenceRepository } from '../repositories/reference-repository';

export class AccountService {
  constructor(private readonly reference: ReferenceRepository) {}

  async list(userId: string): Promise<Account[]> {
    const accounts = await this.reference.listAccounts(userId);
    return accounts.sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(userId: string, input: NewAccountInput): Promise<Account> {
    const cards = [...new Set(input.cardLast4s)];
    await this.validateCards(userId, cards, null);
    const account: Account = {
      id: crypto.randomUUID(),
      name: input.name,
      bank: input.bank,
      type: input.type,
      currency: input.currency,
      iban: input.iban ?? null,
      cardLast4s: cards,
      version: 1,
    };
    await this.reference.putAccount(userId, account);
    return account;
  }

  /**
   * Name, type, IBAN, and cards can be edited. Bank and currency are fixed once
   * the account exists (see IMPLEMENTATION_NOTES).
   */
  async update(userId: string, accountId: string, changes: AccountChangesInput, version: number): Promise<Account> {
    const current = await this.reference.getAccount(userId, accountId);
    if (!current) throw new NotFoundError('Account not found');
    if (current.version !== version) throw new ConflictError('The account changed meanwhile; reload it');
    const cards = changes.cardLast4s ? [...new Set(changes.cardLast4s)] : current.cardLast4s;
    await this.validateCards(userId, cards, accountId);
    const next: Account = {
      ...current,
      name: changes.name ?? current.name,
      type: changes.type ?? current.type,
      iban: changes.iban !== undefined ? changes.iban : current.iban ?? null,
      cardLast4s: cards,
      version: current.version + 1,
    };
    try {
      await this.reference.updateAccount(userId, next, version);
    } catch (err) {
      if (err instanceof ConditionFailedError) throw new ConflictError('The account changed meanwhile; reload it');
      throw err;
    }
    return next;
  }

  /** A card must route to exactly one account. */
  private async validateCards(userId: string, cardLast4s: string[], accountId: string | null): Promise<void> {
    if (cardLast4s.length === 0) return;
    const accounts = await this.reference.listAccounts(userId);
    for (const card of cardLast4s) {
      const owner = accounts.find((a) => a.id !== accountId && (a.cardLast4s ?? []).includes(card));
      if (owner) throw new ValidationError(`Card ${card} is already on "${owner.name}"`);
    }
  }
}
