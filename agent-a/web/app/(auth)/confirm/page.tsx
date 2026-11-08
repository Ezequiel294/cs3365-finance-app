import { ConfirmForm } from "@/components/auth-forms";

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  return (
    <main className="auth card">
      <h1>Confirm your email</h1>
      <ConfirmForm email={q.email} />
    </main>
  );
}
