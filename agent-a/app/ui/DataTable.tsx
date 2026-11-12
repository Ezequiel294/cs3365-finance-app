import type { ReactNode } from 'react';
import { cx } from './format';

export interface Column {
  key: string;
  label: string;
  align?: 'left' | 'right';
}

export type Row = Record<string, ReactNode> & { _key: string; _muted?: boolean };

/**
 * Any list with columns. Text left, numbers right in tabular numerals. Under 640 px each row
 * becomes a stacked card with the first column as its title; nothing scrolls sideways.
 */
export function DataTable({ columns, rows, caption }: { columns: Column[]; rows: Row[]; caption?: string }) {
  const [first, ...rest] = columns;
  return (
    <div>
      <table className="hidden w-full border-collapse text-sm sm:table">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cx('border-b border-border px-2 py-2 text-[13px] font-medium text-text-secondary', c.align === 'right' ? 'text-right' : 'text-left')}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r._key} className={cx('border-b border-border last:border-0', r._muted && 'text-text-secondary')}>
              {columns.map((c) => (
                <td key={c.key} className={cx('px-2 py-2 align-top', c.align === 'right' ? 'text-right tabular' : 'text-left')}>
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="flex flex-col gap-2 sm:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={r._key} className={cx('rounded-[6px] border border-border p-3', r._muted && 'text-text-secondary')}>
            {first ? <div className="mb-1 font-medium">{r[first.key]}</div> : null}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {rest.map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-[13px] text-text-secondary">{c.label}</dt>
                  <dd className={cx('min-w-0 break-words', c.align === 'right' && 'text-right tabular')}>{r[c.key]}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
