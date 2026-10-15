import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { NoticeBanner } from '@/components/NoticeBanner';
import { StatusFilter } from '@/components/StatusFilter';
import { WorkOrdersTable } from '@/components/WorkOrdersTable';
import { ListWorkOrdersQueryParams } from '@/lib/api/generated/zod';
import { getQueryClient } from '@/lib/query/get-query-client';
import { workOrdersListOptions } from '@/lib/work-orders/list-query';
import { listOrders } from '@/lib/work-orders/store';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[]; notice?: string | string[] }>;
}) {
  const params = await searchParams;
  const parsed = ListWorkOrdersQueryParams.safeParse({ status: params.status });
  const status = parsed.success ? parsed.data.status : undefined;

  const queryClient = getQueryClient();
  await queryClient.fetchQuery({
    ...workOrdersListOptions(status),
    queryFn: () => listOrders({ status }),
  });

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Work orders</h1>
      <NoticeBanner notice={params.notice} />
      <div className="mb-4">
        <StatusFilter active={status} />
      </div>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <WorkOrdersTable status={status} />
      </HydrationBoundary>
    </>
  );
}
