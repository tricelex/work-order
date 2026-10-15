'use client';

import { useEffect } from 'react';

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section role="alert">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2">The work orders could not be loaded. Please try again.</p>
      <button type="button" onClick={() => retry()} className="btn-primary mt-4">
        Try again
      </button>
    </section>
  );
}
