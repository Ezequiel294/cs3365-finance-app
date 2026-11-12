'use client';
import { useActionState, useState } from 'react';
import { type AuthState, confirmAction, signInAction, signUpAction } from '../actions/auth-actions';
import { Button } from '../ui/Button';
import { FormField, inputClass } from '../ui/FormField';

function Notice({ state }: { state: AuthState }) {
  if (state.error) return <p role="alert" className="text-sm text-negative">{state.error}</p>;
  if (state.notice) return <p role="status" className="text-sm text-positive">{state.notice}</p>;
  return null;
}

/** Sign in, create an account, and confirm the email (Cognito). */
export function AuthForms() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [signInState, signIn, signingIn] = useActionState(signInAction, { step: 'sign-in' } as AuthState);
  const [signUpState, signUp, signingUp] = useActionState(signUpAction, { step: 'sign-up' } as AuthState);
  const [confirmState, confirm, confirming] = useActionState(confirmAction, { step: 'confirm' } as AuthState);

  const needsConfirm =
    (signUpState.step === 'confirm' || signInState.step === 'confirm') && confirmState.step !== 'sign-in';
  const confirmEmail = confirmState.email ?? signUpState.email ?? signInState.email ?? '';

  if (needsConfirm) {
    return (
      <section className="rounded-[8px] border border-border bg-surface p-6">
        <h1 className="mb-4 text-[24px] font-semibold">Confirm your email</h1>
        <form action={confirm} className="flex flex-col gap-4">
          <input type="hidden" name="email" value={confirmEmail} />
          <p className="text-sm text-text-secondary">We sent a code to {confirmEmail}.</p>
          <FormField label="Code">
            {({ id }) => <input id={id} name="code" inputMode="numeric" autoComplete="one-time-code" required className={inputClass} />}
          </FormField>
          <Notice state={confirmState.error ? confirmState : signUpState.notice ? signUpState : signInState} />
          <Button type="submit" variant="primary" pending={confirming}>
            Confirm
          </Button>
        </form>
      </section>
    );
  }

  const confirmedNotice = confirmState.step === 'sign-in' ? confirmState : null;

  return (
    <section className="rounded-[8px] border border-border bg-surface p-6">
      <h1 className="mb-4 text-[24px] font-semibold">{mode === 'sign-in' ? 'Sign in' : 'Create an account'}</h1>
      {mode === 'sign-in' ? (
        <form action={signIn} className="flex flex-col gap-4">
          <FormField label="Email">
            {({ id }) => <input id={id} name="email" type="email" autoComplete="email" required defaultValue={signInState.email ?? confirmState.email} className={inputClass} />}
          </FormField>
          <FormField label="Password">
            {({ id }) => <input id={id} name="password" type="password" autoComplete="current-password" required className={inputClass} />}
          </FormField>
          <Notice state={signInState.error ? signInState : (confirmedNotice ?? signInState)} />
          <Button type="submit" variant="primary" pending={signingIn}>
            Sign in
          </Button>
          <p className="text-sm text-text-secondary">
            New here?{' '}
            <button type="button" className="text-accent underline" onClick={() => setMode('sign-up')}>
              Create an account
            </button>
          </p>
        </form>
      ) : (
        <form action={signUp} className="flex flex-col gap-4">
          <FormField label="Email">
            {({ id }) => <input id={id} name="email" type="email" autoComplete="email" required className={inputClass} />}
          </FormField>
          <FormField label="Password" hint="At least 10 characters, with a lower-case letter and a digit.">
            {({ id, describedBy }) => <input id={id} name="password" type="password" autoComplete="new-password" required minLength={10} aria-describedby={describedBy} className={inputClass} />}
          </FormField>
          <Notice state={signUpState} />
          <Button type="submit" variant="primary" pending={signingUp}>
            Create account
          </Button>
          <p className="text-sm text-text-secondary">
            Already have an account?{' '}
            <button type="button" className="text-accent underline" onClick={() => setMode('sign-in')}>
              Sign in
            </button>
          </p>
        </form>
      )}
    </section>
  );
}
