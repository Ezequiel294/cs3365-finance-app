import { type ReactNode, useId } from 'react';
import { cx } from './format';

export const inputClass =
  'h-11 w-full rounded-[6px] border border-border bg-surface px-3 text-sm text-text sm:h-9 aria-[invalid=true]:border-negative';

/**
 * Every input: visible label above, optional hint under the label, error under the input
 * with aria-describedby. Pass a render function to receive the ids.
 */
export function FormField({
  label,
  hint,
  error,
  children,
  as = 'label',
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  as?: 'label' | 'fieldset';
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  const content = (
    <>
      {hint ? (
        <span id={hintId} className="block text-[13px] text-text-secondary">
          {hint}
        </span>
      ) : null}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <span id={errorId} className="block text-[13px] text-negative">
          {error}
        </span>
      ) : null}
    </>
  );
  if (as === 'fieldset') {
    return (
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">{label}</legend>
        {content}
      </fieldset>
    );
  }
  return (
    <div className={cx('flex flex-col gap-1')}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {content}
    </div>
  );
}
