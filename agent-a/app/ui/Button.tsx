import Link from 'next/link';
import type { ButtonHTMLAttributes } from 'react';
import { cx } from './format';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'link';

const base =
  'inline-flex items-center justify-center gap-2 rounded-[6px] px-4 text-sm font-medium whitespace-nowrap h-11 sm:h-9 disabled:cursor-not-allowed disabled:opacity-60';
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:brightness-110',
  secondary: 'border border-border bg-surface text-text hover:bg-page',
  destructive: 'border border-negative bg-surface text-negative hover:bg-page',
  link: 'h-auto sm:h-auto px-0 text-accent underline-offset-2 hover:underline',
};

export function buttonClass(variant: ButtonVariant = 'secondary', className?: string): string {
  return cx(base, variants[variant], className);
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  pending?: boolean;
}

/** Every action. While its action runs it is disabled and reads "Saving…". */
export function Button({ variant = 'secondary', pending = false, children, className, disabled, type = 'button', ...rest }: Props) {
  return (
    <button type={type} className={buttonClass(variant, className)} disabled={disabled || pending} aria-busy={pending || undefined} {...rest}>
      {pending ? 'Saving…' : children}
    </button>
  );
}

export function ButtonLink({ href, variant = 'secondary', children, className }: { href: string; variant?: ButtonVariant; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={buttonClass(variant, className)}>
      {children}
    </Link>
  );
}
