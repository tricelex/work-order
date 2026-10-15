'use client';

import { useEffect } from 'react';
import { t } from '@/lib/i18n/messages';

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
      <h1 className="text-2xl font-semibold">{t('error.title')}</h1>
      <p className="mt-2">{t('error.body')}</p>
      <button type="button" onClick={() => retry()} className="btn-primary mt-4">
        {t('error.retry')}
      </button>
    </section>
  );
}
