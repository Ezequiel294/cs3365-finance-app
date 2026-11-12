'use client';
import { useRouter } from 'next/navigation';
import { Button } from './Button';

/** A failed load: the message in plain words and a "Try again" button. */
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  const router = useRouter();
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-[8px] border border-border bg-surface p-6">
      <h2 className="text-[20px] font-semibold">This page could not load</h2>
      <p className="text-sm text-text-secondary">{message}</p>
      <Button variant="primary" onClick={() => (retry ? retry() : router.refresh())}>
        Try again
      </Button>
    </div>
  );
}
