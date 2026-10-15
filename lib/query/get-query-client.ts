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
