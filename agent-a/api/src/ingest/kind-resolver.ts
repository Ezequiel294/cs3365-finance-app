import type { TransactionKind } from '@finance/shared';
import type { ParsedTransaction } from './parsed-transaction';
import type { KindRule } from './templates';

/** Sets a statement row's kind from the template's rules (bank-formats.md section 4). */
export class KindResolver {
  /**
   * First matching rule wins. A rule matches when the direction is the same and the
   * trimmed description matches; a `when` condition must also pass. Without a match,
   * `out` is `purchase` and `in` is `income`.
   */
  resolve(
    parsed: Pick<ParsedTransaction, 'direction' | 'merchantRaw'>,
    rules: KindRule[],
    ownIbans: string[],
    holderName?: string | null,
  ): TransactionKind {
    const description = parsed.merchantRaw.trim();
    for (const rule of rules) {
      if (rule.direction !== parsed.direction) continue;
      const m = rule.pattern.exec(description);
      if (!m) continue;
      if (rule.when === 'ownAccount' && !this.isOwnAccount(m[1], ownIbans)) continue;
      if (rule.when === 'holderName' && !this.isHolder(m[1], holderName)) continue;
      return rule.kind;
    }
    return parsed.direction === 'out' ? 'purchase' : 'income';
  }

  /** The captured local account number appears inside the digits of a registered IBAN. */
  private isOwnAccount(number: string | undefined, ownIbans: string[]): boolean {
    if (!number) return false;
    return ownIbans.some((iban) => iban.replace(/\D/g, '').includes(number));
  }

  /** The counterparty, `_` as spaces and upper-cased, is ≥ 10 characters and a prefix of the holder's name. */
  private isHolder(captured: string | undefined, holderName?: string | null): boolean {
    if (!captured || !holderName) return false;
    const name = captured.replace(/_/g, ' ').trim().replace(/\s+/g, ' ').toUpperCase();
    return name.length >= 10 && holderName.trim().toUpperCase().startsWith(name);
  }
}
