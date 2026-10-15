// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiError, WorkOrder } from '@/lib/api/generated/model';
import { listOrders, replaceAllOrders } from '@/lib/work-orders/store';
import { GET, POST } from './route';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'wo-api-'));
  process.env.WORK_ORDERS_FILE = path.join(dir, 'work-orders.json');
});

afterEach(async () => {
  delete process.env.WORK_ORDERS_FILE;
  await rm(dir, { recursive: true, force: true });
});

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/work-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

const get = (query = '') => GET(new Request(`http://localhost/api/work-orders${query}`));

describe('GET and POST /api/work-orders', () => {
  it('creates an Open work order with a trimmed title and lists it', async () => {
    const response = await post({ title: '  Replace filter  ', priority: 'High' });
    expect(response.status).toBe(201);
    const created = (await response.json()) as WorkOrder;
    expect(created).toMatchObject({
      title: 'Replace filter',
      description: '',
      priority: 'High',
      status: 'Open',
    });

    const listed = (await (await get()).json()) as WorkOrder[];
    expect(listed.map((o) => o.id)).toEqual([created.id]);
  });

  it('ignores client-supplied id, status and updatedAt', async () => {
    const response = await post({
      title: 'Check pump',
      priority: 'Low',
      id: 'client-id',
      status: 'Done',
      updatedAt: '2000-01-01T00:00:00.000Z',
    });
    const created = (await response.json()) as WorkOrder;
    expect(created.id).not.toBe('client-id');
    expect(created.status).toBe('Open');
    expect(created.updatedAt.startsWith('2000')).toBe(false);
  });

  it('filters the list by status', async () => {
    const open = { id: '11111111-1111-4111-8111-111111111111', title: 'Open one', description: '', priority: 'Low', status: 'Open', updatedAt: '2026-10-01T00:00:00.000Z' } as const;
    const done = { ...open, id: '22222222-2222-4222-8222-222222222222', title: 'Done one', status: 'Done' } as const;
    await replaceAllOrders([open, done]);

    const body = (await (await get('?status=Open')).json()) as WorkOrder[];
    expect(body.map((o) => o.id)).toEqual([open.id]);
  });

  it('rejects an invalid status filter with 400', async () => {
    const response = await get('?status=bogus');
    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiError).error.fieldErrors?.status).toBeDefined();
  });

  it('rejects a one-character title with field errors and persists nothing', async () => {
    const response = await post({ title: 'a', priority: 'Low' });
    expect(response.status).toBe(400);
    const body = (await response.json()) as ApiError;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.fieldErrors?.title).toEqual(['Title must be at least 2 characters']);
    expect(await listOrders()).toEqual([]);
  });

  it('rejects a whitespace-only title', async () => {
    const response = await post({ title: '    ', priority: 'Low' });
    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiError).error.fieldErrors?.title).toBeDefined();
  });

  it.each([['null'], ['[]'], ['"text"'], ['42']])(
    'rejects the non-object JSON body %s with 400 instead of crashing',
    async (raw) => {
      const response = await post(raw);
      expect(response.status).toBe(400);
      expect(((await response.json()) as ApiError).error.code).toBe('VALIDATION_ERROR');
    },
  );

  it('rejects malformed JSON with INVALID_JSON', async () => {
    const response = await post('{"title":');
    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiError).error.code).toBe('INVALID_JSON');
  });
});
