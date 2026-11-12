import { redirect } from 'next/navigation';
import { SessionService } from '../lib/session';
import { AuthForms } from './AuthForms';

export const dynamic = 'force-dynamic';

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { expired } = await searchParams;
  // After the API refused a token, stay here even if a cookie is still present.
  if (!expired && (await SessionService.getSession())) redirect('/dashboard');
  return (
    <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-4 py-10">
      <p className="mb-2 text-base font-semibold">Finance App</p>
      {expired ? <p className="mb-3 text-sm text-text-secondary">Your session ended. Sign in again.</p> : null}
      <AuthForms />
    </main>
  );
}
