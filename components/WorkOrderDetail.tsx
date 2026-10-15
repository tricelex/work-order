import { PriorityBadge, StatusBadge } from '@/components/Badges';
import type { WorkOrder } from '@/lib/api/generated/model';
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
      <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-[10rem_1fr]">
        <dt className="font-medium text-slate-700">Description</dt>
        <dd className="whitespace-pre-wrap break-words">
          {order.description || <span className="text-slate-700">No description provided.</span>}
        </dd>
        <dt className="font-medium text-slate-700">Last updated (UTC)</dt>
        <dd>
          <time dateTime={order.updatedAt}>{formatTimestamp(order.updatedAt)}</time>
        </dd>
        <dt className="font-medium text-slate-700">ID</dt>
        <dd className="break-all font-mono text-sm">{order.id}</dd>
      </dl>
    </article>
  );
}
