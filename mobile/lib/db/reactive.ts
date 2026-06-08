import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { addDatabaseChangeListener } from 'expo-sqlite'
import { runExclusiveDb } from './client'

/**
 * Lightweight reactive layer over the device SQLite connection.
 *
 * Replaces Drizzle's `useLiveQuery` (whose prepared statements raced our raw
 * write batches and produced "database is locked" / "transaction within a
 * transaction"). Here:
 *  - a single `addDatabaseChangeListener` fans out debounced change events,
 *  - every reactive READ runs through the same `runExclusiveDb` serialization
 *    queue as writes (so reads never overlap a write batch),
 *  - each store caches its last result in memory and survives unmount for a
 *    short TTL, so reopening a chat/inbox renders synchronously (no loader).
 */

export interface StoreState<T> {
  data: T
  status: 'loading' | 'ready'
  error: unknown
}

interface InternalStore<T> {
  key: string
  tables: Set<string>
  reader: () => Promise<T>
  state: StoreState<T>
  listeners: Set<() => void>
  reading: boolean
  rereadQueued: boolean
  dirty: boolean
  evictTimer: ReturnType<typeof setTimeout> | null
}

const registry = new Map<string, InternalStore<unknown>>()

/** Keep a store's cached snapshot alive this long after its last subscriber. */
const EVICT_TTL_MS = 120_000
/** Coalesce DB change notifications into a single refresh pass. */
const CHANGE_DEBOUNCE_MS = 60

let listenerAttached = false
const pendingTables = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

function ensureGlobalListener(): void {
  if (listenerAttached) return
  listenerAttached = true
  addDatabaseChangeListener(({ tableName }) => {
    if (tableName) pendingTables.add(tableName)
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      const tables = new Set(pendingTables)
      pendingTables.clear()
      for (const store of registry.values()) {
        for (const t of tables) {
          if (store.tables.has(t)) {
            refreshStore(store)
            break
          }
        }
      }
    }, CHANGE_DEBOUNCE_MS)
  })
}

function emit(store: InternalStore<unknown>): void {
  for (const l of store.listeners) l()
}

function refreshStore<T>(store: InternalStore<T>): void {
  if (store.listeners.size === 0) {
    // No active subscribers: mark dirty and re-read lazily on next subscribe.
    store.dirty = true
    return
  }
  if (store.reading) {
    store.rereadQueued = true
    return
  }
  store.reading = true
  store.dirty = false
  void (async () => {
    try {
      const data = await runExclusiveDb(() => store.reader())
      if (data !== store.state.data || store.state.status !== 'ready' || store.state.error) {
        store.state = { data, status: 'ready', error: null }
        emit(store)
      }
    } catch (error) {
      store.state = { data: store.state.data, status: 'ready', error }
      emit(store)
    } finally {
      store.reading = false
      if (store.rereadQueued) {
        store.rereadQueued = false
        refreshStore(store)
      }
    }
  })()
}

function getOrCreateStore<T>(
  key: string,
  tables: string[],
  reader: () => Promise<T>,
  initial: T,
): InternalStore<T> {
  ensureGlobalListener()
  let store = registry.get(key) as InternalStore<T> | undefined
  if (!store) {
    store = {
      key,
      tables: new Set(tables),
      reader,
      state: { data: initial, status: 'loading', error: null },
      listeners: new Set(),
      reading: false,
      rereadQueued: false,
      dirty: true,
      evictTimer: null,
    }
    registry.set(key, store as InternalStore<unknown>)
  } else {
    // Refresh the reader closure so it captures the latest params each render.
    store.reader = reader
  }
  return store
}

function subscribe(store: InternalStore<unknown>, cb: () => void): () => void {
  if (store.evictTimer) {
    clearTimeout(store.evictTimer)
    store.evictTimer = null
  }
  store.listeners.add(cb)
  if (store.state.status === 'loading' || store.dirty) refreshStore(store)
  return () => {
    store.listeners.delete(cb)
    if (store.listeners.size === 0) {
      store.evictTimer = setTimeout(() => {
        if (store.listeners.size === 0) registry.delete(store.key)
      }, EVICT_TTL_MS)
    }
  }
}

/**
 * Subscribe a component to a reactive SQLite query. `reader` must be a stable
 * closure for the current params (wrap in useCallback). Returns the latest
 * state plus a `refresh` to force a re-read (e.g. when a paging limit grows).
 */
export function useLiveStore<T>(
  key: string,
  tables: string[],
  reader: () => Promise<T>,
  initial: T,
): StoreState<T> & { refresh: () => void } {
  const store = getOrCreateStore(key, tables, reader, initial)
  store.reader = reader

  const state = useSyncExternalStore(
    useCallback((cb) => subscribe(store as InternalStore<unknown>, cb), [store]),
    () => store.state,
  )

  const refresh = useCallback(() => refreshStore(store), [store])
  return { ...state, refresh }
}

/** Force a re-read of a store by key (no-op if not mounted/registered). */
export function refreshLiveStore(key: string): void {
  const store = registry.get(key)
  if (store) refreshStore(store)
}

/** Re-read every registered store (used after bulk operations like logout). */
export function refreshAllLiveStores(): void {
  for (const store of registry.values()) refreshStore(store)
}

/** Drop all cached snapshots (e.g. on logout) so stale data can't leak. */
export function clearLiveStores(): void {
  // Cancel pending eviction + change-flush timers so a logout→login within the
  // TTL window can't fire callbacks against evicted stores or surface stale data.
  for (const store of registry.values()) {
    if (store.evictTimer) {
      clearTimeout(store.evictTimer)
      store.evictTimer = null
    }
  }
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  pendingTables.clear()
  registry.clear()
}
