import type { z } from 'zod';
import { apiError, validationError } from '@/lib/api/responses';

/** OpenAPI cannot express "trim", so titles are trimmed before validation. */
function trimTitle(body: unknown): unknown {
  if (typeof body === 'object' && body !== null && 'title' in body && typeof body.title === 'string') {
    return { ...body, title: body.title.trim() };
  }
  return body;
}

/**
 * Reads the JSON body and validates it with a generated Zod schema.
 * Returns the parsed data, or a ready-to-return 400 response.
 */
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ data: z.output<S> } | { response: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { response: apiError(400, 'INVALID_JSON', 'Request body must be valid JSON') };
  }
  const result = schema.safeParse(trimTitle(raw));
  return result.success ? { data: result.data } : { response: validationError(result.error) };
}
