import Link from 'next/link';
import { t } from '@/lib/i18n/messages';

export default function NotFound() {
  return (
    <section>
      <h1 className="text-2xl font-semibold">{t('notFound.title')}</h1>
      <p className="mt-2">{t('notFound.body')}</p>
      <p className="mt-4">
        <Link href="/" className="underline">
          {t('notFound.back')}
        </Link>
      </p>
    </section>
  );
}
