import { SignInForm } from "@/components/auth-forms";

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  return (
    <main className="auth card">
      <h1>Sign in</h1>
      <SignInForm email={q.email} confirmed={q.confirmed === "1"} />
    </main>
  );
}
