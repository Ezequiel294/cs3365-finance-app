'use client';
import Link from 'next/link';
import { cx } from './format';

export interface Option {
  value: string;
  label: string;
}

/** Choosing several categories or tags: each option is a toggle chip (aria-pressed). */
export function ChipSelect({
  options,
  selected,
  onChange,
  emptyHint,
  emptyLink,
  describedBy,
}: {
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyHint?: string;
  emptyLink?: { href: string; label: string };
  describedBy?: string;
}) {
  if (!options.length) {
    return (
      <p className="text-sm text-text-secondary">
        {emptyHint}{' '}
        {emptyLink ? (
          <Link href={emptyLink.href} className="text-accent underline">
            {emptyLink.label}
          </Link>
        ) : null}
      </p>
    );
  }
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
  return (
    <div className="flex flex-wrap gap-2" aria-describedby={describedBy}>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(o.value)}
            className={cx(
              'min-h-11 rounded-full border px-3 text-sm sm:min-h-8',
              on ? 'border-accent bg-accent text-white' : 'border-border bg-surface text-text hover:bg-page',
            )}
          >
            {on ? '✓ ' : ''}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
