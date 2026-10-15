# Technician Work Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js App Router app to manage technician Work Orders (list with sorting and status filter, create, edit, delete, detail) with file-JSON persistence, driven by a contract-first OpenAPI spec.

**Architecture:** `openapi.yaml` generates types, fetch functions, TanStack Query hooks and Zod schemas (Orval) into `lib/api/generated/`; a small hand-written wrapper (`lib/api/fetcher.ts`) makes the generated functions return plain data and throw on non-2xx. Route Handlers validate with the generated Zod schemas and call a server-only file store. The list page prefetches into a per-request QueryClient (store as `queryFn`) and hydrates a client TanStack Table; detail and edit pages read the store directly; mutations (generated hooks) run in four client components and invalidate list queries.

**Tech Stack:** Next.js 16.4.1 (App Router), React 19.3, TypeScript 5.x strict, Tailwind 4, TanStack Query 5, TanStack Table 8.21.3, Orval 8.43.0, Zod 4, Vitest 5 + Testing Library + jsdom, Playwright, npm.

**Spec:** `docs/superpowers/specs/2026-10-15-work-orders-design.md` (source requirements: `PRD.md`). Executors read both.

## Global Constraints

- Next.js 16.4.1 has breaking changes versus older versions. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code (`AGENTS.md`). `params` and `searchParams` are Promises: always `await` them. `app/error.tsx` receives `{ error, retry }` (not `reset`).
- **npm only.** Keep `package-lock.json`. No pnpm files. Runtime deps pinned exact (`--save-exact`). `@tanstack/react-table` exactly `8.21.3`, `orval` exactly `8.43.0`.
- TypeScript stays on 5.x (`^5`); do not run `npm i typescript@latest`.
- `next.config.ts` must NOT enable `cacheComponents` or `partialPrefetching` (they make `dynamic = 'force-dynamic'` an error).
- Generated code lives in `lib/api/generated/`, is committed, is never hand-edited, and is excluded from ESLint and coverage. The only hand-written codegen glue is `lib/api/fetcher.ts` (Orval's mutator), outside that folder.
- Client Components are exactly four: `Providers`, `WorkOrdersTable`, `WorkOrderForm`, `DeleteWorkOrderButton`. Client code never imports the store or `server-only` modules.
- `dangerouslySetInnerHTML` is forbidden anywhere in the repo.
- Description renders as plain text only (`whitespace-pre-wrap break-words`).
- Types come from the generated `WorkOrder`, `Priority`, `Status`, `CreateWorkOrderInput`, `UpdateWorkOrderInput`, `ApiError` (all from `@/lib/api/generated/model`). No hand-written duplicates.
- Validation limits: title 2-80, description max 2000, priority `Low|Medium|High`, status `Open|In Progress|Done`. Client form uses only `required` and `maxLength`.
- Dates display via `Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })` inside `<time dateTime>`; column header "Updated (UTC)".
- No dark mode, no toast library, no UI library, no pagination, no search. No dead code, no placeholder files, no comments that restate code; short doc comments on exported functions and components.
- No attribution lines in commit messages. Never commit `.env*` or `data/`.

## Generated API reference (verified against Orval 8.43.0 output)

Import paths and names the tasks below rely on:

| Import | Names |
|---|---|
| `@/lib/api/generated/model` | types `WorkOrder`, `CreateWorkOrderInput`, `UpdateWorkOrderInput`, `ApiError`, `ListWorkOrdersParams`; and for `Priority` and `Status` both a type and a const object (`Status.In_Progress === 'In Progress'`; use `Object.values(Status)` for the list of values) |
| `@/lib/api/generated/zod` | per-operation schemas: `ListWorkOrdersQueryParams` (`{ status?: enum }`), `ListWorkOrdersResponse` (array of work orders), `CreateWorkOrderBody` (description defaults to `""`), `UpdateWorkOrderBody`, `GetWorkOrderParams` (`{ id: uuid }`) |
| `@/lib/api/generated/api` | functions `listWorkOrders(params?)`, `createWorkOrder(data)`, `getWorkOrder(id)`, `updateWorkOrder(id, data)`, `deleteWorkOrder(id)` returning plain data; `getListWorkOrdersQueryKey(params?)` (`['/api/work-orders', params?]`); `getListWorkOrdersSuspenseQueryOptions(params?)`; hooks `useListWorkOrdersSuspense`, `useCreateWorkOrder`, `useUpdateWorkOrder`, `useDeleteWorkOrder` |
| `@/lib/api/fetcher` (hand-written) | `customFetch`, `ApiRequestError`, `ErrorType`, `toApiError` |

Facts to rely on:
- Mutation variables: create `{ data }`, update `{ id, data }`, delete `{ id }`. List params are `{ status }` (not nested under `query`).
- Requests use the global `fetch` with relative URLs like `/api/work-orders`. Tests stub the global `fetch`.
- `customFetch` throws `ApiRequestError` (`status`, `body`) on any non-2xx, so generated hooks type their errors as `ApiRequestError`. Network failures throw a `TypeError`.
- `getListWorkOrdersQueryKey()` with no params is the prefix `['/api/work-orders']`, so `invalidateQueries({ queryKey: getListWorkOrdersQueryKey() })` matches every list variant (and not single-order keys, which are `['/api/work-orders/<id>']`).
- Zod issue shapes: `too_small` (`minimum`), `too_big` (`maximum`), `invalid_type` (missing or wrong type), `invalid_value` (`values`). `path[0]` is the field name.
- Orval generates no Zod for error bodies and no standalone `WorkOrder` or enum schemas, hence `toApiError` and the model constants.

## Review Focus

Failure modes the spec implies but no spec test names. Each has a pinned test in the owning task:

1. A JSON body that is valid but not an object (`null`, `[]`, `"x"`) must give `400 VALIDATION_ERROR`, never `500` (Task 4).
2. A whitespace-only title (`"   "`) must give `400` with `fieldErrors.title`, because the title is trimmed before validation (Task 4).
3. An empty (0-byte) or wrong-shape data file must throw a descriptive error and never be silently reset; deleting the last order must leave a valid `[]` file (Task 3).
4. `/?status=bogus` and `/?status=Open&status=Done` must render the unfiltered list without crashing (Task 10, e2e).
5. Double-clicking Submit must send exactly one request (Task 8).

---

### Task 1: Scaffold, config and tooling

**Files:**
- Modify: `next.config.ts`, `package.json`, `eslint.config.mjs`, `.gitignore`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`
- Create: `.gitattributes`, `vitest.config.ts`
- Delete: `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `node_modules/` (reinstalled with npm)

**Interfaces:**
- Produces: npm scripts `dev build start lint typecheck test seed generate:api e2e`; `@/` path alias in Vitest; Vitest alias `server-only` to its empty module; global CSS utilities `btn`, `btn-primary`, `btn-secondary`, `btn-danger`, `field`.

- [ ] **Step 1: Remove pnpm artifacts and reinstall with npm**

```bash
cd /Users/chuckz/Code/29SignalsDev/work-order
rm -rf node_modules pnpm-workspace.yaml pnpm-lock.yaml .next
npm install
```
Expected: `package-lock.json` is updated, `node_modules/` is a flat npm tree, `npm ls typescript` shows 5.x.

- [ ] **Step 2: Disable Cache Components**

Replace `next.config.ts` with:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
```

- [ ] **Step 3: Install dependencies**

```bash
npm install --save-exact @tanstack/react-query@5.104.2 @tanstack/react-table@8.21.3 zod@4.6.7 server-only@0.0.1
npm install -D --save-exact orval@8.43.0 vitest@5.0.4 tsx@4.23.15 jsdom @vitejs/plugin-react @testing-library/react @testing-library/dom @testing-library/user-event @playwright/test
npx playwright install chromium
ls node_modules/server-only
```
Expected: `ls` lists `empty.js` and `index.js`. If the versions above no longer exist, use the closest published versions and keep them exact.

- [ ] **Step 4: Update `package.json` scripts and engines**

Edit `package.json` so `scripts` and `engines` read:

```json
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "seed": "tsx --conditions=react-server scripts/seed.ts",
    "generate:api": "rm -rf lib/api/generated && orval",
    "e2e": "playwright test"
  },
```
(`--conditions=react-server` makes `server-only` resolve to its empty module under `tsx`, so no stub file is needed.)

- [ ] **Step 5: ESLint ignores, gitignore, gitattributes**

In `eslint.config.mjs`, add `"lib/api/generated/**"` to the `globalIgnores([...])` array (after `"next-env.d.ts",`).

Append to `.gitignore`:

```
# app data and test output
/data/
/playwright-report/
/test-results/
```

Create `.gitattributes`:

```
lib/api/generated/** linguist-generated=true
```

- [ ] **Step 6: Vitest config**

Create `vitest.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': root,
      'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    coverage: { exclude: ['lib/api/generated/**'] },
  },
});
```

- [ ] **Step 7: Global styles, layout shell and a temporary home page**

Replace `app/globals.css` with:

```css
@import "tailwindcss";

@utility btn {
  @apply inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-60;
}

@utility btn-primary {
  @apply btn border-blue-700 bg-blue-700 text-white hover:bg-blue-800;
}

@utility btn-secondary {
  @apply btn border-slate-400 bg-white text-slate-900 hover:bg-slate-100;
}

@utility btn-danger {
  @apply btn border-red-700 bg-red-700 text-white hover:bg-red-800;
}

@utility field {
  @apply block w-full rounded-md border border-slate-500 bg-white px-3 py-2 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-700 aria-[invalid=true]:border-red-700;
}
```

Replace `app/layout.tsx` with (the real header comes in Task 6; system fonts avoid a build-time Google Fonts fetch):

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Work Orders", template: "%s · Work Orders" },
  description: "Manage technician work orders.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
```

Replace `app/page.tsx` with a minimal placeholder that Task 7 overwrites:

```tsx
export default function HomePage() {
  return <main id="main">Work orders</main>;
}
```

- [ ] **Step 8: Verify the toolchain**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all three pass. (`npm test` reports "No test files found"; that is fine until Task 3.)

- [ ] **Step 9: Commit**

```bash
git add -A -- . ':!PRD.md'
git status --short   # expect no data/, no .env*, no node_modules
git commit -m "chore: scaffold npm toolchain, disable cache components, add vitest config"
```

---

### Task 2: OpenAPI contract, fetch wrapper and Orval codegen

**Files:**
- Create: `openapi.yaml`, `lib/api/fetcher.ts`, `lib/api/fetcher.test.ts`, `orval.config.ts`, `lib/api/generated/**` (generated)

**Interfaces:**
- Produces: everything in "Generated API reference", including from `lib/api/fetcher.ts`:
  - `customFetch<T>(url: string, options: RequestInit): Promise<T>` returns the parsed JSON body (`undefined` for an empty body) and throws `ApiRequestError` on non-2xx
  - `class ApiRequestError extends Error { status: number; body: unknown }`
  - `type ErrorType<E>` (always `ApiRequestError`; Orval uses it to type hook errors)
  - `toApiError(error: unknown): ApiError | null` returns the `ApiError` body of a failed request, else null

- [ ] **Step 1: Write `openapi.yaml`**

```yaml
openapi: 3.1.0
info:
  title: Work Orders API
  version: 1.0.0
servers:
  - url: /api
paths:
  /work-orders:
    get:
      operationId: listWorkOrders
      parameters:
        - name: status
          in: query
          required: false
          schema:
            $ref: '#/components/schemas/Status'
      responses:
        '200':
          description: Work orders, newest first
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/WorkOrder'
        '400':
          $ref: '#/components/responses/ValidationError'
    post:
      operationId: createWorkOrder
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateWorkOrderInput'
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/WorkOrder'
        '400':
          $ref: '#/components/responses/ValidationError'
  /work-orders/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
          format: uuid
    get:
      operationId: getWorkOrder
      responses:
        '200':
          description: The work order
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/WorkOrder'
        '404':
          $ref: '#/components/responses/NotFound'
    put:
      operationId: updateWorkOrder
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateWorkOrderInput'
      responses:
        '200':
          description: Updated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/WorkOrder'
        '400':
          $ref: '#/components/responses/ValidationError'
        '404':
          $ref: '#/components/responses/NotFound'
    delete:
      operationId: deleteWorkOrder
      responses:
        '204':
          description: Deleted
        '404':
          $ref: '#/components/responses/NotFound'
components:
  responses:
    ValidationError:
      description: Invalid request
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ApiError'
    NotFound:
      description: Work order not found
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ApiError'
  schemas:
    Priority:
      type: string
      enum: [Low, Medium, High]
    Status:
      type: string
      enum: [Open, In Progress, Done]
    WorkOrder:
      type: object
      required: [id, title, description, priority, status, updatedAt]
      properties:
        id:
          type: string
          format: uuid
        title:
          type: string
          minLength: 2
          maxLength: 80
        description:
          type: string
          maxLength: 2000
        priority:
          $ref: '#/components/schemas/Priority'
        status:
          $ref: '#/components/schemas/Status'
        updatedAt:
          type: string
          format: date-time
    CreateWorkOrderInput:
      type: object
      required: [title, priority]
      properties:
        title:
          type: string
          minLength: 2
          maxLength: 80
        description:
          type: string
          maxLength: 2000
          default: ''
        priority:
          $ref: '#/components/schemas/Priority'
    UpdateWorkOrderInput:
      type: object
      required: [title, description, priority, status]
      properties:
        title:
          type: string
          minLength: 2
          maxLength: 80
        description:
          type: string
          maxLength: 2000
        priority:
          $ref: '#/components/schemas/Priority'
        status:
          $ref: '#/components/schemas/Status'
    ApiError:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message]
          properties:
            code:
              type: string
              enum: [VALIDATION_ERROR, INVALID_JSON, NOT_FOUND, INTERNAL_ERROR]
            message:
              type: string
            fieldErrors:
              type: object
              additionalProperties:
                type: array
                items:
                  type: string
```

- [ ] **Step 2: Write the failing fetcher tests**

`lib/api/fetcher.test.ts`:

```ts
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
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run lib/api/fetcher.test.ts`
Expected: FAIL (cannot resolve `./fetcher`).

- [ ] **Step 4: Implement the fetch wrapper**

`lib/api/fetcher.ts`:

```ts
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
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run lib/api/fetcher.test.ts`
Expected: PASS.

- [ ] **Step 6: Write `orval.config.ts`**

```ts
import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: './openapi.yaml',
    output: {
      target: './lib/api/generated/api.ts',
      schemas: './lib/api/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      mode: 'single',
      baseUrl: '/api',
      clean: false,
      override: {
        mutator: { path: './lib/api/fetcher.ts', name: 'customFetch' },
        fetch: { includeHttpResponseReturnType: false },
        query: { useSuspenseQuery: true },
      },
    },
  },
  zod: {
    input: './openapi.yaml',
    output: {
      target: './lib/api/generated/zod.ts',
      client: 'zod',
      mode: 'single',
      clean: false,
    },
  },
});
```

- [ ] **Step 7: Generate and verify the names**

Run: `npm run generate:api`
Expected: both `api` and `zod` report success and `lib/api/generated/` contains `api.ts`, `zod.ts` and `model/`.

Run:
```bash
grep -E "^export (const|function) (listWorkOrders|createWorkOrder|getWorkOrder|updateWorkOrder|deleteWorkOrder|getListWorkOrdersQueryKey|getListWorkOrdersSuspenseQueryOptions|useListWorkOrdersSuspense|useCreateWorkOrder|useUpdateWorkOrder|useDeleteWorkOrder)\b" lib/api/generated/api.ts | cut -c1-90
grep -E "^export const (ListWorkOrdersQueryParams|ListWorkOrdersResponse|CreateWorkOrderBody|UpdateWorkOrderBody|GetWorkOrderParams) " lib/api/generated/zod.ts
grep -n "from '../fetcher'\|\`/api/work-orders\`" lib/api/generated/api.ts | head -4
```
Expected: every name in the "Generated API reference" table is found, the generated file imports `../fetcher`, and URLs start with `/api/work-orders`. If any name differs, stop and update this plan's reference table and later tasks before continuing.

- [ ] **Step 8: Verify determinism and type safety**

Run: `npm run generate:api && git status --short lib/api/generated | head -3; npm run typecheck && npm run lint && npx vitest run lib/api`
Expected: regenerating produces no change relative to the first run; typecheck, lint and the fetcher tests pass.

- [ ] **Step 9: Commit**

```bash
git add openapi.yaml orval.config.ts lib/api/fetcher.ts lib/api/fetcher.test.ts lib/api/generated package.json package-lock.json
git commit -m "feat: add OpenAPI contract, Orval codegen and fetch wrapper"
```

---

### Task 3: File store

**Files:**
- Create: `lib/work-orders/store.ts`
- Test: `lib/work-orders/store.test.ts`

**Interfaces:**
- Consumes: `ListWorkOrdersResponse` (Zod array of work orders); types `WorkOrder`, `Status`, `CreateWorkOrderInput`, `UpdateWorkOrderInput`.
- Produces (all server-only):
  - `listOrders(filter?: { status?: Status }): Promise<WorkOrder[]>` (newest `updatedAt` first)
  - `getOrder(id: string): Promise<WorkOrder | null>`
  - `createOrder(input: CreateWorkOrderInput): Promise<WorkOrder>` (status `Open`)
  - `updateOrder(id: string, input: UpdateWorkOrderInput): Promise<WorkOrder | null>`
  - `deleteOrder(id: string): Promise<boolean>`
  - `replaceAllOrders(items: WorkOrder[]): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `lib/work-orders/store.test.ts`:

```ts
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
    expect(updated?.updatedAt > first.updatedAt).toBe(true);
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/work-orders/store.test.ts`
Expected: FAIL (`Failed to resolve import "./store"`).

- [ ] **Step 3: Implement the store**

Create `lib/work-orders/store.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/work-orders/store.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck && npm run lint
git add lib/work-orders/store.ts lib/work-orders/store.test.ts
git commit -m "feat: add atomic, queue-serialized JSON work order store"
```

---

### Task 4: API helpers and Route Handlers

**Files:**
- Create: `lib/api/responses.ts`, `lib/api/parse-body.ts`, `app/api/work-orders/route.ts`, `app/api/work-orders/[id]/route.ts`
- Test: `app/api/work-orders/route.test.ts`, `app/api/work-orders/[id]/route.test.ts`

**Interfaces:**
- Consumes: store functions (Task 3); `ListWorkOrdersQueryParams`, `CreateWorkOrderBody`, `UpdateWorkOrderBody`, `GetWorkOrderParams`.
- Produces:
  - `lib/api/responses.ts`: `json<T>(body: T, status?: number): Response`, `noContent(): Response`, `apiError(status: number, code: ApiError['error']['code'], message: string, fieldErrors?: Record<string, string[]>): Response`, `validationError(error: ZodError): Response`, `serverError(error: unknown): Response`
  - `lib/api/parse-body.ts`: `parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<{ data: z.output<S> } | { response: Response }>` (handles `INVALID_JSON`, trims `title`, validates)
  - Route exports: `GET`, `POST` in `route.ts`; `GET`, `PUT`, `DELETE` in `[id]/route.ts`; `dynamic = 'force-dynamic'`

- [ ] **Step 1: Write the failing collection tests**

Create `app/api/work-orders/route.test.ts`:

```ts
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
```

- [ ] **Step 2: Write the failing by-id tests**

Create `app/api/work-orders/[id]/route.test.ts`:

```ts
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
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run app/api`
Expected: FAIL (cannot resolve `./route`).

- [ ] **Step 4: Implement `lib/api/responses.ts`**

```ts
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
```

- [ ] **Step 5: Implement `lib/api/parse-body.ts`**

```ts
import type { z } from 'zod';
import { apiError, validationError } from '@/lib/api/responses';

/** OpenAPI cannot express "trim", so titles are trimmed before validation. */
function trimTitle(body: unknown): unknown {
  if (typeof body === 'object' && body !== null && 'title' in body && typeof body.title === 'string') {
    return { ...body, title: body.title.trim() };
  }
  return body;
}

/**
 * Reads the JSON body and validates it with a generated Zod schema.
 * Returns the parsed data, or a ready-to-return 400 response.
 */
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ data: z.output<S> } | { response: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { response: apiError(400, 'INVALID_JSON', 'Request body must be valid JSON') };
  }
  const result = schema.safeParse(trimTitle(raw));
  return result.success ? { data: result.data } : { response: validationError(result.error) };
}
```

- [ ] **Step 6: Implement the collection handler**

Create `app/api/work-orders/route.ts`:

```ts
import type { WorkOrder } from '@/lib/api/generated/model';
import { CreateWorkOrderBody, ListWorkOrdersQueryParams } from '@/lib/api/generated/zod';
import { parseBody } from '@/lib/api/parse-body';
import { json, serverError, validationError } from '@/lib/api/responses';
import { createOrder, listOrders } from '@/lib/work-orders/store';

export const dynamic = 'force-dynamic';

/** Lists work orders, optionally filtered by `?status=`. */
export async function GET(request: Request) {
  try {
    const status = new URL(request.url).searchParams.get('status') ?? undefined;
    const query = ListWorkOrdersQueryParams.safeParse({ status });
    if (!query.success) return validationError(query.error);
    return json<WorkOrder[]>(await listOrders(query.data));
  } catch (error) {
    return serverError(error);
  }
}

/** Creates an `Open` work order. */
export async function POST(request: Request) {
  try {
    const body = await parseBody(request, CreateWorkOrderBody);
    if ('response' in body) return body.response;
    return json<WorkOrder>(await createOrder(body.data), 201);
  } catch (error) {
    return serverError(error);
  }
}
```

- [ ] **Step 7: Implement the by-id handler**

Create `app/api/work-orders/[id]/route.ts`:

```ts
import type { WorkOrder } from '@/lib/api/generated/model';
import { GetWorkOrderParams, UpdateWorkOrderBody } from '@/lib/api/generated/zod';
import { parseBody } from '@/lib/api/parse-body';
import { apiError, json, noContent, serverError } from '@/lib/api/responses';
import { deleteOrder, getOrder, updateOrder } from '@/lib/work-orders/store';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const notFoundResponse = () => apiError(404, 'NOT_FOUND', 'Work order not found');

/** Resolves the route id, or null when it is not a valid uuid (treated as not found). */
async function resolveId({ params }: Context): Promise<string | null> {
  const parsed = GetWorkOrderParams.safeParse(await params);
  return parsed.success ? parsed.data.id : null;
}

/** Returns one work order. */
export async function GET(_request: Request, context: Context) {
  try {
    const id = await resolveId(context);
    const order = id ? await getOrder(id) : null;
    return order ? json<WorkOrder>(order) : notFoundResponse();
  } catch (error) {
    return serverError(error);
  }
}

/** Replaces all editable fields of a work order. */
export async function PUT(request: Request, context: Context) {
  try {
    const id = await resolveId(context);
    if (!id) return notFoundResponse();
    const body = await parseBody(request, UpdateWorkOrderBody);
    if ('response' in body) return body.response;
    const order = await updateOrder(id, body.data);
    return order ? json<WorkOrder>(order) : notFoundResponse();
  } catch (error) {
    return serverError(error);
  }
}

/** Deletes a work order. */
export async function DELETE(_request: Request, context: Context) {
  try {
    const id = await resolveId(context);
    const deleted = id ? await deleteOrder(id) : false;
    return deleted ? noContent() : notFoundResponse();
  } catch (error) {
    return serverError(error);
  }
}
```

- [ ] **Step 8: Run to verify they pass**

Run: `npx vitest run app/api && npm run typecheck && npm run lint`
Expected: all PASS. If `non-object JSON` cases return 500, `trimTitle`/`parseBody` is mishandling a non-object (check the narrowing).

- [ ] **Step 9: Commit**

```bash
git add lib/api/responses.ts lib/api/parse-body.ts app/api
git commit -m "feat: add work order route handlers with generated-schema validation"
```

---

### Task 5: Seed script

**Files:**
- Create: `scripts/seed.ts`

**Interfaces:**
- Consumes: `replaceAllOrders`, type `WorkOrder`.

- [ ] **Step 1: Write the script**

```ts
import { randomUUID } from 'node:crypto';
import type { WorkOrder } from '@/lib/api/generated/model';
import { replaceAllOrders } from '@/lib/work-orders/store';

const seeds: Omit<WorkOrder, 'id'>[] = [
  {
    title: 'Replace HVAC filter – Building B',
    description: 'Quarterly swap. Use MERV 13 filters from the supply closet on level 2.',
    priority: 'Medium',
    status: 'Open',
    updatedAt: '2026-10-12T08:15:00.000Z',
  },
  {
    title: 'Inspect rooftop unit 3 for refrigerant leak',
    description: 'Tenant reports warm air on floor 4. Check pressure and sight glass.',
    priority: 'High',
    status: 'In Progress',
    updatedAt: '2026-10-14T13:40:00.000Z',
  },
  {
    title: 'Reset tripped breaker – Panel 4A',
    description: 'Breaker 12 tripped twice this week. Reset and log the load reading.',
    priority: 'High',
    status: 'Done',
    updatedAt: '2026-10-10T16:05:00.000Z',
  },
  {
    title: 'Replace burnt-out stairwell lighting',
    description: 'Stairwell C, levels 2 and 3.',
    priority: 'Low',
    status: 'Open',
    updatedAt: '2026-10-09T09:30:00.000Z',
  },
  {
    title: 'Lubricate loading dock door rollers',
    description: '',
    priority: 'Low',
    status: 'Done',
    updatedAt: '2026-10-05T11:20:00.000Z',
  },
  {
    title: 'Calibrate boiler thermostat – Building A',
    description: 'Setpoint drifts about 3°C above target overnight.',
    priority: 'Medium',
    status: 'In Progress',
    updatedAt: '2026-10-13T07:50:00.000Z',
  },
  {
    title: 'Investigate intermittent elevator door fault',
    description: 'Car 2 door reopens twice before closing. Safety edge sensor suspected.',
    priority: 'High',
    status: 'Open',
    updatedAt: '2026-10-14T17:10:00.000Z',
  },
];

async function main() {
  await replaceAllOrders(seeds.map((seed) => ({ id: randomUUID(), ...seed })));
  const file = process.env.WORK_ORDERS_FILE ?? 'data/work-orders.json';
  console.log(`Seeded ${seeds.length} work orders to ${file} (existing contents overwritten).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Run it against a temp file**

Run: `WORK_ORDERS_FILE=$(mktemp -d)/wo.json npm run seed`
Expected: prints `Seeded 7 work orders to …`. If it fails with `This module cannot be imported from a Client Component module`, `--conditions=react-server` was not applied: confirm the `seed` script in `package.json` is exactly `tsx --conditions=react-server scripts/seed.ts`.

- [ ] **Step 3: Run it for real and check the output**

Run: `npm run seed && node -e "const d=require('./data/work-orders.json');console.log(d.length,[...new Set(d.map(o=>o.priority))].sort(),[...new Set(d.map(o=>o.status))].sort())"`
Expected: `7 [ 'High', 'Low', 'Medium' ] [ 'Done', 'In Progress', 'Open' ]`. `git status` must not list `data/`.

- [ ] **Step 4: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint
git add scripts/seed.ts
git commit -m "feat: add seed script"
```

---

### Task 6: Layout, shared components, detail page, error pages

**Files:**
- Create: `lib/query/get-query-client.ts`, `lib/query/providers.tsx`, `lib/work-orders/format.ts`, `components/Badges.tsx`, `components/NoticeBanner.tsx`, `components/WorkOrderDetail.tsx`, `app/not-found.tsx`, `app/error.tsx`, `app/work-orders/[id]/page.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `getOrder`; types.
- Produces:
  - `getQueryClient(): QueryClient` (server: new client per call; browser: singleton; `staleTime: 60_000`). Call it once per request on the server.
  - `Providers({ children })` (client)
  - `formatTimestamp(iso: string): string`
  - `PriorityBadge({ priority })`, `StatusBadge({ status })`
  - `NoticeBanner({ notice }: { notice?: string | string[] })`
  - `WorkOrderDetail({ order }: { order: WorkOrder })`

- [ ] **Step 1: Query client**

`lib/query/get-query-client.ts`:

```ts
import { isServer, QueryClient } from '@tanstack/react-query';

function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
}

let browserClient: QueryClient | undefined;

/**
 * Returns a QueryClient. On the server every call returns a fresh client, so
 * callers must call it once per request and never share it across requests.
 * In the browser it returns a singleton.
 */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  return (browserClient ??= makeQueryClient());
}
```

`lib/query/providers.tsx`:

```tsx
'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getQueryClient } from '@/lib/query/get-query-client';

/** Provides the TanStack Query client to client components. */
export function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 2: Date formatter**

`lib/work-orders/format.ts`:

```ts
const formatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

/** Formats an ISO timestamp in UTC. Deterministic, so server and client output match. */
export function formatTimestamp(iso: string): string {
  return formatter.format(new Date(iso));
}
```

- [ ] **Step 3: Badges**

`components/Badges.tsx`:

```tsx
import type { Priority, Status } from '@/lib/api/generated/model';

const PRIORITY_STYLES: Record<Priority, string> = {
  Low: 'bg-slate-100 text-slate-900 ring-slate-400',
  Medium: 'bg-amber-100 text-amber-950 ring-amber-500',
  High: 'bg-red-100 text-red-950 ring-red-500',
};

const STATUS_STYLES: Record<Status, string> = {
  Open: 'bg-blue-100 text-blue-950 ring-blue-500',
  'In Progress': 'bg-violet-100 text-violet-950 ring-violet-500',
  Done: 'bg-green-100 text-green-950 ring-green-600',
};

const BADGE = 'inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset';

/** Priority label with color and text (never color alone). */
export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`${BADGE} ${PRIORITY_STYLES[priority]}`}>{priority}</span>;
}

/** Status label with color and text (never color alone). */
export function StatusBadge({ status }: { status: Status }) {
  return <span className={`${BADGE} ${STATUS_STYLES[status]}`}>{status}</span>;
}
```

- [ ] **Step 4: Notice banner and detail**

`components/NoticeBanner.tsx`:

```tsx
const MESSAGES = {
  created: 'Work order created.',
  updated: 'Work order updated.',
  deleted: 'Work order deleted.',
} as const;

function isNotice(value: unknown): value is keyof typeof MESSAGES {
  return typeof value === 'string' && Object.hasOwn(MESSAGES, value);
}

/** Shows a post-redirect confirmation from `?notice=created|updated|deleted`. */
export function NoticeBanner({ notice }: { notice?: string | string[] }) {
  if (!isNotice(notice)) return null;
  return (
    <p
      role="status"
      className="mb-4 rounded-md border border-green-600 bg-green-50 px-4 py-3 text-green-950"
    >
      {MESSAGES[notice]}
    </p>
  );
}
```

`components/WorkOrderDetail.tsx`:

```tsx
import { PriorityBadge, StatusBadge } from '@/components/Badges';
import type { WorkOrder } from '@/lib/api/generated/model';
import { formatTimestamp } from '@/lib/work-orders/format';

/** Full read-only view of one work order. Description is rendered as plain text. */
export function WorkOrderDetail({ order }: { order: WorkOrder }) {
  return (
    <article>
      <h1 className="break-words text-2xl font-semibold">{order.title}</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        <PriorityBadge priority={order.priority} />
        <StatusBadge status={order.status} />
      </div>
      <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-[10rem_1fr]">
        <dt className="font-medium text-slate-700">Description</dt>
        <dd className="whitespace-pre-wrap break-words">
          {order.description || <span className="text-slate-700">No description provided.</span>}
        </dd>
        <dt className="font-medium text-slate-700">Last updated (UTC)</dt>
        <dd>
          <time dateTime={order.updatedAt}>{formatTimestamp(order.updatedAt)}</time>
        </dd>
        <dt className="font-medium text-slate-700">ID</dt>
        <dd className="break-all font-mono text-sm">{order.id}</dd>
      </dl>
    </article>
  );
}
```

- [ ] **Step 5: Layout, not-found and error pages**

Replace `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Providers } from "@/lib/query/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Work Orders", template: "%s · Work Orders" },
  description: "Manage technician work orders.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow focus-visible:outline-2 focus-visible:outline-blue-700"
        >
          Skip to content
        </a>
        <header className="border-b border-slate-300 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <Link
              href="/"
              className="rounded text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              Work Orders
            </Link>
            <Link href="/work-orders/new" className="btn-primary">
              New work order
            </Link>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-5xl px-4 py-6">
          <Providers>{children}</Providers>
        </main>
      </body>
    </html>
  );
}
```

`app/not-found.tsx`:

```tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <section>
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="mt-2">We could not find that page or work order.</p>
      <p className="mt-4">
        <Link href="/" className="underline">
          Back to all work orders
        </Link>
      </p>
    </section>
  );
}
```

`app/error.tsx` (Next 16.4 passes `retry`):

```tsx
'use client';

import { useEffect } from 'react';

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section role="alert">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2">The work orders could not be loaded. Please try again.</p>
      <button type="button" onClick={() => retry()} className="btn-primary mt-4">
        Try again
      </button>
    </section>
  );
}
```

- [ ] **Step 6: Detail page**

`app/work-orders/[id]/page.tsx` (DeleteWorkOrderButton is added in Task 9):

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NoticeBanner } from '@/components/NoticeBanner';
import { WorkOrderDetail } from '@/components/WorkOrderDetail';
import { getOrder } from '@/lib/work-orders/store';

export const dynamic = 'force-dynamic';

export default async function WorkOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const [{ id }, { notice }] = await Promise.all([params, searchParams]);
  const order = await getOrder(id);
  if (!order) notFound();

  return (
    <>
      <NoticeBanner notice={notice} />
      <WorkOrderDetail order={order} />
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={`/work-orders/${order.id}/edit`} className="btn-secondary">
          Edit
        </Link>
      </div>
      <p className="mt-6">
        <Link href="/" className="underline">
          ← Back to all work orders
        </Link>
      </p>
    </>
  );
}
```

- [ ] **Step 7: Verify manually**

Run: `npm run typecheck && npm run lint && npm run build`
Then: `npm run dev` in one terminal; run `npm run seed`; open the URL of one seeded order (take an id from `data/work-orders.json`) at `/work-orders/<id>`. Expected: title, badges, description, UTC date render; `/work-orders/not-a-real-id` shows the not-found page. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add app lib/query lib/work-orders/format.ts components
git commit -m "feat: add layout, query plumbing, badges, notice banner and detail page"
```

---

### Task 7: List page, status filter and sortable table

**Files:**
- Create: `lib/work-orders/list-query.ts`, `components/StatusFilter.tsx`, `components/WorkOrdersTable.tsx`
- Modify: `app/page.tsx`
- Test: `components/WorkOrdersTable.test.tsx`

**Interfaces:**
- Consumes: `getListWorkOrdersSuspenseQueryOptions`, `Status` (model constant), `ListWorkOrdersQueryParams`, `getQueryClient`, `listOrders`, `PriorityBadge`, `StatusBadge`, `formatTimestamp`, `NoticeBanner`.
- Produces:
  - `workOrdersListOptions(status?: Status)`: the one place list query options are built; used by both the server prefetch and the table so keys match.
  - `StatusFilter({ active }: { active?: Status })`
  - `WorkOrdersTable({ status }: { status?: Status })` (client)

- [ ] **Step 1: Shared query options**

`lib/work-orders/list-query.ts`:

```ts
import { getListWorkOrdersSuspenseQueryOptions } from '@/lib/api/generated/api';
import type { Status } from '@/lib/api/generated/model';

/** List query options for an optional status filter. Shared by the server prefetch and the table so the keys match. */
export function workOrdersListOptions(status?: Status) {
  return getListWorkOrdersSuspenseQueryOptions(status ? { status } : undefined);
}
```

- [ ] **Step 2: Write the failing table tests**

`components/WorkOrdersTable.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Status, WorkOrder } from '@/lib/api/generated/model';
import { workOrdersListOptions } from '@/lib/work-orders/list-query';
import { WorkOrdersTable } from './WorkOrdersTable';

const orders: WorkOrder[] = [
  { id: '11111111-1111-4111-8111-111111111111', title: 'Alpha', description: '', priority: 'Medium', status: 'Open', updatedAt: '2026-01-02T10:00:00.000Z' },
  { id: '22222222-2222-4222-8222-222222222222', title: 'Bravo', description: '', priority: 'High', status: 'In Progress', updatedAt: '2026-01-03T10:00:00.000Z' },
  { id: '33333333-3333-4333-8333-333333333333', title: 'Charlie', description: '', priority: 'Low', status: 'Done', updatedAt: '2026-01-01T10:00:00.000Z' },
];

function renderTable(data: WorkOrder[], status?: Status) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(workOrdersListOptions(status).queryKey, data);
  return render(
    <QueryClientProvider client={client}>
      <WorkOrdersTable status={status} />
    </QueryClientProvider>,
  );
}

const titles = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('link')[0].textContent);

const ariaSort = (name: RegExp) =>
  screen.getByRole('columnheader', { name }).getAttribute('aria-sort');

describe('WorkOrdersTable', () => {
  it('renders a row per work order, newest first, with links to the detail page', () => {
    renderTable(orders);
    expect(titles()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(screen.getByRole('link', { name: 'Bravo' }).getAttribute('href')).toBe(
      '/work-orders/22222222-2222-4222-8222-222222222222',
    );
    expect(ariaSort(/updated/i)).toBe('descending');
  });

  it('sorts by priority Low to High, then toggles to High to Low', async () => {
    const user = userEvent.setup();
    renderTable(orders);

    await user.click(screen.getByRole('button', { name: /priority/i }));
    expect(titles()).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(ariaSort(/priority/i)).toBe('ascending');
    expect(ariaSort(/updated/i)).toBe('none');

    await user.click(screen.getByRole('button', { name: /priority/i }));
    expect(titles()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(ariaSort(/priority/i)).toBe('descending');
  });

  it('sorts titles alphabetically and leaves status unsortable', async () => {
    const user = userEvent.setup();
    renderTable(orders);
    await user.click(screen.getByRole('button', { name: /title/i }));
    expect(titles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(screen.queryByRole('button', { name: /status/i })).toBeNull();
  });

  it('shows an empty state with a create link when no filter is active', () => {
    renderTable([]);
    expect(screen.getByText(/no work orders yet/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /create a work order/i }).getAttribute('href')).toBe(
      '/work-orders/new',
    );
  });

  it('shows a filter-specific empty state without a create link', () => {
    renderTable([], 'Done');
    expect(screen.getByText(/no work orders with status done/i)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /create a work order/i })).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run components/WorkOrdersTable.test.tsx`
Expected: FAIL (cannot resolve `./WorkOrdersTable`).

- [ ] **Step 4: Implement the table**

`components/WorkOrdersTable.tsx`:

```tsx
'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import Link from 'next/link';
import { useState } from 'react';
import { PriorityBadge, StatusBadge } from '@/components/Badges';
import type { Priority, Status, WorkOrder } from '@/lib/api/generated/model';
import { formatTimestamp } from '@/lib/work-orders/format';
import { workOrdersListOptions } from '@/lib/work-orders/list-query';

const PRIORITY_RANK: Record<Priority, number> = { Low: 0, Medium: 1, High: 2 };

const columns: ColumnDef<WorkOrder>[] = [
  {
    accessorKey: 'title',
    header: 'Title',
    sortingFn: 'text',
    cell: ({ row }) => (
      <Link
        href={`/work-orders/${row.original.id}`}
        className="break-words font-medium text-blue-800 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        {row.original.title}
      </Link>
    ),
  },
  {
    accessorKey: 'priority',
    header: 'Priority',
    sortingFn: (a, b, columnId) =>
      PRIORITY_RANK[a.getValue<Priority>(columnId)] - PRIORITY_RANK[b.getValue<Priority>(columnId)],
    cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'updatedAt',
    header: 'Updated (UTC)',
    sortingFn: 'basic',
    cell: ({ row }) => (
      <time dateTime={row.original.updatedAt}>{formatTimestamp(row.original.updatedAt)}</time>
    ),
  },
];

/**
 * Sortable work orders table fed by the hydrated list query.
 * @param status Optional status filter; must match the server prefetch so the query key hydrates.
 */
export function WorkOrdersTable({ status }: { status?: Status }) {
  const { data } = useSuspenseQuery(workOrdersListOptions(status));
  const [sorting, setSorting] = useState<SortingState>([{ id: 'updatedAt', desc: true }]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: false,
    enableMultiSort: false,
  });

  if (data.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-slate-400 bg-white p-6 text-center">
        {status ? (
          `No work orders with status ${status}.`
        ) : (
          <>
            No work orders yet.{' '}
            <Link href="/work-orders/new" className="font-medium text-blue-800 underline">
              Create a work order
            </Link>
          </>
        )}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-300 bg-white">
      <table className="w-full min-w-[40rem] border-collapse text-left">
        <caption className="sr-only">
          Work orders{status ? ` with status ${status}` : ''}, sortable by title, priority and last updated
        </caption>
        <thead className="bg-slate-100">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                const label = flexRender(header.column.columnDef.header, header.getContext());
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={
                      sorted === 'asc'
                        ? 'ascending'
                        : sorted === 'desc'
                          ? 'descending'
                          : canSort
                            ? 'none'
                            : undefined
                    }
                    className="px-4 py-3 text-sm font-semibold"
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1.5 rounded font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                      >
                        {label}
                        <span aria-hidden="true">
                          {sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : '↕'}
                        </span>
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-200">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3 align-top">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run components/WorkOrdersTable.test.tsx`
Expected: PASS. If `next/link` throws without a router in jsdom, add `vi.mock('next/link', ...)` returning a plain `<a>` at the top of the test file.

- [ ] **Step 6: Status filter**

`components/StatusFilter.tsx`:

```tsx
import Link from 'next/link';
import { Status } from '@/lib/api/generated/model';

const FILTERS: { label: string; status?: Status }[] = [
  { label: 'All' },
  ...Object.values(Status).map((status) => ({ label: status, status })),
];

/** Status filter as plain links driven by `?status=`; works without JavaScript. */
export function StatusFilter({ active }: { active?: Status }) {
  return (
    <nav aria-label="Filter by status">
      <ul className="flex flex-wrap gap-2">
        {FILTERS.map(({ label, status }) => {
          const isActive = status === active;
          return (
            <li key={label}>
              <Link
                href={status ? `/?status=${encodeURIComponent(status)}` : '/'}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-block rounded-full border px-4 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
                  isActive
                    ? 'border-blue-700 bg-blue-700 text-white'
                    : 'border-slate-400 bg-white text-slate-900 hover:bg-slate-100'
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 7: List page with prefetch and hydration**

Replace `app/page.tsx`:

```tsx
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { NoticeBanner } from '@/components/NoticeBanner';
import { StatusFilter } from '@/components/StatusFilter';
import { WorkOrdersTable } from '@/components/WorkOrdersTable';
import { ListWorkOrdersQueryParams } from '@/lib/api/generated/zod';
import { getQueryClient } from '@/lib/query/get-query-client';
import { workOrdersListOptions } from '@/lib/work-orders/list-query';
import { listOrders } from '@/lib/work-orders/store';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[]; notice?: string | string[] }>;
}) {
  const params = await searchParams;
  const parsed = ListWorkOrdersQueryParams.safeParse({ status: params.status });
  const status = parsed.success ? parsed.data.status : undefined;

  const queryClient = getQueryClient();
  await queryClient.fetchQuery({
    ...workOrdersListOptions(status),
    queryFn: () => listOrders({ status }),
  });

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Work orders</h1>
      <NoticeBanner notice={params.notice} />
      <div className="mb-4">
        <StatusFilter active={status} />
      </div>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <WorkOrdersTable status={status} />
      </HydrationBoundary>
    </>
  );
}
```
`fetchQuery` (not `prefetchQuery`) is deliberate: a corrupt data file throws into `app/error.tsx` instead of silently rendering empty.

- [ ] **Step 8: Verify in the browser**

Run: `npm run typecheck && npm run lint && npm run build`
Then `npm run seed && npm run dev` and open `/`. Expected: seven rows newest first, no loading flash (view-source contains the rows), sort buttons work, `/?status=Done` shows two rows, `/?status=bogus` shows all seven. Stop the server.

- [ ] **Step 9: Commit**

```bash
git add app/page.tsx components lib/work-orders/list-query.ts
git commit -m "feat: add server-prefetched list page with status filter and sortable table"
```

---

### Task 8: Work order form (create and edit)

**Files:**
- Create: `components/WorkOrderForm.tsx`, `app/work-orders/new/page.tsx`, `app/work-orders/[id]/edit/page.tsx`
- Test: `components/WorkOrderForm.test.tsx`

**Interfaces:**
- Consumes: hooks `useCreateWorkOrder`, `useUpdateWorkOrder`, `getListWorkOrdersQueryKey`; `toApiError`; model constants `Priority`, `Status`; `getOrder`.
- Produces: `WorkOrderForm(props: { mode: 'create' } | { mode: 'edit'; initial: WorkOrder })` (client).

- [ ] **Step 1: Write the failing tests**

`components/WorkOrderForm.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkOrder } from '@/lib/api/generated/model';
import { WorkOrderForm } from './WorkOrderForm';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  push.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function renderForm(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const saved: WorkOrder = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Replace filter',
  description: '',
  priority: 'High',
  status: 'Open',
  updatedAt: '2026-10-15T10:00:00.000Z',
};

describe('WorkOrderForm', () => {
  it('shows server field errors, flags the fields, keeps input and focuses the first invalid field', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            fieldErrors: {
              title: ['Title must be at least 2 characters'],
              description: ['Description must be at most 2000 characters'],
            },
          },
        },
        400,
      ),
    );
    const user = userEvent.setup();
    renderForm(<WorkOrderForm mode="create" />);

    const title = screen.getByLabelText('Title (required)');
    const description = screen.getByLabelText(/^Description/) as HTMLTextAreaElement;
    await user.type(title, 'a');
    await user.type(description, 'keep me');
    await user.click(screen.getByRole('button', { name: 'Create work order' }));

    expect(await screen.findByText('Title must be at least 2 characters')).toBeTruthy();
    expect(screen.getByText('Description must be at most 2000 characters')).toBeTruthy();
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(title.getAttribute('aria-describedby')).toContain('title-error');
    expect(description.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(title);
    expect(description.value).toBe('keep me');
    expect(push).not.toHaveBeenCalled();
  });

  it('sends the typed payload once, locks the form while pending and navigates on success', async () => {
    let respond!: (response: Response) => void;
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => { respond = resolve; }),
    );
    const user = userEvent.setup();
    renderForm(<WorkOrderForm mode="create" />);

    await user.type(screen.getByLabelText('Title (required)'), 'Replace filter');
    await user.selectOptions(screen.getByLabelText('Priority (required)'), 'High');
    const submit = screen.getByRole('button', { name: 'Create work order' }) as HTMLButtonElement;
    await user.click(submit);

    await waitFor(() => expect(submit.disabled).toBe(true));
    expect(submit.getAttribute('aria-busy')).toBe('true');
    await user.dblClick(submit);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/work-orders');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      title: 'Replace filter',
      description: '',
      priority: 'High',
    });

    respond(jsonResponse(saved, 201));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/work-orders/${saved.id}?notice=created`),
    );
  });

  it('prefills in edit mode and submits a full PUT including status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...saved, status: 'Done' }, 200));
    const user = userEvent.setup();
    renderForm(<WorkOrderForm mode="edit" initial={saved} />);

    expect((screen.getByLabelText('Title (required)') as HTMLInputElement).value).toBe('Replace filter');
    await user.selectOptions(screen.getByLabelText('Status (required)'), 'Done');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/work-orders/${saved.id}?notice=updated`),
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/work-orders/${saved.id}`);
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      title: 'Replace filter',
      description: '',
      priority: 'High',
      status: 'Done',
    });
  });

  it('shows a form-level alert for non-field errors and re-enables the form', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }, 500),
    );
    const user = userEvent.setup();
    renderForm(<WorkOrderForm mode="create" />);

    await user.type(screen.getByLabelText('Title (required)'), 'Valid title');
    const submit = screen.getByRole('button', { name: 'Create work order' }) as HTMLButtonElement;
    await user.click(submit);

    expect((await screen.findByRole('alert')).textContent).toBe('Something went wrong');
    expect(submit.disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/WorkOrderForm.test.tsx`
Expected: FAIL (cannot resolve `./WorkOrderForm`).

- [ ] **Step 3: Implement the form**

`components/WorkOrderForm.tsx`:

```tsx
'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { toApiError } from '@/lib/api/fetcher';
import {
  getListWorkOrdersQueryKey,
  useCreateWorkOrder,
  useUpdateWorkOrder,
} from '@/lib/api/generated/api';
import { Priority, Status, type WorkOrder } from '@/lib/api/generated/model';

type Props = { mode: 'create' } | { mode: 'edit'; initial: WorkOrder };

const FIELD_NAMES: readonly string[] = ['title', 'description', 'priority', 'status'];
type FieldName = 'title' | 'description' | 'priority' | 'status';

const PRIORITIES = Object.values(Priority);
const STATUSES = Object.values(Status);

const GENERIC_ERROR = 'Could not save the work order. Please try again.';

/** Narrows a submitted form value to one of the allowed options. */
function pick<T extends string>(options: readonly T[], value: FormDataEntryValue | null): T {
  const match = options.find((option) => option === value);
  if (match === undefined) throw new Error('Unexpected form value');
  return match;
}

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="mt-1 text-sm text-red-800">
      {messages.join(' ')}
    </p>
  );
}

/**
 * Create or edit form. Validation is server-side; field errors from the API
 * are shown under each field and focus moves to the first invalid one.
 * @param props `mode: 'create'`, or `mode: 'edit'` with the `initial` work order.
 */
export function WorkOrderForm(props: Props) {
  const initial = props.mode === 'edit' ? props.initial : undefined;
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useCreateWorkOrder();
  const update = useUpdateWorkOrder();
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [descriptionLength, setDescriptionLength] = useState(initial?.description.length ?? 0);

  useEffect(() => {
    if (Object.keys(fieldErrors).length === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [fieldErrors]);

  function showError(error: unknown) {
    const apiError = toApiError(error);
    if (!apiError) {
      setFormError(GENERIC_ERROR);
      return;
    }
    const { message, fieldErrors: all = {} } = apiError.error;
    const entries = Object.entries(all);
    const known = entries.filter(([name]) => FIELD_NAMES.includes(name));
    const other = entries.filter(([name]) => !FIELD_NAMES.includes(name));
    setFieldErrors(Object.fromEntries(known));
    const otherMessages = other.flatMap(([, messages]) => messages).join(' ');
    setFormError(otherMessages || (known.length === 0 ? message : null));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const fields = {
        title: String(data.get('title') ?? ''),
        description: String(data.get('description') ?? ''),
        priority: pick(PRIORITIES, data.get('priority')),
      };
      const saved =
        props.mode === 'create'
          ? await create.mutateAsync({ data: fields })
          : await update.mutateAsync({
              id: props.initial.id,
              data: { ...fields, status: pick(STATUSES, data.get('status')) },
            });
      await queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
      router.push(`/work-orders/${saved.id}?notice=${props.mode === 'create' ? 'created' : 'updated'}`);
    } catch (error) {
      showError(error);
      setSubmitting(false);
    }
  }

  function errorProps(name: FieldName, extraDescribedBy?: string) {
    const invalid = (fieldErrors[name]?.length ?? 0) > 0;
    const describedBy = [invalid ? `${name}-error` : undefined, extraDescribedBy]
      .filter(Boolean)
      .join(' ');
    return {
      'aria-invalid': invalid ? (true as const) : undefined,
      'aria-describedby': describedBy || undefined,
    };
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={submitting} className="max-w-2xl space-y-5">
      <div>
        <label htmlFor="title" className="mb-1 block font-medium">
          Title (required)
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={80}
          defaultValue={initial?.title}
          className="field"
          {...errorProps('title')}
        />
        <FieldError id="title-error" messages={fieldErrors.title} />
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block font-medium">
          Description (optional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={6}
          maxLength={2000}
          defaultValue={initial?.description}
          onChange={(event) => setDescriptionLength(event.target.value.length)}
          className="field"
          {...errorProps('description', 'description-count')}
        />
        <p id="description-count" className="mt-1 text-sm text-slate-700">
          {descriptionLength} / 2000 characters
        </p>
        <FieldError id="description-error" messages={fieldErrors.description} />
      </div>

      <div>
        <label htmlFor="priority" className="mb-1 block font-medium">
          Priority (required)
        </label>
        <select
          id="priority"
          name="priority"
          required
          defaultValue={initial?.priority ?? Priority.Medium}
          className="field"
          {...errorProps('priority')}
        >
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priority}
            </option>
          ))}
        </select>
        <FieldError id="priority-error" messages={fieldErrors.priority} />
      </div>

      {initial && (
        <div>
          <label htmlFor="status" className="mb-1 block font-medium">
            Status (required)
          </label>
          <select
            id="status"
            name="status"
            required
            defaultValue={initial.status}
            className="field"
            {...errorProps('status')}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <FieldError id="status-error" messages={fieldErrors.status} />
        </div>
      )}

      {formError && (
        <p role="alert" className="rounded-md border border-red-700 bg-red-50 px-4 py-3 text-red-950">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={submitting} aria-busy={submitting} className="btn-primary">
          {props.mode === 'create' ? 'Create work order' : 'Save changes'}
        </button>
        <Link
          href={props.mode === 'create' ? '/' : `/work-orders/${props.initial.id}`}
          className="btn-secondary"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/WorkOrderForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Create and edit pages**

`app/work-orders/new/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { WorkOrderForm } from '@/components/WorkOrderForm';

export const metadata: Metadata = { title: 'New work order' };

export default function NewWorkOrderPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">New work order</h1>
      <WorkOrderForm mode="create" />
    </>
  );
}
```

`app/work-orders/[id]/edit/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { WorkOrderForm } from '@/components/WorkOrderForm';
import { getOrder } from '@/lib/work-orders/store';

export const dynamic = 'force-dynamic';

export default async function EditWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Edit work order</h1>
      <WorkOrderForm mode="edit" initial={order} />
    </>
  );
}
```
(`/work-orders/new` reads no data, so it needs no `force-dynamic`.)

- [ ] **Step 6: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`
Then in `npm run dev`: create an order with title `a` (expect field error and focus on Title), then with a valid title (expect redirect to the detail page with "Work order created."), edit it (expect "Work order updated."), and check that `/` shows the change with no manual refresh. Stop the server.

```bash
git add components/WorkOrderForm.tsx components/WorkOrderForm.test.tsx app/work-orders
git commit -m "feat: add create and edit form with server-side field errors"
```

---

### Task 9: Delete dialog

**Files:**
- Create: `components/DeleteWorkOrderButton.tsx`
- Modify: `app/work-orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `useDeleteWorkOrder`, `getListWorkOrdersQueryKey`.
- Produces: `DeleteWorkOrderButton({ id, title }: { id: string; title: string })` (client). Not unit-tested: jsdom has no `<dialog>.showModal()`; the Playwright test in Task 10 covers it.

- [ ] **Step 1: Implement the component**

`components/DeleteWorkOrderButton.tsx`:

```tsx
'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { getListWorkOrdersQueryKey, useDeleteWorkOrder } from '@/lib/api/generated/api';

/**
 * Delete control with a native modal confirmation dialog (Escape closes it).
 * @param id Work order id.
 * @param title Shown in the confirmation text.
 */
export function DeleteWorkOrderButton({ id, title }: { id: string; title: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const remove = useDeleteWorkOrder();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      await remove.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
      router.push('/?notice=deleted');
    } catch {
      setError('Could not delete the work order. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className="btn-danger">
        Delete
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="delete-dialog-title"
        onClose={() => setError(null)}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg p-6 backdrop:bg-black/50"
      >
        <h2 id="delete-dialog-title" className="text-lg font-semibold">
          Delete this work order?
        </h2>
        <p className="mt-2 break-words">
          “{title}” will be permanently deleted. This cannot be undone.
        </p>
        {error && (
          <p role="alert" className="mt-3 rounded-md border border-red-700 bg-red-50 px-3 py-2 text-red-950">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            disabled={submitting}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={submitting}
            aria-busy={submitting}
            className="btn-danger"
          >
            Delete work order
          </button>
        </div>
      </dialog>
    </>
  );
}
```

- [ ] **Step 2: Wire it into the detail page**

In `app/work-orders/[id]/page.tsx`, add the import `import { DeleteWorkOrderButton } from '@/components/DeleteWorkOrderButton';` and add inside the actions `<div>` after the Edit link:

```tsx
        <DeleteWorkOrderButton id={order.id} title={order.title} />
```

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm run lint && npm run build`
Then in `npm run dev`: open a seeded order, press Delete (dialog opens, Escape closes it, Cancel closes it), confirm (redirect to `/` with "Work order deleted." and the row gone). Stop the server.

```bash
git add components/DeleteWorkOrderButton.tsx app/work-orders
git commit -m "feat: add delete confirmation dialog"
```

---

### Task 10: Playwright happy path, accessibility and responsive pass

**Files:**
- Create: `playwright.config.ts`, `e2e/work-orders.spec.ts`

**Interfaces:**
- Consumes: the whole app. Uses a temp data file and port 3100.

- [ ] **Step 1: Playwright config**

`playwright.config.ts`:

```ts
import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const PORT = 3100;
const dataFile = path.join(os.tmpdir(), `work-orders-e2e-${process.pid}.json`);

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { WORK_ORDERS_FILE: dataFile },
  },
});
```

- [ ] **Step 2: Write the e2e test**

`e2e/work-orders.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('technician creates, edits, sorts, filters and deletes work orders', async ({ page }) => {
  // empty state
  await page.goto('/');
  await expect(page.getByText('No work orders yet.')).toBeVisible();

  // server-side validation surfaces on the field and moves focus
  await page.getByRole('link', { name: 'New work order' }).first().click();
  const title = page.getByLabel('Title (required)');
  await title.fill('a');
  await page.getByRole('button', { name: 'Create work order' }).click();
  await expect(page.getByText('Title must be at least 2 characters')).toBeVisible();
  await expect(title).toBeFocused();
  await expect(title).toHaveAttribute('aria-invalid', 'true');

  // fix and submit from the keyboard
  await title.fill('Replace HVAC filter - Building B');
  await page.getByLabel(/^Description/).fill('Quarterly swap.\nUse MERV 13.');
  await page.getByLabel('Priority (required)').selectOption('High');
  await title.press('Enter');
  await expect(page).toHaveURL(/\/work-orders\/[0-9a-f-]{36}\?notice=created$/);
  await expect(page.getByRole('status')).toHaveText('Work order created.');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Replace HVAC filter - Building B');

  // edit
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Title (required)').fill('Replace HVAC filter - Building B (rush)');
  await page.getByLabel('Status (required)').selectOption('In Progress');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toHaveText('Work order updated.');

  // second order
  await page.goto('/work-orders/new');
  await page.getByLabel('Title (required)').fill('Inspect fire extinguishers');
  await page.getByLabel('Priority (required)').selectOption('Low');
  await page.getByRole('button', { name: 'Create work order' }).click();
  await expect(page.getByRole('status')).toHaveText('Work order created.');

  // list reflects both without a manual refresh; sort by priority
  await page.getByRole('link', { name: 'Work Orders', exact: true }).click();
  await expect(page.getByRole('row')).toHaveCount(3);
  await page.getByRole('button', { name: /priority/i }).click();
  await expect(page.getByRole('columnheader', { name: /priority/i })).toHaveAttribute('aria-sort', 'ascending');
  await expect(page.getByRole('row').nth(1)).toContainText('Inspect fire extinguishers');

  // filter by status
  await page
    .getByRole('navigation', { name: 'Filter by status' })
    .getByRole('link', { name: 'In Progress' })
    .click();
  await expect(page).toHaveURL(/\?status=In%20Progress$/);
  await expect(page.getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('row').nth(1)).toContainText('(rush)');

  // invalid or repeated status params fall back to the full list
  await page.goto('/?status=bogus');
  await expect(page.getByRole('row')).toHaveCount(3);
  await page.goto('/?status=Open&status=Done');
  await expect(page.getByRole('row')).toHaveCount(3);

  // delete via the native dialog
  await page.getByRole('link', { name: /\(rush\)/ }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete work order' }).click();
  await expect(page).toHaveURL(/\/\?notice=deleted$/);
  await expect(page.getByRole('status')).toHaveText('Work order deleted.');
  await expect(page.getByText('(rush)')).toHaveCount(0);
  await expect(page.getByRole('row')).toHaveCount(2);
});

test('the list has no horizontal page scroll at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
});
```

- [ ] **Step 3: Run it**

Run: `npm run e2e`
Expected: both tests PASS. (The first test leaves one order in the temp file, so the 320px test sees a populated list, which is the harder case.) Fix any selector mismatch by adjusting the test, or the component if the behavior is wrong.

- [ ] **Step 4: Manual keyboard and responsive walkthrough**

Run `npm run seed && npm run dev` and check with the keyboard only (Tab, Shift+Tab, Enter, Space, Escape): skip link appears on first Tab; create (invalid then valid) → sort a column → edit → delete via the dialog; every control shows a visible focus ring. Resize to 320px wide: no horizontal page scroll; the table scrolls inside its wrapper. Fix anything that fails.

- [ ] **Step 5: Static checks**

Run: `grep -rn "dangerouslySetInnerHTML" app components lib scripts e2e || echo "none found"`
Expected: `none found`.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e
git commit -m "test: add Playwright happy path and 320px overflow check"
```

---

### Task 11: README and final verification

**Files:**
- Create (overwrite): `README.md`

- [ ] **Step 1: Write the README**

````markdown
# Technician Work Orders

A small Next.js (App Router) app for managing technician work orders: list, sort, filter by status, create, edit, delete and view detail. Data is persisted to a JSON file. The API is defined contract-first in `openapi.yaml`; types, a fetch SDK, TanStack Query options and Zod schemas are generated from it and used on both the server and the client.

## Setup and run

Requires Node 24 and npm.

```bash
npm install
npm run seed      # optional: writes 7 sample work orders to data/work-orders.json (overwrites it)
npm run dev       # http://localhost:3000
npm run build && npm start
```

The app works with no data file (empty state). Set `WORK_ORDERS_FILE` to use a different file.

Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `e2e`, `seed`, `generate:api`.

## API contract and codegen

`openapi.yaml` is the single source of truth. `npm run generate:api` runs [Orval](https://orval.dev) (pinned to an exact version) and writes model types, fetch functions, TanStack Query hooks (including suspense variants) and per-operation Zod schemas to `lib/api/generated/`. Re-run it whenever the spec changes. The only hand-written glue is `lib/api/fetcher.ts`, Orval's "mutator": it makes generated functions return plain data and throw `ApiRequestError` on non-2xx, which is what the form reads field errors from.

The generated code is **committed** so reviewers can run the app without a generate step. It is marked `linguist-generated` in `.gitattributes`, excluded from lint and coverage, and never hand-edited: fix `openapi.yaml` or `orval.config.ts` instead. Running `npm run generate:api` on a clean checkout produces no diff.

Route Handlers validate with the generated Zod schemas and are typed with the generated types, so a contract change breaks the build rather than production.

## Testing

```bash
npm test      # Vitest: API integration, store, fetch wrapper, table and form components
npm run e2e   # Playwright happy path (builds the app, uses a temp data file on port 3100)
```

`npx playwright install chromium` is needed once before `npm run e2e`. The Vitest suite is deliberately small: the API flow (create, list, filter, validation, update, delete, 404s), the store (missing file, concurrent writes, corrupt file), the fetch wrapper, table sorting with `aria-sort`, and form error handling. Generated code is not tested directly.

## Decisions and trade-offs

- **Contract-first (D1, D4).** One spec drives types, client, hooks and server validation, which removes drift between them. Orval was chosen for its React Query hooks and Zod output. It does not generate Zod for error bodies or standalone enums, so the form uses a small `toApiError` guard and the generated `Status`/`Priority` constants instead.
- **Status filter, not search (D2, D3).** It is server-rendered, shareable through the URL, works without JavaScript and is trivial to test. Filter options are plain links.
- **List page (D5, D8).** A Server Component prefetches into a per-request QueryClient using the generated query options with the store as `queryFn` (no HTTP call to itself), then hydrates a client table through `useSuspenseQuery`. There is no loading flash. `staleTime` is 60s to avoid an immediate refetch after hydration. The server creates a new client per request, the browser keeps a singleton.
- **Detail and edit skip TanStack Query (D6).** They are single reads, so Query adds nothing; they read the store directly in Server Components and keep the client bundle small.
- **Mutations (D7).** Forms and the delete dialog use the generated mutation hooks and invalidate every list query (all status variants) before navigating.
- **Caching (D9).** `force-dynamic` on data pages and handlers, plus Query `staleTime` and invalidation. Mutable file data must never be served stale. Next's Cache Components are switched off (the scaffold enabled them, which makes `dynamic = 'force-dynamic'` an error). With a real database, tag-based `revalidate` or `use cache` would be the next step.
- **TanStack Table, limited to sorting.** It earns its place through client-side sorting of title, priority (Low < Medium < High) and last updated, with correct `aria-sort`. Filtering, pagination and column features are deliberately not used. Pinned to v8 because v9 reworked the API.
- **Persistence (D10).** Writes are atomic (temp file then rename) and mutations run through an in-process promise queue. This is safe for a single Node process only. It does not work on read-only or serverless filesystems or across multiple instances. A database would replace only `lib/work-orders/store.ts`. A corrupt data file raises an error and is never silently reset.
- **Plain-text descriptions.** Descriptions render as text nodes with `whitespace-pre-wrap`; `dangerouslySetInnerHTML` is not used anywhere.
- **Dates.** Shown in UTC with a fixed `en-GB` format so server and client output match.
- **Validation messages.** Zod issues are mapped to readable per-field messages in the `ApiError` shape. The form does not duplicate the schemas; it relies on the server and shows its field errors.
- **`server-only`.** The store imports it. Vitest aliases it to its empty module; the seed script runs `tsx --conditions=react-server`.
- **npm, not pnpm.**
- **Cut to fit the timebox:** pagination, text search, authentication, optimistic updates, and component tests for the delete dialog (jsdom lacks `showModal`; the e2e test covers it).

## Project structure

```
openapi.yaml  orval.config.ts  vitest.config.ts  playwright.config.ts
app/            pages, error/not-found, api/work-orders route handlers (+ tests)
components/     StatusFilter, Badges, NoticeBanner, WorkOrderDetail (server)
                WorkOrdersTable, WorkOrderForm, DeleteWorkOrderButton (client)
lib/
  api/          responses.ts, parse-body.ts, fetcher.ts (Orval mutator), generated/ (codegen output)
  query/        get-query-client.ts, providers.tsx
  work-orders/  store.ts (server-only), list-query.ts, format.ts
scripts/seed.ts
e2e/            Playwright happy path
data/           JSON data (gitignored)
```
````

- [ ] **Step 2: Run the full verification**

Run each and confirm clean output:

```bash
npm run generate:api && git status --short lib/api/generated   # expect no output
npm run typecheck
npm run lint
npm test
npm run build
npm run e2e
grep -rn "dangerouslySetInnerHTML" app components lib scripts e2e || echo "none found"
git status --short   # no data/, no .env*
```
Expected: every command passes. If anything fails, fix the cause and re-run that command; do not mark the work done until all pass.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```
