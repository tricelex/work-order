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

describe('/api/work-orders/[id]', () => {
  it('gets one work order', async () => {
    const order = await createOrder({ title: 'Check boiler', priority: 'Medium' });
    const response = await GET(new Request(url(order.id)), ctx(order.id));
    expect(response.status).toBe(200);
    expect(((await response.json()) as WorkOrder).id).toBe(order.id);
  });

  it('updates every editable field and changes updatedAt', async () => {
    const order = await createOrder({ title: 'Check boiler', priority: 'Medium' });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const response = await put(order.id, {
      title: 'Check boiler (rush)',
      description: 'Pressure low',
      priority: 'High',
      status: 'In Progress',
    });
    expect(response.status).toBe(200);
    const updated = (await response.json()) as WorkOrder;
    expect(updated).toMatchObject({
      id: order.id,
      title: 'Check boiler (rush)',
      description: 'Pressure low',
      priority: 'High',
      status: 'In Progress',
    });
    expect(updated.updatedAt > order.updatedAt).toBe(true);
  });

  it('rejects an incomplete update and leaves the order unchanged', async () => {
    const order = await createOrder({ title: 'Check boiler', priority: 'Medium' });
    const response = await put(order.id, { title: 'Check boiler (rush)' });
    expect(response.status).toBe(400);
    const body = (await response.json()) as ApiError;
    expect(Object.keys(body.error.fieldErrors ?? {})).toEqual(
      expect.arrayContaining(['description', 'priority', 'status']),
    );
    const after = await GET(new Request(url(order.id)), ctx(order.id));
    expect(((await after.json()) as WorkOrder).title).toBe('Check boiler');
  });

  it('deletes with 204 and then returns 404', async () => {
    const order = await createOrder({ title: 'Check boiler', priority: 'Medium' });
    const removed = await DELETE(new Request(url(order.id), { method: 'DELETE' }), ctx(order.id));
    expect(removed.status).toBe(204);
    expect(await removed.text()).toBe('');
    const after = await GET(new Request(url(order.id)), ctx(order.id));
    expect(after.status).toBe(404);
  });

  it.each([
    ['an unknown uuid', randomUUID()],
    ['a non-uuid id', 'not-a-uuid'],
  ])('returns 404 NOT_FOUND for %s on every method', async (_label, id) => {
    const responses = await Promise.all([
      GET(new Request(url(id)), ctx(id)),
      put(id, { title: 'Valid title', description: '', priority: 'Low', status: 'Open' }),
      DELETE(new Request(url(id), { method: 'DELETE' }), ctx(id)),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(((await response.json()) as ApiError).error.code).toBe('NOT_FOUND');
    }
  });
});
