import type { WorkOrder } from '@/lib/api/generated/model';
import { CreateWorkOrderBody, ListWorkOrdersQueryParams } from '@/lib/api/generated/zod';
import { parseBody } from '@/lib/api/parse-body';
import { json, serverError, validationError } from '@/lib/api/responses';
import { createOrder, listOrders } from '@/lib/work-orders/store';

export const dynamic = 'force-dynamic';

/** Lists work orders, optionally filtered by `?status=`. */
export async function GET(request: Request) {
  try {
    const status = new URL(request.url).searchParams.get('status') ?? undefined;
    const query = ListWorkOrdersQueryParams.safeParse({ status });
    if (!query.success) return validationError(query.error);
    return json<WorkOrder[]>(await listOrders(query.data));
  } catch (error) {
    return serverError(error);
  }
}

/** Creates an `Open` work order. */
export async function POST(request: Request) {
  try {
    const body = await parseBody(request, CreateWorkOrderBody);
    if ('response' in body) return body.response;
    return json<WorkOrder>(await createOrder(body.data), 201);
  } catch (error) {
    return serverError(error);
  }
}
