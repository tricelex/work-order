import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NoticeBanner } from '@/components/NoticeBanner';
import { WorkOrderDetail } from '@/components/WorkOrderDetail';
import { getOrder } from '@/lib/work-orders/store';

export const dynamic = 'force-dynamic';

export default async function WorkOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const [{ id }, { notice }] = await Promise.all([params, searchParams]);
  const order = await getOrder(id);
  if (!order) notFound();

  return (
    <>
      <NoticeBanner notice={notice} />
      <WorkOrderDetail order={order} />
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={`/work-orders/${order.id}/edit`} className="btn-secondary">
          Edit
        </Link>
      </div>
      <p className="mt-6">
        <Link href="/" className="underline">
          ← Back to all work orders
        </Link>
      </p>
    </>
  );
}
