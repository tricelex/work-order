import type { ZodError } from 'zod';
import type { ApiError } from '@/lib/api/generated/model';

type ErrorCode = ApiError['error']['code'];
type Issue = ZodError['issues'][number];

const LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  priority: 'Priority',
  status: 'Status',
  body: 'Request body',
};

/** Builds a typed JSON response. */
export function json<T>(body: T, status = 200): Response {
  return Response.json(body, { status });
}

/** Builds an empty 204 response. */
export function noContent(): Response {
  return new Response(null, { status: 204 });
}

/** Builds an `ApiError` response. */
export function apiError(
  status: number,
  code: ErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
): Response {
  const body: ApiError = { error: { code, message, ...(fieldErrors && { fieldErrors }) } };
  return Response.json(body, { status });
}

/** Turns one Zod issue into a readable sentence. Raw Zod messages are never exposed. */
function describe(issue: Issue, field: string): string {
  const label = LABELS[field] ?? 'Value';
  switch (issue.code) {
    case 'too_small':
      return `${label} must be at least ${issue.minimum} characters`;
    case 'too_big':
      return `${label} must be at most ${issue.maximum} characters`;
    case 'invalid_value':
      return `${label} must be one of: ${issue.values.join(', ')}`;
    case 'invalid_type':
      return `${label} is required`;
    default:
      return `${label} is invalid`;
  }
}

/** Maps a Zod error to a 400 `VALIDATION_ERROR` with per-field messages. */
export function validationError(error: ZodError): Response {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.length > 0 ? String(issue.path[0]) : 'body';
    (fieldErrors[field] ??= []).push(describe(issue, field));
  }
  return apiError(400, 'VALIDATION_ERROR', 'Request validation failed', fieldErrors);
}

/** Logs an unexpected error and returns a generic 500 that leaks nothing. */
export function serverError(error: unknown): Response {
  console.error(error);
  return apiError(500, 'INTERNAL_ERROR', 'Something went wrong');
}
