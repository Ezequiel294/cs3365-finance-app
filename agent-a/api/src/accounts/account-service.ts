import type { AccountChanges, NewAccount } from '../../../shared/schemas';
import type { Account } from '../../../shared/types';
import { ConflictError, NotFoundError, ValidationError } from '../http/errors';
import { randomId } from '../ids';
import { isConditionalFailure } from '../repositories/dynamo-store';
import type { ReferenceRepository } from '../repositories/reference-repository';
import type { TransactionRepository } from '../repositories/transaction-repository';

/** Accounts with their bank, currency, IBAN, and linked cards (01-S02a). */
export class AccountService {
  constructor(
    private readonly reference: Pick<ReferenceRepository, 'listAccounts' | 'getAccount' | 'putAccount' | 'updateAccount'>,
    private readonly transactions: Pick<TransactionRepository, 'accountHasTransactions'>,
  ) {}

  async list(userId: string): Promise<Account[]> {
    return this.reference.listAccounts(userId);
  }

  async create(userId: string, input: NewAccount): Promise<Account> {
    const cards = [...new Set(input.cardLast4s ?? [])];
    await this.validateCards(userId, cards, null);
    const account: Account = {
      id: `a-${randomId(10)}`,
      name: input.name,
      bank: input.bank,
      type: input.type ?? 'bank',
      currency: input.currency,
      iban: input.iban ?? null,
      cardLast4s: cards,
      version: 1,
    };
    await this.reference.putAccount(userId, account);
    return account;
  }

  async update(userId: string, accountId: string, changes: AccountChanges, version: number): Promise<Account> {
    const current = await this.reference.getAccount(userId, accountId);
    if (!current) throw new NotFoundError('Account not found.');
    if (current.version !== version) {
      throw new ConflictError('This account was changed somewhere else. Reload and try again.');
    }
    const bankChanged = changes.bank !== undefined && changes.bank !== current.bank;
    const currencyChanged = changes.currency !== undefined && changes.currency !== current.currency;
    if ((bankChanged || currencyChanged) && (await this.transactions.accountHasTransactions(userId, accountId))) {
      throw new ValidationError('The bank and currency cannot change once the account has transactions.', {
        [bankChanged ? 'bank' : 'currency']: 'This account already has transactions',
      });
    }
    const cards = changes.cardLast4s ? [...new Set(changes.cardLast4s)] : current.cardLast4s;
    await this.validateCards(userId, cards, accountId);
    const next: Account = {
      ...current,
      name: changes.name ?? current.name,
      bank: changes.bank ?? current.bank,
      currency: changes.currency ?? current.currency,
      type: changes.type ?? current.type,
      iban: changes.iban !== undefined ? changes.iban : current.iban,
      cardLast4s: cards,
      version: current.version + 1,
    };
    try {
      await this.reference.updateAccount(userId, next, current.version);
    } catch (e) {
      if (isConditionalFailure(e)) throw new ConflictError('This account was changed somewhere else. Reload and try again.');
      throw e;
    }
    return next;
  }

  /** A card must route to exactly one account. */
  private async validateCards(userId: string, cardLast4s: string[], accountId: string | null): Promise<void> {
    if (!cardLast4s.length) return;
    const accounts = await this.reference.listAccounts(userId);
    for (const card of cardLast4s) {
      const owner = accounts.find((a) => a.id !== accountId && (a.cardLast4s ?? []).includes(card));
      if (owner) {
        const message = `Card ${card} is already on ${owner.name}.`;
        throw new ValidationError(message, { cardLast4s: message }, 'CARD_TAKEN');
      }
    }
  }
}
