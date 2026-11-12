'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Account, Bank, Currency } from '@/shared/types';
import { createAccount, updateAccount } from '../../actions/account-actions';
import { Button, type ButtonVariant } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { FormField, inputClass } from '../../ui/FormField';
import { useToast } from '../../ui/Toast';

/** Add or edit an account: name, bank, currency, IBAN, and the last four digits of its cards. */
export function AccountDialog({ open, account, onClose }: { open: boolean; account: Account | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [bank, setBank] = useState<Bank>('BAC');
  const [currency, setCurrency] = useState<Currency>('CRC');
  const [iban, setIban] = useState('');
  const [cards, setCards] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? '');
    setBank(account?.bank ?? 'BAC');
    setCurrency(account?.currency ?? 'CRC');
    setIban(account?.iban ?? '');
    setCards((account?.cardLast4s ?? []).join(', '));
    setFields({});
    setError(null);
  }, [open, account]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cardLast4s = cards
      .split(/[\s,]+/)
      .map((c) => c.trim())
      .filter(Boolean);
    const bad = cardLast4s.find((c) => !/^\d{4}$/.test(c));
    if (bad) return setFields({ cardLast4s: `"${bad}" is not four digits.` });
    const body = { name, bank, currency, iban: iban.trim() ? iban : null, cardLast4s };
    setPending(true);
    const r = account ? await updateAccount(account.id, { ...body, version: account.version }) : await createAccount(body);
    setPending(false);
    if (!r.ok) {
      const f = { ...(r.fields ?? {}) };
      for (const k of Object.keys(f)) if (k.startsWith('cardLast4s.')) f.cardLast4s = f[k]!;
      setFields(f);
      if (!r.fields) setError(r.message);
      return;
    }
    toast.show(account ? 'Account saved' : 'Account added');
    onClose();
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      title={account ? 'Edit account' : 'Add an account'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="account-form" pending={pending}>
            {account ? 'Save' : 'Add account'}
          </Button>
        </>
      }
    >
      <form id="account-form" onSubmit={submit} className="flex flex-col gap-4">
        <FormField label="Name" error={fields.name}>
          {({ id, describedBy, invalid }) => <input id={id} className={inputClass} required maxLength={60} placeholder="BAC colones" value={name} onChange={(e) => setName(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />}
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Bank" error={fields.bank}>
            {({ id, describedBy }) => (
              <select id={id} className={inputClass} value={bank} onChange={(e) => setBank(e.target.value as Bank)} aria-describedby={describedBy}>
                <option value="BAC">BAC Credomatic</option>
                <option value="BN">Banco Nacional</option>
              </select>
            )}
          </FormField>
          <FormField label="Currency" error={fields.currency}>
            {({ id, describedBy }) => (
              <select id={id} className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} aria-describedby={describedBy}>
                <option value="CRC">CRC (colones)</option>
                <option value="USD">USD (dollars)</option>
              </select>
            )}
          </FormField>
        </div>
        <FormField label="IBAN" hint="Optional. Lets transfers to this account be recognized as your own." error={fields.iban}>
          {({ id, describedBy, invalid }) => <input id={id} className={`${inputClass} font-mono`} placeholder="CR05 0152 0200 1026 2840 66" value={iban} onChange={(e) => setIban(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />}
        </FormField>
        <FormField
          label="Cards"
          hint="Last 4 digits of each card, separated by commas. Bank alert emails name the card, so this is how they find the account."
          error={fields.cardLast4s}
        >
          {({ id, describedBy, invalid }) => <input id={id} className={inputClass} inputMode="numeric" placeholder="1111, 5196" value={cards} onChange={(e) => setCards(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />}
        </FormField>
        {error ? <p role="alert" className="text-sm text-negative">{error}</p> : null}
      </form>
    </Dialog>
  );
}

export function AccountDialogButton({ account, label, variant }: { account: Account | null; label: string; variant: ButtonVariant }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <AccountDialog open={open} account={account} onClose={() => setOpen(false)} />
    </>
  );
}
