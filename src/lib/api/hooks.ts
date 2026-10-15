'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UseApiResult<T> extends UseApiState<T> {
  refetch: () => void;
}

/**
 * Generic hook for calling an API function and tracking loading / error state.
 *
 * @param apiFn   - async function that returns the data (e.g. `() => stockApi.list()`)
 * @param deps    - dependency array — re-fetches when any dep changes (default: [])
 * @param enabled - set to false to skip the initial fetch (default: true)
 *
 * @example
 * const { data, loading, error, refetch } = useApi(() => stockApi.list(), []);
 */
export function useApi<T>(
  apiFn: () => Promise<T>,
  deps: unknown[] = [],
  enabled = true,
): UseApiResult<T> {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: enabled,
    error: null,
  });

  // Keep a stable ref to the latest apiFn so we don't need it in the dep array
  const apiFnRef = useRef(apiFn);
  apiFnRef.current = apiFn;

  const fetchData = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const data = await apiFnRef.current();
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!enabled) return;
    fetchData();
  }, [fetchData, enabled]);

  return { ...state, refetch: fetchData };
}

/**
 * Mutation hook — wraps an API call that modifies data (POST / PUT / PATCH / DELETE).
 *
 * @example
 * const { mutate, loading, error } = useMutation((id: string) => stockApi.updateCount(id, { currentStock: 5 }));
 * await mutate(itemId);
 */
export function useApiMutation<TArgs extends unknown[], TResult>(
  mutationFn: (...args: TArgs) => Promise<TResult>,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (...args: TArgs): Promise<TResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await mutationFn(...args);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { mutate, loading, error };
}
