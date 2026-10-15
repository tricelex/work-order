import type { Priority, Status } from '@/lib/api/generated/model';

const PRIORITY_STYLES: Record<Priority, string> = {
  Low: 'bg-slate-100 text-slate-900 ring-slate-400',
  Medium: 'bg-amber-100 text-amber-950 ring-amber-500',
  High: 'bg-red-100 text-red-950 ring-red-500',
};

const STATUS_STYLES: Record<Status, string> = {
  Open: 'bg-blue-100 text-blue-950 ring-blue-500',
  'In Progress': 'bg-violet-100 text-violet-950 ring-violet-500',
  Done: 'bg-green-100 text-green-950 ring-green-600',
};

const BADGE = 'inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset';

/** Priority label with color and text (never color alone). */
export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`${BADGE} ${PRIORITY_STYLES[priority]}`}>{priority}</span>;
}

/** Status label with color and text (never color alone). */
export function StatusBadge({ status }: { status: Status }) {
  return <span className={`${BADGE} ${STATUS_STYLES[status]}`}>{status}</span>;
}
