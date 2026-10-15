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
