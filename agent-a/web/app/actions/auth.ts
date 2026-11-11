'use server';

import { redirect } from 'next/navigation';
import { CognitoError, confirmSignUp, resendCode, signIn, signUp } from '@/lib/cognito';
import { SessionService } from '@/lib/session';

export type AuthState = { error?: string; info?: string; step?: 'confirm'; email?: string };

const MESSAGES: Record<string, string> = {
  NotAuthorizedException: 'Wrong email or password.',
  UserNotFoundException: 'Wrong email or password.',
  UserNotConfirmedException: 'Confirm your email first: enter the code we sent you.',
  UsernameExistsException: 'An account with this email already exists. Sign in instead.',
  InvalidPasswordException: 'The password needs at least 8 characters with upper and lower case letters and a number.',
  InvalidParameterException: 'Check the email and password.',
  CodeMismatchException: 'That code is not right. Check the email and try again.',
  ExpiredCodeException: 'That code expired. Ask for a new one.',
  LimitExceededException: 'Too many attempts. Wait a few minutes and try again.',
  TooManyRequestsException: 'Too many attempts. Wait a few minutes and try again.',
};

const message = (err: unknown) => (err instanceof CognitoError ? MESSAGES[err.code] ?? err.message : 'Something went wrong. Try again.');

function safeNext(value: FormDataEntryValue | null): string {
  const next = String(value ?? '/dashboard');
  return next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export async function signInAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  try {
    await SessionService.store(await signIn(email, password));
  } catch (err) {
    if (err instanceof CognitoError && err.code === 'UserNotConfirmedException') {
      return { error: message(err), step: 'confirm', email };
    }
    return { error: message(err), email };
  }
  redirect(safeNext(form.get('next')));
}

export async function signUpAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  if (password !== String(form.get('confirm') ?? '')) return { error: 'The passwords do not match.', email };
  try {
    const { confirmed } = await signUp(email, password);
    if (confirmed) return { info: 'Account created. Sign in.', email };
    return { step: 'confirm', email, info: `We sent a code to ${email}. Enter it to finish.` };
  } catch (err) {
    return { error: message(err), email };
  }
}

export async function confirmAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const code = String(form.get('code') ?? '').trim();
  if (form.get('resend')) {
    try {
      await resendCode(email);
      return { step: 'confirm', email, info: 'We sent a new code.' };
    } catch (err) {
      return { step: 'confirm', email, error: message(err) };
    }
  }
  try {
    await confirmSignUp(email, code);
  } catch (err) {
    return { step: 'confirm', email, error: message(err) };
  }
  redirect(`/login?confirmed=1&email=${encodeURIComponent(email)}`);
}

export async function signOutAction(): Promise<void> {
  await SessionService.signOut();
  redirect('/login');
}
