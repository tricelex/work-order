# Technician Work Orders

A small Next.js (App Router, TypeScript) app for managing technician work orders: list, sort, filter by status, create, edit, delete and view detail. Data is stored in a JSON file. The API is defined contract-first in `openapi.yaml`; types, fetch functions, TanStack Query hooks and Zod schemas are generated from it and shared by the server and the client.

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

## Filter choice: status filter (not text search)

The brief asks for one of the two. I chose **status filter**: it is driven by the URL (`/?status=In%20Progress`), rendered on the server, shareable, works without JavaScript, and is trivial to test. Text search would need debounced client state and more edge cases for little extra value at this scale.

## Safe rendering

Descriptions are rendered as plain text: a React text node inside an element with `whitespace-pre-wrap break-words`. `dangerouslySetInnerHTML` is not used anywhere in the repo, and a long unbroken string wraps instead of breaking the layout (covered by an e2e test at 320px).

## Cache choice

Pages and Route Handlers that touch data export `dynamic = 'force-dynamic'`, and the list also uses TanStack Query with `staleTime: 60_000` plus invalidation after every mutation.

- **Why not cache the data on the server?** The data is a mutable file that changes on every create, edit and delete. A cached read would show stale rows right after a write, which is the worst failure for a CRUD app. `force-dynamic` makes every request read the file.
- **Why a 60s `staleTime` then?** The list is prefetched on the server and hydrated into the browser's Query cache. Without `staleTime`, the client would refetch immediately after hydrating, doubling the work for no change in data.
- **How does it stay correct?** Create, edit and delete all invalidate every list query (every status variant), then navigate, so the list is fresh without a manual refresh.
- **Next step with a real database:** switch to tag-based `revalidate` (or `use cache`) so reads are cached and each write invalidates a tag. Next's Cache Components are turned off here because they make `dynamic = 'force-dynamic'` an error.

## API contract and codegen

`openapi.yaml` is the single source of truth. `npm run generate:api` runs [Orval](https://orval.dev) (pinned to an exact version) and writes model types, fetch functions, TanStack Query hooks (including suspense variants) and per-operation Zod schemas to `lib/api/generated/`. Re-run it whenever the spec changes. The only hand-written glue is `lib/api/fetcher.ts`, Orval's "mutator": it makes generated functions return plain data and throw `ApiRequestError` on non-2xx, which is what the form reads field errors from.

The generated code is **committed** so reviewers can run the app without a generate step. It is marked `linguist-generated`, excluded from lint and coverage, and never hand-edited: fix `openapi.yaml` or `orval.config.ts` instead. On a clean checkout `npm run generate:api` produces no diff.

Route Handlers validate with the generated Zod schemas and return field-level errors (`{ error: { code, message, fieldErrors } }`), so a contract change breaks the build rather than production.

## Testing

```bash
npm test      # 9 Vitest tests: API (create, list, filter, validation, update, delete, 404), store, table, form, i18n
npm run e2e   # 3 Playwright tests: full happy path, long-description layout at 320px, deleting an already-deleted order
```

`npx playwright install chromium` is needed once before `npm run e2e`. The Vitest suite covers the core path only: the create → list → filter API flow and validation errors, the update/delete/404 lifecycle, the store's concurrency and corrupt-file handling, table sorting with `aria-sort`, and the form's field errors, focus and submit. The Playwright run uses a temporary data file and builds the app first. Generated code is not tested directly.

## Bonus items

**Accessibility**
- Skip link, a labelled landmark structure, and visible `focus-visible` rings on every control.
- Every input has a `<label>`; required fields say "(required)" in text, not only colour.
- On a failed submit, field errors appear under each field (`aria-invalid`, `aria-describedby`) and **focus moves to the first invalid field**; input is preserved.
- Pending submits set `aria-busy` and disable the button, which also prevents double submits.
- Sortable column headers are real buttons inside `<th scope="col">` with `aria-sort`; the table has an `sr-only` caption.
- Confirmations and errors use `role="status"` / `role="alert"`; delete uses a native `<dialog>` (Escape closes it, but not while the request is in flight).
- Each page has a distinct `<title>` (the detail page uses the work order's title).

**Performance**
- The list is rendered on the server and hydrated, so the first paint has data and there is no loading flash or duplicate fetch (see Cache choice).
- Sorting runs in memory on the client, with no round trips.
- Only the four components that need interaction are Client Components; detail and edit pages are Server Components that read the store directly.
- Writes are serialized and atomic (temp file then rename). Reading and parsing the whole file per request is fine at this scale and is the first thing a database would replace.

**Minimal i18n (static dictionary)**
All UI strings live in `lib/i18n/messages.ts` as a typed dictionary (`en`) with a `t(key, vars)` helper. Unknown keys are a compile error and `{placeholders}` are filled from `vars`. To add a language, add another dictionary of the same shape to `dictionaries` and pass its locale. Wiring a locale to a cookie or `Accept-Language` is the next step. Not translated yet: API validation messages and the priority/status values, which are API data.

## Decisions and trade-offs

- **Scope kept to the brief's must-haves**, with nothing added for show: no auth, uploads, pagination, search, analytics or real-time.
- **Contract-first codegen** (OpenAPI → Orval) instead of hand-written types, which costs some setup and one small hand-written wrapper but removes drift between the API, the client and validation. Orval does not generate Zod for error bodies or standalone enums, so the form uses a small `toApiError` guard and the generated `Status`/`Priority` constants.
- **TanStack Query and Table** back the list: Query for hydration and invalidation, Table for client-side column sorting, which goes beyond the brief. Its use is deliberately limited to sorting; it is pinned to v8 because v9 reworked the API.
- **Detail and edit skip TanStack Query.** They are single reads, so Query adds nothing.
- **File persistence limits.** Safe for a single Node process only. It does not work on read-only or serverless filesystems or across several instances; a database would replace only `lib/work-orders/store.ts`. A corrupt data file raises an error and is never silently reset. The store's file calls carry `turbopackIgnore` because the path is runtime configuration.
- **Dates** are shown in UTC with a fixed `en-GB` format so server and client output match.
- **Validation** is server-side only; the form relies on `required`/`maxLength` attributes and shows the server's field errors rather than duplicating the schemas.
- **Cut:** pagination, text search, authentication, optimistic updates, and a component test for the delete dialog (jsdom lacks `showModal`; the e2e test covers it). Test count was kept small on purpose.

## Project structure

```
openapi.yaml  orval.config.ts  vitest.config.ts  playwright.config.ts
app/            pages, error/not-found, api/work-orders route handlers (+ tests)
components/     StatusFilter, Badges, NoticeBanner, WorkOrderDetail (server)
                WorkOrdersTable, WorkOrderForm, DeleteWorkOrderButton (client)
lib/
  api/          responses.ts, parse-body.ts, fetcher.ts (Orval mutator), generated/ (codegen output)
  i18n/         messages.ts (static dictionary and t())
  query/        get-query-client.ts, providers.tsx
  work-orders/  store.ts (server-only), list-query.ts, format.ts
scripts/seed.ts
e2e/            Playwright tests
data/           JSON data (gitignored)
```
