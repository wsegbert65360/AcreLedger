import { vi } from 'vitest';

/**
 * Minimal Supabase client mock for unit tests.
 *
 * The chain object is a thenable: `await` at the end of a builder chain
 * resolves to the configured `{ data, error, count }` (or rejects when a throw
 * is set). Every chain method is a `vi.fn` returning the same builder, so any
 * real-world Supabase call shape resolves and the calls can be asserted on.
 *
 * Lifecycle: create one mock per test suite, `vi.doMock('@/lib/supabase', ...)`
 * with `mock.client`, and dynamically import the system under test. Call
 * `mock.reset()` in `beforeEach` — it re-installs implementations after
 * `mockReset()` strips them, so subsequent tests don't get `undefined`.
 *
 * Do NOT wrap `createSupabaseMock()` in `vi.hoisted(...)`: the factory is an
 * ordinary import and is not initialized at hoist time. The consumer pattern
 * above (`vi.doMock` + dynamic import) is the safe alternative.
 */

export interface SupabaseResult<T = unknown> {
  data: T | null;
  error: { message: string; code?: string; details?: string; hint?: string } | null;
  count: number | null;
}

export interface SupabaseMock {
  /** The object to hand to `vi.doMock('@/lib/sabase', () => ({ supabase: mock.client }))`. */
  client: { from: ReturnType<typeof vi.fn>; rpc: ReturnType<typeof vi.fn> };
  /** The underlying `vi.fn`s for `toHaveBeenCalledWith` / `toHaveBeenNthCalledWith` assertions. */
  fns: {
    from: ReturnType<typeof vi.fn>;
    rpc: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
  };
  /** Terminal result for the next awaited `from(...)` chain. */
  setResult: (result: Partial<SupabaseResult>) => void;
  /** Make the next awaited `from(...)` chain reject. */
  setThrow: (error: unknown) => void;
  /** Terminal result for the next `rpc(...)` call. Independent of `from(...)`. */
  setRpcResult: (result: Partial<SupabaseResult>) => void;
  /** Make the next `rpc(...)` call reject. */
  setRpcThrow: (error: unknown) => void;
  /** Per-table terminal override (takes precedence over `setResult`). */
  setTableHandler: (table: string, result: Partial<SupabaseResult>) => void;
  /** Re-install all implementations (after `mockReset`) and clear all state. Call in `beforeEach`. */
  reset: () => void;
}

const DEFAULT_RESULT: SupabaseResult = { data: null, error: null, count: 1 };

export function createSupabaseMock(): SupabaseMock {
  // Mutable terminal state. `then` (a real method, not a mock) reads these so
  // it survives `mockReset()`. `reset()` reinstalls the chain fns' return values
  // and clears this state.
  const state: {
    result: SupabaseResult;
    thrown: unknown;
    hasThrow: boolean;
    rpcResult: SupabaseResult;
    rpcThrown: unknown;
    rpcHasThrow: boolean;
    tableHandlers: Record<string, SupabaseResult>;
  } = {
    result: { ...DEFAULT_RESULT },
    thrown: null,
    hasThrow: false,
    rpcResult: { ...DEFAULT_RESULT },
    rpcThrown: null,
    rpcHasThrow: false,
    tableHandlers: {},
  };

  const chainMethods = ['insert', 'upsert', 'update', 'select', 'eq', 'in', 'is', 'order', 'single'] as const;
  const fns = {
    from: vi.fn(),
    rpc: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    single: vi.fn(),
  };

  const installChain = () => {
    for (const m of chainMethods) {
      // Preserve shared assertion spies while returning the particular builder
      // on which the chain method was invoked.
      fns[m].mockImplementation(function (this: Record<string, unknown>) {
        return this;
      });
    }
  };

  const createBuilder = (table: string): Record<string, unknown> => {
    const builder: Record<string, unknown> = {
      // Capture the table per query so concurrent chains remain isolated.
      then(onFulfilled: ((r: SupabaseResult) => unknown) | null, onRejected: ((e: unknown) => unknown) | null) {
        const terminal = state.tableHandlers[table] ?? state.result;
        if (state.hasThrow) {
          return Promise.reject(state.thrown).then(null, onRejected);
        }
        return Promise.resolve(terminal).then(onFulfilled);
      },
    };

    for (const m of chainMethods) {
      builder[m] = fns[m];
    }
    return builder;
  };

  const installFrom = () => {
    fns.from.mockImplementation((table: string) => createBuilder(table));
  };

  const installRpc = () => {
    fns.rpc.mockImplementation(() => {
      if (state.rpcHasThrow) return Promise.reject(state.rpcThrown);
      return Promise.resolve(state.rpcResult);
    });
  };

  const reset: SupabaseMock['reset'] = () => {
    // mockReset strips implementations; reset() re-installs them so the next
    // test's chain calls don't return undefined.
    Object.values(fns).forEach((fn) => fn.mockReset());
    state.result = { ...DEFAULT_RESULT };
    state.thrown = null;
    state.hasThrow = false;
    state.rpcResult = { ...DEFAULT_RESULT };
    state.rpcThrown = null;
    state.rpcHasThrow = false;
    state.tableHandlers = {};
    installChain();
    installFrom();
    installRpc();
  };

  const setResult: SupabaseMock['setResult'] = (result) => {
    state.result = { ...DEFAULT_RESULT, ...result };
  };
  const setThrow: SupabaseMock['setThrow'] = (error) => {
    state.thrown = error;
    state.hasThrow = true;
  };
  const setRpcResult: SupabaseMock['setRpcResult'] = (result) => {
    state.rpcResult = { ...DEFAULT_RESULT, ...result };
  };
  const setRpcThrow: SupabaseMock['setRpcThrow'] = (error) => {
    state.rpcThrown = error;
    state.rpcHasThrow = true;
  };
  const setTableHandler: SupabaseMock['setTableHandler'] = (table, result) => {
    state.tableHandlers[table] = { ...DEFAULT_RESULT, ...result };
  };

  // Initial install (the mock is usable immediately, before the first reset()).
  installChain();
  installFrom();
  installRpc();

  return {
    client: { from: fns.from, rpc: fns.rpc },
    fns,
    setResult,
    setThrow,
    setRpcResult,
    setRpcThrow,
    setTableHandler,
    reset,
  };
}
