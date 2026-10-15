import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type {
  CreateWorkOrderInput,
  Status,
  UpdateWorkOrderInput,
  WorkOrder,
} from '@/lib/api/generated/model';
import { ListWorkOrdersResponse } from '@/lib/api/generated/zod';

/** Resolves the data file path at call time so tests can point it at a temp file. */
function filePath(): string {
  return process.env.WORK_ORDERS_FILE ?? path.join(process.cwd(), 'data', 'work-orders.json');
}

/** Reads and validates the file. A missing file is an empty list; anything invalid throws. */
async function readAll(): Promise<WorkOrder[]> {
  const file = filePath();
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Work orders file ${file} is not valid JSON`);
  }
  const parsed = ListWorkOrdersResponse.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Work orders file ${file} has an invalid shape:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/** Writes atomically: temp file in the same directory, then rename. */
async function writeAll(items: WorkOrder[]): Promise<void> {
  const file = filePath();
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
  await rename(tmp, file);
}

let queue: Promise<unknown> = Promise.resolve();

/** Serializes read-modify-write tasks so concurrent mutations cannot lose updates. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

/** Lists work orders, newest `updatedAt` first, optionally filtered by status. */
export async function listOrders(filter?: { status?: Status }): Promise<WorkOrder[]> {
  const all = await readAll();
  return all
    .filter((order) => !filter?.status || order.status === filter.status)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Returns one work order or null. */
export async function getOrder(id: string): Promise<WorkOrder | null> {
  return (await readAll()).find((order) => order.id === id) ?? null;
}

/** Creates an `Open` work order with a server-generated id and timestamp. */
export function createOrder(input: CreateWorkOrderInput): Promise<WorkOrder> {
  return enqueue(async () => {
    const all = await readAll();
    const order: WorkOrder = {
      id: randomUUID(),
      title: input.title,
      description: input.description ?? '',
      priority: input.priority,
      status: 'Open',
      updatedAt: new Date().toISOString(),
    };
    await writeAll([...all, order]);
    return order;
  });
}

/** Replaces every editable field of an order and bumps `updatedAt`. Null if unknown. */
export function updateOrder(id: string, input: UpdateWorkOrderInput): Promise<WorkOrder | null> {
  return enqueue(async () => {
    const all = await readAll();
    const index = all.findIndex((order) => order.id === id);
    if (index === -1) return null;
    const updated: WorkOrder = { ...all[index], ...input, updatedAt: new Date().toISOString() };
    all[index] = updated;
    await writeAll(all);
    return updated;
  });
}

/** Deletes an order. Returns false if it did not exist. */
export function deleteOrder(id: string): Promise<boolean> {
  return enqueue(async () => {
    const all = await readAll();
    const remaining = all.filter((order) => order.id !== id);
    if (remaining.length === all.length) return false;
    await writeAll(remaining);
    return true;
  });
}

/** Overwrites the whole file. Used by the seed script only. */
export function replaceAllOrders(items: WorkOrder[]): Promise<void> {
  return enqueue(() => writeAll(items));
}
