'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Catalog } from '@/shared/api-types';
import type { Budget, BudgetPeriod } from '@/shared/types';
import { createBudget, updateBudget } from '../../actions/budget-actions';
import { Button } from '../../ui/Button';
import { ChipSelect } from '../../ui/ChipSelect';
import { Dialog } from '../../ui/Dialog';
import { centsToInput, parseAmountInput } from '../../ui/format';
import { FormField, inputClass } from '../../ui/FormField';
import { useToast } from '../../ui/Toast';

const PERIODS: Array<{ value: BudgetPeriod; label: string }> = [
  { value: 'WEEKLY', label: 'Week' },
  { value: 'MONTHLY', label: 'Month' },
  { value: 'QUARTERLY', label: 'Quarter' },
  { value: 'YEARLY', label: 'Year' },
  { value: 'CUSTOM', label: 'Custom range' },
];

/** Create or edit a budget (03-S02, 03-S10). */
export function BudgetDialog({ budget, catalog, open, onClose }: { budget: Budget | null; catalog: Catalog; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('');
  const [period, setPeriod] = useState<BudgetPeriod>('MONTHLY');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(budget?.name ?? '');
    setLimit(budget ? centsToInput(budget.limitCents) : '');
    setPeriod(budget?.period ?? 'MONTHLY');
    setStart(budget?.startDate ?? '');
    setEnd(budget?.endDate ?? '');
    setCategoryIds(budget?.categoryIds ?? []);
    setTagIds(budget?.tagIds ?? []);
    setFields({});
    setError(null);
  }, [open, budget]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const limitCents = parseAmountInput(limit);
    if (!limitCents) return setFields({ limitCents: 'Enter a limit in dollars, for example 300' });
    const body = {
      name,
      limitCents,
      period,
      categoryIds,
      tagIds,
      startDate: period === 'CUSTOM' ? startDate || null : null,
      endDate: period === 'CUSTOM' ? endDate || null : null,
    };
    setPending(true);
    const r = budget ? await updateBudget(budget.id, { ...body, version: budget.version }) : await createBudget(body);
    setPending(false);
    if (!r.ok) {
      setFields(r.fields ?? {});
      setError(r.code === 'CONFLICT' ? 'This budget was changed somewhere else. Reload the page and try again.' : r.fields ? null : r.message);
      return;
    }
    toast.show(budget ? 'Budget saved' : 'Budget created');
    onClose();
    router.refresh();
  };

  const hintId = 'budget-filter-hint';
  return (
    <Dialog
      open={open}
      title={budget ? 'Edit budget' : 'New budget'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="budget-form" pending={pending}>
            {budget ? 'Save' : 'Create budget'}
          </Button>
        </>
      }
    >
      <form id="budget-form" onSubmit={submit} className="flex flex-col gap-4">
        <FormField label="Name" error={fields.name}>
          {({ id, describedBy, invalid }) => <input id={id} className={inputClass} required maxLength={60} placeholder="University" value={name} onChange={(e) => setName(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />}
        </FormField>
        <FormField label="Limit (USD)" error={fields.limitCents}>
          {({ id, describedBy, invalid }) => <input id={id} className={inputClass} inputMode="decimal" required placeholder="300" value={limit} onChange={(e) => setLimit(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />}
        </FormField>
        <FormField label="Period" error={fields.period}>
          {({ id }) => (
            <select id={id} className={inputClass} value={period} onChange={(e) => setPeriod(e.target.value as BudgetPeriod)}>
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
        </FormField>
        {period === 'CUSTOM' ? (
          <div className="grid grid-cols-2 gap-3">
            <FormField label="From" error={fields.startDate}>
              {({ id }) => <input id={id} type="date" className={inputClass} required value={startDate} onChange={(e) => setStart(e.target.value)} />}
            </FormField>
            <FormField label="To" error={fields.endDate}>
              {({ id }) => <input id={id} type="date" className={inputClass} required value={endDate} onChange={(e) => setEnd(e.target.value)} />}
            </FormField>
          </div>
        ) : null}
        <p id={hintId} className="text-[13px] text-text-secondary">
          Leave both empty to count all spending. With tags, a purchase counts if it has any of them.
        </p>
        <FormField label="Categories" as="fieldset" error={fields.categoryIds}>
          {() => <ChipSelect options={catalog.categories.map((c) => ({ value: c.id, label: c.name }))} selected={categoryIds} onChange={setCategoryIds} describedBy={hintId} />}
        </FormField>
        <FormField label="Tags" as="fieldset" error={fields.tagIds}>
          {() => (
            <ChipSelect
              options={catalog.tags.map((t) => ({ value: t.id, label: t.name }))}
              selected={tagIds}
              onChange={setTagIds}
              emptyHint="You have no tags yet."
              emptyLink={{ href: '/settings', label: 'Create tags in Settings' }}
              describedBy={hintId}
            />
          )}
        </FormField>
        {error ? <p role="alert" className="text-sm text-negative">{error}</p> : null}
      </form>
    </Dialog>
  );
}

/** The page's primary "New budget" button and the dialog opened from the URL (?new=1, ?edit=id). */
export function BudgetDialogLauncher({ catalog, editing, startOpen, label = 'New budget', variant = 'primary' }: { catalog: Catalog; editing: Budget | null; startOpen: boolean; label?: string; variant?: 'primary' | 'secondary' }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(startOpen);
  useEffect(() => setOpen(startOpen), [startOpen]);
  const close = () => {
    setOpen(false);
    if (startOpen) router.replace(pathname ?? '/budgets', { scroll: false });
  };
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <BudgetDialog budget={open ? editing : null} catalog={catalog} open={open} onClose={close} />
    </>
  );
}
