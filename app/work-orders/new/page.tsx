import type { Metadata } from 'next';
import { WorkOrderForm } from '@/components/WorkOrderForm';
import { t } from '@/lib/i18n/messages';

export const metadata: Metadata = { title: t('form.newTitle') };

export default function NewWorkOrderPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">{t('form.newTitle')}</h1>
      <WorkOrderForm mode="create" />
    </>
  );
}
