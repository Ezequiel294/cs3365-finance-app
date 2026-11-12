'use client';
import { useEffect } from 'react';
import { ErrorState } from './ErrorState';

/** error.tsx of each route: the message in plain words and "Try again". */
export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error.digest ?? error.name);
  }, [error]);
  const message =
    error.message && !error.message.includes('Server Components render')
      ? error.message
      : 'Something went wrong while loading this page. Try again in a moment.';
  return <ErrorState message={message} retry={reset} />;
}
