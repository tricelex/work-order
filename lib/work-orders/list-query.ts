import { getListWorkOrdersSuspenseQueryOptions } from '@/lib/api/generated/api';
import type { Status } from '@/lib/api/generated/model';

/** List query options for an optional status filter. Shared by the server prefetch and the table so the keys match. */
export function workOrdersListOptions(status?: Status) {
  return getListWorkOrdersSuspenseQueryOptions(status ? { status } : undefined);
}
