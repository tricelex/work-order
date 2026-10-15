# Technician Work Orders

A small Next.js (App Router) app for managing technician work orders: list, sort, filter by status, create, edit, delete and view detail. Data is persisted to a JSON file. The API is defined contract-first in `openapi.yaml`; types, fetch functions, TanStack Query hooks and Zod schemas are generated from it and used on both the server and the client.

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
- **List page (D5, D8).** A Server Component prefetches into a per-request QueryClient using the generated query options with the store as `queryFn` (no HTTP call to itself), then hydrates a client table through `useSuspenseQuery`. There is no loading flash. `staleTime` is 60s to avoid an immediate refetch after hydration. The server creates a new client per request, the browser keeps a singleton. A corrupt data file throws into `app/error.tsx` instead of rendering an empty list.
- **Detail and edit skip TanStack Query (D6).** They are single reads, so Query adds nothing; they read the store directly in Server Components and keep the client bundle small.
- **Mutations (D7).** Forms and the delete dialog use the generated mutation hooks and invalidate every list query (all status variants) before navigating.
- **Caching (D9).** `force-dynamic` on data pages and handlers, plus Query `staleTime` and invalidation. Mutable file data must never be served stale. Next's Cache Components are switched off (the scaffold enabled them, which makes `dynamic = 'force-dynamic'` an error). With a real database, tag-based `revalidate` or `use cache` would be the next step.
- **TanStack Table, limited to sorting.** It earns its place through client-side sorting of title, priority (Low < Medium < High) and last updated, with correct `aria-sort`. Filtering, pagination and column features are deliberately not used. Pinned to v8 because v9 reworked the API.
- **Persistence (D10).** Writes are atomic (temp file then rename) and mutations run through an in-process promise queue. This is safe for a single Node process only. It does not work on read-only or serverless filesystems or across multiple instances. A database would replace only `lib/work-orders/store.ts`. A corrupt data file raises an error and is never silently reset. The store's file calls carry `turbopackIgnore` because the path is runtime configuration, not a build-time asset.
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
