// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createOrder,
  deleteOrder,
  getOrder,
  listOrders,
  replaceAllOrders,
  updateOrder,
} from './store';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'wo-store-'));
  file = path.join(dir, 'nested', 'work-orders.json');
  process.env.WORK_ORDERS_FILE = file;
});

afterEach(async () => {
  delete process.env.WORK_ORDERS_FILE;
  await rm(dir, { recursive: true, force: true });
});

describe('store', () => {
  it('returns an empty list when the file does not exist', async () => {
    expect(await listOrders()).toEqual([]);
  });

  it('persists ten concurrent creates', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        createOrder({ title: `Order ${i}`, priority: 'Low' }),
      ),
    );
    const saved = await listOrders();
    expect(saved).toHaveLength(10);
    expect(new Set(saved.map((o) => o.id)).size).toBe(10);
  });

  it('creates Open orders, updates them and lists newest first', async () => {
    const first = await createOrder({ title: 'First', priority: 'Low' });
    expect(first.status).toBe('Open');
    expect(first.description).toBe('');
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await createOrder({ title: 'Second', priority: 'High' });
    expect((await listOrders()).map((o) => o.id)).toEqual([second.id, first.id]);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = await updateOrder(first.id, {
      title: 'First edited',
      description: 'x',
      priority: 'Medium',
      status: 'Done',
    });
    expect((updated?.updatedAt ?? '') > first.updatedAt).toBe(true);
    expect((await listOrders()).map((o) => o.id)).toEqual([first.id, second.id]);
    expect((await listOrders({ status: 'Done' })).map((o) => o.id)).toEqual([first.id]);
    expect(await getOrder(first.id)).toEqual(updated);
  });

  it('returns null or false for unknown ids', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(await getOrder(id)).toBeNull();
    expect(
      await updateOrder(id, { title: 'Nope', description: '', priority: 'Low', status: 'Open' }),
    ).toBeNull();
    expect(await deleteOrder(id)).toBe(false);
  });

  it('leaves a valid empty array after the last order is deleted', async () => {
    const order = await createOrder({ title: 'Only one', priority: 'Low' });
    expect(await deleteOrder(order.id)).toBe(true);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual([]);
  });

  it('replaces all orders', async () => {
    const order = await createOrder({ title: 'Old', priority: 'Low' });
    await replaceAllOrders([{ ...order, id: '22222222-2222-4222-8222-222222222222', title: 'New' }]);
    expect((await listOrders()).map((o) => o.title)).toEqual(['New']);
  });

  it.each([
    ['not JSON', '{oops'],
    ['an empty file', ''],
    ['the wrong shape', '[{"id":"x"}]'],
  ])('throws a descriptive error and keeps the file when it contains %s', async (_label, content) => {
    await createOrder({ title: 'Seed', priority: 'Low' });
    await writeFile(file, content);
    await expect(listOrders()).rejects.toThrow(/Work orders file/);
    await expect(createOrder({ title: 'Blocked', priority: 'Low' })).rejects.toThrow(/Work orders file/);
    expect(await readFile(file, 'utf8')).toBe(content);
  });
});
