"use client";

import Link from "next/link";
import { useActionState } from "react";
import { confirmAction, signInAction, signUpAction, type AuthState } from "@/actions/auth-actions";

export function SignInForm({ email, confirmed }: { email?: string; confirmed?: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signInAction, { email });
  return (
    <form action={action}>
      {confirmed && <p className="ok-text">Email confirmed. Sign in to continue.</p>}
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required defaultValue={state.email} />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.error && <p className="error-text">{state.error}</p>}
      <button disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <p className="muted">
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </form>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUpAction, {});
  return (
    <form action={action}>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required defaultValue={state.email} />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <p className="muted small">At least 8 characters, with upper and lower case letters, a number, and a symbol.</p>
      {state.error && <p className="error-text">{state.error}</p>}
      <button disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
      <p className="muted">
        Already have an account? <Link href="/signin">Sign in</Link>
      </p>
    </form>
  );
}

export function ConfirmForm({ email }: { email?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(confirmAction, { email });
  return (
    <form action={action}>
      <p className="muted">We emailed a confirmation code to the address below.</p>
      <label>
        Email
        <input name="email" type="email" required defaultValue={state.email} />
      </label>
      <label>
        Code
        <input name="code" inputMode="numeric" autoComplete="one-time-code" />
      </label>
      {state.error && <p className="error-text">{state.error}</p>}
      {state.info && <p className="ok-text">{state.info}</p>}
      <button name="intent" value="confirm" disabled={pending}>
        Confirm email
      </button>
      <button name="intent" value="resend" className="secondary" disabled={pending}>
        Send a new code
      </button>
    </form>
  );
}
