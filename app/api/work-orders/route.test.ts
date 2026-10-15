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

describe('/api/work-orders', () => {
  it('creates an Open work order, lists it and filters by status', async () => {
    const response = await post({ title: '  Replace filter  ', priority: 'High', status: 'Done' });
    expect(response.status).toBe(201);
    const created = (await response.json()) as WorkOrder;
    expect(created).toMatchObject({ title: 'Replace filter', priority: 'High', status: 'Open' });

    await replaceAllOrders([
      created,
      { ...created, id: '22222222-2222-4222-8222-222222222222', title: 'Done one', status: 'Done' },
    ]);
    expect(((await (await get()).json()) as WorkOrder[]).length).toBe(2);
    const open = (await (await get('?status=Open')).json()) as WorkOrder[];
    expect(open.map((o) => o.id)).toEqual([created.id]);
  });

  it('rejects invalid input with field-level errors and persists nothing', async () => {
    const tooShort = await post({ title: 'a', priority: 'Low' });
    expect(tooShort.status).toBe(400);
    const body = (await tooShort.json()) as ApiError;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.fieldErrors?.title).toEqual(['Title must be at least 2 characters']);

    for (const invalid of [{ title: '    ', priority: 'Low' }, 'null', '[]', '"text"']) {
      expect((await post(invalid)).status).toBe(400);
    }
    const malformed = await post('{"title":');
    expect(((await malformed.json()) as ApiError).error.code).toBe('INVALID_JSON');
    expect((await get('?status=bogus')).status).toBe(400);
    expect(await listOrders()).toEqual([]);
  });
});
