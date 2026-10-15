// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createOrder, listOrders } from './store';

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
  it('starts empty and persists ten concurrent creates', async () => {
    expect(await listOrders()).toEqual([]);
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        createOrder({ title: `Order ${i}`, priority: 'Low' }),
      ),
    );
    const saved = await listOrders();
    expect(saved).toHaveLength(10);
    expect(new Set(saved.map((o) => o.id)).size).toBe(10);
  });

  it('throws a descriptive error and keeps the file when it is corrupt', async () => {
    await createOrder({ title: 'Seed', priority: 'Low' });
    for (const content of ['{oops', '', '[{"id":"x"}]']) {
      await writeFile(file, content);
      await expect(listOrders()).rejects.toThrow(/Work orders file/);
      await expect(createOrder({ title: 'Blocked', priority: 'Low' })).rejects.toThrow(/Work orders file/);
      expect(await readFile(file, 'utf8')).toBe(content);
    }
  });
});
