import type { ParsedTransaction, TransactionKind } from '../../../shared/types';
import type { KindRule } from './templates/types';

/** Walks the template's kindRules in order; the first match sets the kind (bank-formats.md section 4). */
export class KindResolver {
  resolve(
    parsed: Pick<ParsedTransaction, 'direction' | 'merchantRaw'>,
    rules: KindRule[],
    ownIbans: string[],
    holderName: string | null,
  ): TransactionKind {
    const description = parsed.merchantRaw.trim();
    for (const rule of rules) {
      if (rule.direction !== parsed.direction) continue;
      const m = rule.pattern.exec(description);
      if (!m) continue;
      if (rule.when === 'ownAccount' && !this.isOwnAccount(m[1] ?? '', ownIbans)) continue;
      if (rule.when === 'holderName' && !this.isHolder(m[1] ?? '', holderName)) continue;
      return rule.kind;
    }
    return parsed.direction === 'out' ? 'purchase' : 'income';
  }

  /** The local account number appears inside the digits of a registered IBAN. */
  private isOwnAccount(localNumber: string, ownIbans: string[]): boolean {
    if (!localNumber) return false;
    return ownIbans.some((iban) => iban.replace(/\D/g, '').includes(localNumber));
  }

  /** `_` → space, upper-cased, at least 10 characters, and a prefix of the statement's holder. */
  private isHolder(captured: string, holderName: string | null): boolean {
    if (!holderName) return false;
    const name = captured.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
    const holder = holderName.replace(/\s+/g, ' ').trim().toUpperCase();
    return name.length >= 10 && holder.startsWith(name);
  }
}
