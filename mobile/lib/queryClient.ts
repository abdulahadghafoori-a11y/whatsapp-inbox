import {
  QueryClient,
  defaultShouldDehydrateQuery,
  type Query,
} from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { appStorage } from '@/lib/appStorage'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      gcTime: 7 * 24 * 60 * 60 * 1000,
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
})

export const queryPersister = createAsyncStoragePersister({
  storage: appStorage,
  key: 'wa-inbox-query-cache-v3',
})

export function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0]
  return root === 'conversations' || root === 'messages' || root === 'conversation' || root === 'media'
}

/** Only persist settled successful queries — never in-flight or errored fetches. */
export function shouldDehydrateQuery(query: Query): boolean {
  if (!shouldPersistQuery(query.queryKey)) return false
  return defaultShouldDehydrateQuery(query)
}
