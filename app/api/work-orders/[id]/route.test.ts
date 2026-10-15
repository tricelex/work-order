// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiError, WorkOrder } from '@/lib/api/generated/model';
import { createOrder } from '@/lib/work-orders/store';
import { DELETE, GET, PUT } from './route';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'wo-api-id-'));
  process.env.WORK_ORDERS_FILE = path.join(dir, 'work-orders.json');
});

afterEach(async () => {
  delete process.env.WORK_ORDERS_FILE;
  await rm(dir, { recursive: true, force: true });
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const url = (id: string) => `http://localhost/api/work-orders/${id}`;
const put = (id: string, body: unknown) =>
  PUT(
    new Request(url(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    ctx(id),
  );
const get = (id: string) => GET(new Request(url(id)), ctx(id));
const del = (id: string) => DELETE(new Request(url(id), { method: 'DELETE' }), ctx(id));

describe('/api/work-orders/[id]', () => {
  it('updates, rejects bad updates, deletes, and returns 404 for missing ids', async () => {
    const order = await createOrder({ title: 'Check boiler', priority: 'Medium' });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const updated = (await (
      await put(order.id, {
        title: 'Check boiler (rush)',
        description: 'Pressure low',
        priority: 'High',
        status: 'In Progress',
      })
    ).json()) as WorkOrder;
    expect(updated).toMatchObject({ id: order.id, title: 'Check boiler (rush)', status: 'In Progress' });
    expect(updated.updatedAt > order.updatedAt).toBe(true);

    const invalid = await put(order.id, { title: 'x' });
    expect(invalid.status).toBe(400);
    expect(Object.keys(((await invalid.json()) as ApiError).error.fieldErrors ?? {})).toContain('title');

    const removed = await del(order.id);
    expect(removed.status).toBe(204);
    expect((await get(order.id)).status).toBe(404);

    for (const id of [randomUUID(), 'not-a-uuid']) {
      expect((await get(id)).status).toBe(404);
      expect((await del(id)).status).toBe(404);
    }
  });
});
