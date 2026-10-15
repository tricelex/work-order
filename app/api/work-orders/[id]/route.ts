import type { WorkOrder } from '@/lib/api/generated/model';
import { GetWorkOrderParams, UpdateWorkOrderBody } from '@/lib/api/generated/zod';
import { parseBody } from '@/lib/api/parse-body';
import { apiError, json, noContent, serverError } from '@/lib/api/responses';
import { deleteOrder, getOrder, updateOrder } from '@/lib/work-orders/store';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const notFoundResponse = () => apiError(404, 'NOT_FOUND', 'Work order not found');

/** Resolves the route id, or null when it is not a valid uuid (treated as not found). */
async function resolveId({ params }: Context): Promise<string | null> {
  const parsed = GetWorkOrderParams.safeParse(await params);
  return parsed.success ? parsed.data.id : null;
}

/** Returns one work order. */
export async function GET(_request: Request, context: Context) {
  try {
    const id = await resolveId(context);
    const order = id ? await getOrder(id) : null;
    return order ? json<WorkOrder>(order) : notFoundResponse();
  } catch (error) {
    return serverError(error);
  }
}

/** Replaces all editable fields of a work order. */
export async function PUT(request: Request, context: Context) {
  try {
    const id = await resolveId(context);
    if (!id) return notFoundResponse();
    const body = await parseBody(request, UpdateWorkOrderBody);
    if ('response' in body) return body.response;
    const order = await updateOrder(id, body.data);
    return order ? json<WorkOrder>(order) : notFoundResponse();
  } catch (error) {
    return serverError(error);
  }
}

/** Deletes a work order. */
export async function DELETE(_request: Request, context: Context) {
  try {
    const id = await resolveId(context);
    const deleted = id ? await deleteOrder(id) : false;
    return deleted ? noContent() : notFoundResponse();
  } catch (error) {
    return serverError(error);
  }
}
