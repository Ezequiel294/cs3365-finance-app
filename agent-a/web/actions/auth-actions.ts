"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { confirmSignUp, describeCognitoError, resendCode, signIn, signUp } from "@/lib/cognito";
import { sessionService } from "@/lib/session";

export interface AuthState {
  error?: string;
  info?: string;
  email?: string;
}

const Email = z.email().max(254);

export async function signUpAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!Email.safeParse(email).success) return { error: "Enter a valid email address", email };
  if (password.length < 8) return { error: "Use at least 8 characters", email };
  try {
    await signUp(email, password);
  } catch (error) {
    return { error: describeCognitoError(error), email };
  }
  redirect(`/confirm?email=${encodeURIComponent(email)}`);
}

export async function confirmAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const code = String(form.get("code") ?? "").trim();
  if (form.get("intent") === "resend") {
    try {
      await resendCode(email);
      return { info: "We sent a new code.", email };
    } catch (error) {
      return { error: describeCognitoError(error), email };
    }
  }
  if (!/^\d{4,8}$/.test(code)) return { error: "Enter the code from the email", email };
  try {
    await confirmSignUp(email, code);
  } catch (error) {
    return { error: describeCognitoError(error), email };
  }
  redirect(`/signin?email=${encodeURIComponent(email)}&confirmed=1`);
}

export async function signInAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password", email };
  try {
    await sessionService.signIn(await signIn(email, password));
  } catch (error) {
    const message = describeCognitoError(error);
    if (message.startsWith("Confirm your email")) redirect(`/confirm?email=${encodeURIComponent(email)}`);
    return { error: message, email };
  }
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  await sessionService.signOut();
  redirect("/signin");
}
