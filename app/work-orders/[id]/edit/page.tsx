import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { WorkOrderForm } from '@/components/WorkOrderForm';
import { t } from '@/lib/i18n/messages';
import { getOrder } from '@/lib/work-orders/store';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: t('form.editTitle') };

export default async function EditWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">{t('form.editTitle')}</h1>
      <WorkOrderForm mode="edit" initial={order} />
    </>
  );
}
