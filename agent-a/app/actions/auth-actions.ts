'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { CognitoError, confirmSignUp, signInWithPassword, signUp } from '../lib/cognito';
import { SessionService } from '../lib/session';

export interface AuthState {
  step: 'sign-in' | 'sign-up' | 'confirm';
  email?: string;
  error?: string;
  notice?: string;
}

const Email = z.string().trim().toLowerCase().email('Enter your email address');
const Password = z.string().min(10, 'Use at least 10 characters, with a lower-case letter and a digit');

function message(e: unknown): string {
  if (e instanceof CognitoError) {
    switch (e.type) {
      case 'NotAuthorizedException':
        return 'The email or password is not right.';
      case 'UserNotConfirmedException':
        return 'Confirm your email first: enter the code we sent you.';
      case 'UsernameExistsException':
        return 'There is already an account with this email. Sign in instead.';
      case 'CodeMismatchException':
      case 'ExpiredCodeException':
        return 'That code is not valid. Check the latest email we sent you.';
      case 'InvalidPasswordException':
        return 'Use at least 10 characters, with a lower-case letter and a digit.';
      case 'TooManyRequestsException':
      case 'LimitExceededException':
        return 'Too many attempts. Wait a minute and try again.';
      default:
        return e.message;
    }
  }
  return 'Sign-in is not available right now. Try again in a moment.';
}

export async function signInAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = Email.safeParse(form.get('email'));
  const password = String(form.get('password') ?? '');
  if (!email.success) return { step: 'sign-in', error: email.error.issues[0]!.message };
  try {
    const tokens = await signInWithPassword(email.data, password);
    SessionService.store(tokens, await cookies());
  } catch (e) {
    const err = message(e);
    if (e instanceof CognitoError && e.type === 'UserNotConfirmedException') return { step: 'confirm', email: email.data, error: err };
    return { step: 'sign-in', email: email.data, error: err };
  }
  redirect('/dashboard');
}

export async function signUpAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = Email.safeParse(form.get('email'));
  const password = Password.safeParse(form.get('password'));
  if (!email.success) return { step: 'sign-up', error: email.error.issues[0]!.message };
  if (!password.success) return { step: 'sign-up', email: email.data, error: password.error.issues[0]!.message };
  try {
    await signUp(email.data, password.data);
  } catch (e) {
    return { step: 'sign-up', email: email.data, error: message(e) };
  }
  return { step: 'confirm', email: email.data, notice: 'We sent a code to your email. Enter it to finish.' };
}

export async function confirmAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = Email.safeParse(form.get('email'));
  const code = String(form.get('code') ?? '').trim();
  if (!email.success) return { step: 'confirm', error: email.error.issues[0]!.message };
  if (!/^\d{4,8}$/.test(code)) return { step: 'confirm', email: email.data, error: 'Enter the code from the email.' };
  try {
    await confirmSignUp(email.data, code);
  } catch (e) {
    return { step: 'confirm', email: email.data, error: message(e) };
  }
  return { step: 'sign-in', email: email.data, notice: 'Your email is confirmed. Sign in to continue.' };
}

export async function signOutAction(): Promise<void> {
  await SessionService.signOut();
  redirect('/sign-in');
}
