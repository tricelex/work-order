import type { ApiError } from '@/lib/api/generated/model';

/** Thrown by `customFetch` for every non-2xx response. `body` is the parsed JSON, or the raw text if it was not JSON. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Request failed with status ${status}`);
  }
}

/** Error type Orval puts on generated hooks: every failed request is an `ApiRequestError`. */
export type ErrorType<E> = E extends unknown ? ApiRequestError : never;

function parseBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Orval mutator: performs the request, returns the parsed body, and throws on non-2xx
 * so generated functions and hooks deal in plain data and errors.
 */
export async function customFetch<T>(url: string, options: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const body = parseBody(await response.text());
  if (!response.ok) throw new ApiRequestError(response.status, body);
  return body as T;
}

/** Returns the `ApiError` body of a failed request, or null if the error is anything else. */
export function toApiError(error: unknown): ApiError | null {
  if (!(error instanceof ApiRequestError)) return null;
  const { body } = error;
  if (typeof body !== 'object' || body === null || !('error' in body)) return null;
  const detail = body.error;
  if (typeof detail !== 'object' || detail === null || !('message' in detail)) return null;
  if (typeof detail.message !== 'string') return null;
  return body as ApiError;
}
