import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { DeleteWorkOrderButton } from '@/components/DeleteWorkOrderButton';
import { NoticeBanner } from '@/components/NoticeBanner';
import { WorkOrderDetail } from '@/components/WorkOrderDetail';
import { t } from '@/lib/i18n/messages';
import { getOrder } from '@/lib/work-orders/store';

export const dynamic = 'force-dynamic';

const loadOrder = cache(getOrder);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const order = await loadOrder((await params).id);
  return { title: order?.title ?? t('notFound.title') };
}

export default async function WorkOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const [{ id }, { notice }] = await Promise.all([params, searchParams]);
  const order = await loadOrder(id);
  if (!order) notFound();

  return (
    <>
      <NoticeBanner notice={notice} />
      <WorkOrderDetail order={order} />
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={`/work-orders/${order.id}/edit`} className="btn-secondary">
          {t('detail.edit')}
        </Link>
        <DeleteWorkOrderButton id={order.id} title={order.title} />
      </div>
      <p className="mt-6">
        <Link href="/" className="underline">
          {t('detail.back')}
        </Link>
      </p>
    </>
  );
}
