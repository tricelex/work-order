// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, customFetch, toApiError } from './fetcher';

function stubFetch(response: Response) {
  const mock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', mock);
  return mock;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('customFetch', () => {
  it('returns the parsed JSON body and forwards the request options', async () => {
    const mock = stubFetch(json([{ id: 'a' }], 200));
    await expect(customFetch('/api/work-orders', { method: 'GET' })).resolves.toEqual([{ id: 'a' }]);
    expect(mock).toHaveBeenCalledWith('/api/work-orders', { method: 'GET' });
  });

  it('returns undefined for an empty 204 response', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(customFetch('/api/work-orders/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('throws ApiRequestError with the status and parsed body on non-2xx', async () => {
    stubFetch(json({ error: { code: 'NOT_FOUND', message: 'Work order not found' } }, 404));
    const error = await customFetch('/api/work-orders/x', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 404, body: { error: { code: 'NOT_FOUND' } } });
  });

  it('still throws ApiRequestError when the error body is not JSON', async () => {
    stubFetch(new Response('Bad Gateway', { status: 502 }));
    const error = await customFetch('/api/work-orders', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 502, body: 'Bad Gateway' });
  });
});

describe('toApiError', () => {
  it('returns the body of an ApiRequestError that has the ApiError shape', () => {
    const body = { error: { code: 'VALIDATION_ERROR', message: 'Nope', fieldErrors: { title: ['Bad'] } } };
    expect(toApiError(new ApiRequestError(400, body))).toEqual(body);
  });

  it.each([
    ['a plain error', new Error('boom')],
    ['a network TypeError', new TypeError('Failed to fetch')],
    ['an ApiRequestError with a text body', new ApiRequestError(502, 'Bad Gateway')],
    ['an ApiRequestError with a malformed body', new ApiRequestError(400, { error: 'nope' })],
  ])('returns null for %s', (_label, error) => {
    expect(toApiError(error)).toBeNull();
  });
});
