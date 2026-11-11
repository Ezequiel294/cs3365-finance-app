'use client';

import { useActionState } from 'react';
import { confirmAction, signInAction, signUpAction, type AuthState } from '@/app/actions/auth';

function ConfirmForm({ email, initial }: { email: string; initial?: AuthState }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(confirmAction, initial ?? { step: 'confirm', email });
  return (
    <form action={action}>
      {state.info && <p className="ok">{state.info}</p>}
      {state.error && <p className="error">{state.error}</p>}
      <input type="hidden" name="email" value={state.email ?? email} />
      <label htmlFor="code">Confirmation code sent to {state.email ?? email}</label>
      <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" />
      <div className="row" style={{ marginTop: '0.8rem' }}>
        <button type="submit" disabled={pending}>
          Confirm
        </button>
        <button type="submit" name="resend" value="1" className="secondary" disabled={pending}>
          Send a new code
        </button>
      </div>
    </form>
  );
}

export function SignInForm({ next, email }: { next: string; email: string }) {
  const [state, action, pending] = useActionState(signInAction, { email });
  if (state.step === 'confirm' && state.email) return <ConfirmForm email={state.email} initial={state} />;
  return (
    <form action={action}>
      {state.error && <p className="error">{state.error}</p>}
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" defaultValue={state.email} required />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      <button type="submit" disabled={pending} style={{ marginTop: '0.8rem' }}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, {});
  if (state.step === 'confirm' && state.email) return <ConfirmForm email={state.email} initial={state} />;
  return (
    <form action={action}>
      {state.error && <p className="error">{state.error}</p>}
      {state.info && <p className="ok">{state.info}</p>}
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" defaultValue={state.email} required />
      <label htmlFor="password">Password (8+ characters, upper and lower case, a number)</label>
      <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      <label htmlFor="confirm">Repeat the password</label>
      <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      <button type="submit" disabled={pending} style={{ marginTop: '0.8rem' }}>
        {pending ? 'Creating…' : 'Create account'}
      </button>
    </form>
  );
}
