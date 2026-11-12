import { cx } from './format';

/** A task with ordered steps; the current one is marked with aria-current="step". */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-4 flex flex-wrap gap-4 text-sm">
      {steps.map((s, i) => (
        <li key={s} aria-current={i === current ? 'step' : undefined} className={cx('flex items-center gap-2', i === current ? 'font-semibold' : 'text-text-secondary')}>
          <span
            className={cx(
              'inline-flex h-6 w-6 items-center justify-center rounded-full border text-[13px]',
              i === current ? 'border-accent bg-accent text-white' : i < current ? 'border-good text-text' : 'border-border',
            )}
          >
            {i < current ? '✓' : i + 1}
          </span>
          {s}
        </li>
      ))}
    </ol>
  );
}
