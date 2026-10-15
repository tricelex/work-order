# Technician Work Orders: Design Spec

Date: 2026-10-15. Source: `PRD.md` (v2) plus decisions made during brainstorming. Where this spec and the PRD differ, **this spec wins**; every difference is listed in §2.

## 1. Goal and constraints

A small Next.js App Router app to manage Work Orders (list, create, edit, delete, detail, status filter, client-side sorting) with file-based JSON persistence. Graded on architecture and code quality (30%), correctness (25%), UX and accessibility (15%), testing (15%), documentation and judgment (15%). Timebox: about 6h. Rule of thumb: if it is not required here, do not build it. Generated code is never hand-edited.

Non-goals: database/ORM, auth, uploads, analytics, real-time, pagination, text search, extra table features, i18n, dark mode, toast library, UI library, Swagger UI, Query devtools, Docker, CI config.

## 2. Differences from the PRD

| # | PRD said | This spec |
|---|---|---|
| 1 | Scaffold assumed compatible with `dynamic = 'force-dynamic'` | Repo's `next.config.ts` enables `cacheComponents` and `partialPrefetching`, which make route segment configs (`dynamic`, `revalidate`, `fetchCache`) an **error** in Next 16.4.1. **Remove both flags.** D9 stays as written. README notes Cache Components as a future step |
| 2 | pnpm | **npm.** Keep `package-lock.json`. All scripts via `npm run`. Remove `pnpm-workspace.yaml` (pnpm-only release-age settings, dead config). Exact pins via `--save-exact` |
| 3 | `src/api/generated/` | **`lib/api/generated/`.** Repo has no `src/`; `app/` is at the root |
| 4 | `@tanstack/react-table` unspecified | **Pin 8.21.3.** Latest is 9.x, which reworked the API; the PRD's `getCoreRowModel`/`getSortedRowModel` are v8 |
| 5 | Playwright optional | **Included.** One happy path, `npm run e2e` |
| 6 | Hey API (`@hey-api/openapi-ts`) for codegen | **Orval** (`orval`, pinned exact `8.43.0`) at the user's request: React Query hooks and Zod from `openapi.yaml`. Needs one small hand-written fetch wrapper (`lib/api/fetcher.ts`, Orval's "mutator") so functions return plain data and non-2xx responses throw |
| 7 | `error.tsx` with a retry button | Next 16.4 passes `retry` (not `reset`) to `error.tsx` |
| 8 | Next font defaults in the scaffold | Use the system font stack (no build-time Google Fonts fetch); dark-mode CSS from the scaffold is removed (non-goal) |

Everything else (D1-D14, routes, the four client components, store behavior, acceptance checklist) is as in the PRD.

## 3. Stack

Next.js 16.4.1 (already installed), React 19.3, TypeScript `strict`, Tailwind 4 (existing `@tailwindcss/turbopack` rule), `@tanstack/react-query`, `@tanstack/react-table@8.21.3`, `orval@8.43.0`, `zod` 4.x (the version Orval's Zod output targets), `server-only`. Dev: Vitest 5 + `@testing-library/react` + `@testing-library/user-event` + jsdom, `tsx`, `@playwright/test`. UUIDs via `node:crypto` `randomUUID`. No other runtime dependencies. `engines.node` set to 24.

**Verification rule:** generated identifiers (`...Options`, `...QueryKey`, `...Mutation`, `z...` schemas, error typing, client base-URL config call) are read from the installed version's docs and the actual output in `lib/api/generated/`. Never assume names. `params` and `searchParams` are Promises: always `await`. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code (per `AGENTS.md`).

## 4. Locked decisions

D1-D14 are unchanged from the PRD §4, restated:

- **D1** Contract-first: `openapi.yaml` is the single source of truth for types, SDK, Query hooks and Zod schemas.
- **D2** Status filter (not text search), driven by `?status=`.
- **D3** Filter is a nav of `<Link>`s in a Server Component.
- **D4** Route Handlers validate with generated Zod schemas and are typed with generated types.
- **D5** List page: Server Component prefetches into a per-request `QueryClient` using the generated query options with `queryFn` overridden to call the store; dehydrates via `HydrationBoundary`; a Client Component renders the table with `useSuspenseQuery`.
- **D6** Detail and edit pages are Server Components reading the store directly (no Query).
- **D7** Mutations use generated mutation options from Client Components; on success invalidate all list queries, then `router.push`.
- **D8** Query defaults `staleTime: 60_000`; new client per request on the server, singleton in the browser.
- **D9** `export const dynamic = 'force-dynamic'` on pages and handlers (valid once `cacheComponents` is removed).
- **D10** Atomic writes (temp + rename) and an in-process write queue.
- **D11** `PUT` replaces all editable fields.
- **D12** Delete only on the detail page, via native `<dialog>`.
- **D13** Post-redirect feedback via `?notice=created|updated|deleted` in a `role="status"` region.
- **D14** Generated code is committed in `lib/api/generated/`, marked `linguist-generated` in `.gitattributes`, excluded from lint and coverage.

## 5. Contract and codegen

`openapi.yaml` (repo root, OpenAPI 3.1), `servers: [{ url: /api }]`.

**Schemas**

| Schema | Fields and constraints |
|---|---|
| `Priority` | enum `Low`, `Medium`, `High` |
| `Status` | enum `Open`, `In Progress`, `Done` |
| `WorkOrder` | `id` (uuid), `title` (2-80), `description` (max 2000), `priority`, `status`, `updatedAt` (date-time). All required |
| `CreateWorkOrderInput` | `title`, `priority` required; `description` default `""`, max 2000; no `status` |
| `UpdateWorkOrderInput` | `title`, `description`, `priority`, `status`, all required, same constraints |
| `ApiError` | `error: { code: VALIDATION_ERROR\|INVALID_JSON\|NOT_FOUND\|INTERNAL_ERROR, message, fieldErrors?: map of field to string[] }` |

**Operations** (fixed `operationId`s)

| operationId | Method and path | Request | Success | Errors |
|---|---|---|---|---|
| `listWorkOrders` | `GET /work-orders` | optional query `status` | 200 `WorkOrder[]` | 400 |
| `createWorkOrder` | `POST /work-orders` | `CreateWorkOrderInput` | 201 `WorkOrder` | 400 |
| `getWorkOrder` | `GET /work-orders/{id}` | path `id` (uuid) | 200 `WorkOrder` | 404 |
| `updateWorkOrder` | `PUT /work-orders/{id}` | `UpdateWorkOrderInput` | 200 `WorkOrder` | 400, 404 |
| `deleteWorkOrder` | `DELETE /work-orders/{id}` | none | 204 | 404 |

All error responses use `ApiError`. `id` and `updatedAt` are server-owned and never accepted from clients.

**Codegen:** `orval.config.ts` with two outputs from `openapi.yaml`, both into `lib/api/generated/`: (1) `client: 'react-query'`, `httpClient: 'fetch'`, `baseUrl: '/api'`, models in `model/`, suspense hooks enabled, and `override.fetch.includeHttpResponseReturnType: false` so generated functions return plain data; (2) `client: 'zod'` for per-operation Zod schemas. `npm run generate:api` (`rm -rf lib/api/generated && orval`) must reproduce the committed output with no diff. Generated files are never edited.

**Mutator (`lib/api/fetcher.ts`, hand-written, outside the generated folder):** `customFetch<T>(url, options)` calls `fetch`, returns the parsed JSON body (`undefined` for 204), and throws `ApiRequestError { status, body }` on non-2xx. It also exports `ErrorType` (so generated hooks type errors as `ApiRequestError`) and `toApiError(error): ApiError | null`, which the form uses to read `fieldErrors`. Orval does not generate Zod for error bodies or standalone enum/model schemas, so the form relies on this guard and on the generated `Status`/`Priority` constants.

## 6. Server

### Store (`lib/work-orders/store.ts`)
`import 'server-only'`. Path from `process.env.WORK_ORDERS_FILE`, default `data/work-orders.json`.

- `listOrders(filter?: { status?: Status }): Promise<WorkOrder[]>`, sorted by `updatedAt` desc
- `getOrder(id): Promise<WorkOrder | null>`
- `createOrder(input): Promise<WorkOrder>`
- `updateOrder(id, input): Promise<WorkOrder | null>`
- `deleteOrder(id): Promise<boolean>`
- `replaceAllOrders(items): Promise<void>` (seed only)

Behavior:
- Missing file means an empty list; `data/` is created on first write.
- Reads validate the file shape with the **generated `ListWorkOrdersResponse` Zod schema** (an array of work orders) (no hand-written duplicate). Corrupt or invalid content throws a descriptive error and is never silently reset.
- Mutations are read-modify-write serialized through a module-level promise queue.
- Writes go to `<file>.tmp` then `rename`; JSON pretty-printed with 2 spaces.
- `id` (`randomUUID`) and `updatedAt` (`new Date().toISOString()`) are generated only inside store mutation functions, set on create and every update.
- No HTTP concerns; trusts typed input.

### Route Handlers
Files: `app/api/work-orders/route.ts` (GET, POST) and `app/api/work-orders/[id]/route.ts` (GET, PUT, DELETE). All export `dynamic = 'force-dynamic'`.

Flow per request:
1. Parse JSON; failure gives `400 INVALID_JSON`.
2. Trim `title` (one tiny shared helper), then `safeParse` with the generated Zod schema. Unknown keys are stripped. The `status` query is parsed the same way (invalid gives `400`).
3. Zod issues map to `ApiError.fieldErrors` with readable messages (e.g. "Title must be between 2 and 80 characters"). Raw Zod output is never returned.
4. Call the store; return typed responses.
5. Non-UUID or unknown `:id` gives `404 NOT_FOUND`. Unexpected errors give `500 INTERNAL_ERROR` with a generic message and `console.error` for details.

`lib/api/responses.ts` holds the JSON/error response builders and the Zod-issue mapper. No framework.

`lib/work-orders/format.ts` holds the date formatter: `Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })`.

## 7. Rendering and components

### Query plumbing (`lib/query/`)
- `get-query-client.ts`: server returns a new client on every call (called once per request, so no `React.cache`), browser keeps a singleton; applies D8 defaults.
- `providers.tsx` (client): `QueryClientProvider`. No SDK base-URL call is needed: the generated client is already configured with `baseUrl: '/api'` from `servers`.

### Routes

| Route | Type | Behavior |
|---|---|---|
| `/` | Server page + Client table | `await searchParams`; parse `status` with the generated Zod `Status` schema (invalid means All). Prefetch with the generated `getListWorkOrdersSuspenseQueryOptions` for `{ status }`, overriding only `queryFn` to call `listOrders({ status })` so the key matches the browser's. Render `StatusFilter`, `NoticeBanner`, then `<HydrationBoundary>` with `WorkOrdersTable` |
| `/work-orders/new` | Server page + Client form | `WorkOrderForm` in create mode |
| `/work-orders/[id]` | Server | Reads the store; `notFound()` if missing; full detail, Edit link, `DeleteWorkOrderButton`, notice banner |
| `/work-orders/[id]/edit` | Server page + Client form | Reads the store; passes `initial` to `WorkOrderForm` in edit mode; `notFound()` if missing |

Also `app/not-found.tsx`, `app/error.tsx` (client, with retry button), and root `layout.tsx` with metadata, skip link, header, `<main id="main">` and the Query provider.

### Boundaries
Server Components: pages, `StatusFilter`, `WorkOrderDetail`, `PriorityBadge`, `StatusBadge`, `NoticeBanner`. **Client Components, exactly four:** `Providers`, `WorkOrdersTable`, `WorkOrderForm`, `DeleteWorkOrderButton`. Client code never imports the store or other server-only modules (`server-only` enforces this). Typed props, no `any`, short doc comments on exported functions and components.

### WorkOrdersTable (TanStack Table 8.21.3)
- Props: `status?: Status`. Data via `useSuspenseQuery` with the generated list options (same key as the prefetch).
- Columns: Title (`next/link` to detail), Priority (badge), Status (badge), Updated (UTC) (`<time dateTime>`).
- Only `getCoreRowModel` and `getSortedRowModel`. Sort state is local React state. Initial sort is `updatedAt` desc, matching server order.
- Sortable: title (alphabetical), priority (rank Low < Medium < High), updated (date). Status is not sortable.
- Header control is a real `<button>` inside `<th scope="col">`, `aria-sort` on the `<th>`, visible direction indicator.
- Semantic `<table>`, `sr-only` `<caption>`, horizontal-scroll wrapper. Empty state with a create link when no filter is active.

### WorkOrderForm
- Props: `{ mode: 'create' } | { mode: 'edit'; initial: WorkOrder }`. Fields: title, description (textarea with live character count), priority (select, default Medium); edit mode adds status.
- Client-side validation is limited to `required` and `maxLength`. Server is the source of truth; Zod schemas are not duplicated in the form.
- Submits via generated `createWorkOrder` / `updateWorkOrder` mutation options.
- On `400` with `fieldErrors` (body typed as `ApiError`): message under each field (`aria-invalid="true"`, `aria-describedby`), focus moves to the first invalid field, input preserved. Other errors: form-level message in `role="alert"`.
- Pending: submit disabled and `aria-busy` set (prevents double submit).
- Success: invalidate all `listWorkOrders` queries (all status variants, via the generated key's identifier), then `router.push('/work-orders/{id}?notice=created|updated')`.
- Cancel links back to the list (create) or detail (edit).

### DeleteWorkOrderButton
Props: `id`, `title`. Opens a native `<dialog>` via `showModal()` with Confirm and Cancel; Escape closes. Confirm uses the generated `deleteWorkOrder` mutation, invalidates list queries, then `router.push('/?notice=deleted')`. On failure, `role="alert"` inside the dialog.

### UX and accessibility
Tailwind only, mobile-first, readable at 320px, max-width container. Everything keyboard-operable with visible `focus-visible` rings. Every input has a `<label>`; required fields marked in text. Skip link. WCAG AA contrast. Badges use text plus color. Description is rendered as plain text (`whitespace-pre-wrap break-words`); `dangerouslySetInnerHTML` is forbidden repo-wide.

## 8. Seed script

`scripts/seed.ts`, run via `npm run seed` (`tsx`). Writes 6-8 realistic technician work orders (e.g. "Replace HVAC filter - Building B") covering every priority and status with varied `updatedAt`, using `replaceAllOrders`; it overwrites the existing file (documented). `data/work-orders.json` is gitignored and the app works with no file. `server-only` resolves to its empty module via `tsx --conditions=react-server` (no stub file; noted in the README). Vitest aliases it to the same empty module.

## 9. Testing

**Vitest:** jsdom default; `// @vitest-environment node` on API and store tests; `@/` alias parity with `tsconfig`; `server-only` aliased to an empty stub; generated code excluded from coverage. Each API/store test uses a fresh temp `WORK_ORDERS_FILE`. Behavior-focused names, no snapshots.

1. `app/api/work-orders/route.test.ts`: POST gives 201 with status `Open`; GET lists it; `?status=Open` filters; 1-char title gives 400 with `fieldErrors.title`; invalid `status` query gives 400.
2. `app/api/work-orders/[id]/route.test.ts`: PUT updates fields and changes `updatedAt`; DELETE gives 204 then GET gives 404; unknown or non-UUID id gives 404.
3. `lib/work-orders/store.test.ts`: missing file gives an empty list; ten concurrent creates all persist; corrupt file throws and is not reset.
4. `components/WorkOrdersTable.test.tsx`: cache seeded under the list key; rows render; empty state shows; clicking Priority sorts Low to High with correct `aria-sort`, then toggles.
5. `components/WorkOrderForm.test.tsx`: with `next/navigation` and `fetch` mocked, a 400 shows messages, sets `aria-invalid` and focuses the first invalid field; a valid submit sends the right payload, disables the button while pending, and navigates on success.

**Playwright (`npm run e2e`):** one Chromium happy path (create, detail, edit, list sort and filter, delete) against a dev/prod server started by `webServer` on a spare port with a temp `WORK_ORDERS_FILE`. Excluded from `npm test`.

## 10. Project structure

```
openapi.yaml
orval.config.ts
.gitattributes            (marks lib/api/generated as generated)
playwright.config.ts  vitest.config.ts
app/
  layout.tsx  page.tsx  error.tsx  not-found.tsx  globals.css
  work-orders/ new/page.tsx  [id]/page.tsx  [id]/edit/page.tsx
  api/work-orders/ route.ts (+test)  [id]/route.ts (+test)
components/
  StatusFilter.tsx  Badges.tsx  NoticeBanner.tsx  WorkOrderDetail.tsx
  WorkOrdersTable.tsx  WorkOrderForm.tsx  DeleteWorkOrderButton.tsx
lib/
  work-orders/ store.ts  format.ts
  api/ responses.ts  parse-body.ts  fetcher.ts (Orval mutator)  generated/ (committed codegen, never hand-edited)
  query/ get-query-client.ts  providers.tsx
scripts/seed.ts
e2e/ work-orders.spec.ts
data/                      (gitignored JSON)
README.md
```

Small single-purpose modules; no barrel files, no `utils.ts`. Scripts: `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test`, `seed`, `generate:api`, `e2e`.

## 11. README requirements

1. Overview (one paragraph).
2. Setup/Run: Node 24, `npm install`, `npm run seed`, `npm run dev`, `build`/`start`.
3. API contract and codegen: where `openapi.yaml` lives, what `npm run generate:api` produces, why generated code is committed (D14), never hand-edited.
4. Testing: `npm test`, `npm run e2e`.
5. Decisions and trade-offs (D1-D14 condensed), plus: why status filter not search; cache choice (`force-dynamic` + `staleTime` + invalidation, tag-based `revalidate` next with a real DB); Cache Components disabled to keep D9, as a future step; why detail/edit skip Query; why TanStack Table, limited to sorting, pinned to v8 (v9 reworked the API); file persistence limits (single process only, no read-only/serverless FS or multi-instance; a DB replaces only the store); `server-only` stub approach; npm over pnpm; what was cut.
6. Project structure.

## 12. Acceptance checklist

- `openapi.yaml` is the single contract; `npm run generate:api` yields no diff.
- Handlers validate with generated Zod schemas, use generated types, and return the exact status codes in §5.
- Only `Providers`, `WorkOrdersTable`, `WorkOrderForm`, `DeleteWorkOrderButton` are Client Components.
- List is server-prefetched and hydrated with no loading flash; column sorting works with correct `aria-sort`.
- Create, edit and delete update the list through Query invalidation without a manual refresh.
- Detail, create, edit and delete work end-to-end in the browser.
- Status filter works via `?status=`, including with JS disabled.
- JSON persistence survives a restart; `npm run seed` populates it.
- Field-level errors appear with focus moved to the first invalid field.
- `grep -r dangerouslySetInnerHTML` returns nothing (excluding `node_modules`).
- `npm run typecheck`, `lint`, `test`, `build` and `e2e` pass clean.
- Keyboard-only walkthrough of create, sort, edit, delete works; layout usable at 320px.
- README complete per §11.

## 13. Build order (about 6h)

1. Scaffold: config fix (remove `cacheComponents`/`partialPrefetching`), remove `pnpm-workspace.yaml`, deps, scripts, Vitest, gitignore/gitattributes.
2. `openapi.yaml`, Orval config, `lib/api/fetcher.ts`, generate, inspect output.
3. Store (+ tests).
4. Route Handlers (+ tests).
5. Seed script.
6. Layout, Query plumbing, detail/not-found/error pages.
7. List page: prefetch and hydration, `StatusFilter`, `WorkOrdersTable` (+ test).
8. `WorkOrderForm` (+ test).
9. Delete dialog and notices.
10. Accessibility and responsive pass, manual keyboard check.
11. Playwright happy path.
12. README; final `typecheck`, `lint`, `test`, `build`, `e2e`.

## 14. Guardrails

No abstraction until used twice (the shared form, response helpers and Query plumbing are the only planned ones). Never hand-edit generated files; fix `openapi.yaml` or the codegen config instead. No comments that restate code. No dead code, unused deps or placeholder files. No speculative config. Prefer platform features (native `<dialog>`, `<Link>`, HTML attributes). Ambiguity resolves to the simpler reading, recorded in the README.
