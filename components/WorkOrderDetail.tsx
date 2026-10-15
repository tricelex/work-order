import { PriorityBadge, StatusBadge } from '@/components/Badges';
import type { WorkOrder } from '@/lib/api/generated/model';
import { t } from '@/lib/i18n/messages';
import { formatTimestamp } from '@/lib/work-orders/format';

/** Full read-only view of one work order. Description is rendered as plain text. */
export function WorkOrderDetail({ order }: { order: WorkOrder }) {
  return (
    <article>
      <h1 className="break-words text-2xl font-semibold">{order.title}</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        <PriorityBadge priority={order.priority} />
        <StatusBadge status={order.status} />
      </div>
      <dl className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <dt className="font-medium text-slate-700">{t('detail.description')}</dt>
        <dd className="min-w-0 whitespace-pre-wrap break-words">
          {order.description || <span className="text-slate-700">{t('detail.noDescription')}</span>}
        </dd>
        <dt className="font-medium text-slate-700">{t('detail.updated')}</dt>
        <dd>
          <time dateTime={order.updatedAt}>{formatTimestamp(order.updatedAt)}</time>
        </dd>
        <dt className="font-medium text-slate-700">{t('detail.id')}</dt>
        <dd className="break-all font-mono text-sm">{order.id}</dd>
      </dl>
    </article>
  );
}
