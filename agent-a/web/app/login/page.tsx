import Link from 'next/link';
import { SignInForm } from '@/components/auth-forms';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  return (
    <div className="auth card">
      <h1>Sign in</h1>
      {params.confirmed && <p className="ok">Email confirmed. Sign in to continue.</p>}
      <SignInForm next={params.next ?? '/dashboard'} email={params.email ?? ''} />
      <p className="muted">
        No account yet? <Link href="/signup">Create one</Link>
      </p>
    </div>
  );
}
