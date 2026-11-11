import Link from 'next/link';
import { SignUpForm } from '@/components/auth-forms';

export const dynamic = 'force-dynamic';

export default function SignUpPage() {
  return (
    <div className="auth card">
      <h1>Create an account</h1>
      <SignUpForm />
      <p className="muted">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}
