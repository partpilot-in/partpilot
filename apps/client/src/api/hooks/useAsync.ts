import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
}

/**
 * Generic hook that runs an async fetcher when `deps` change.
 * Returns `{ data, loading, error, refetch }`.
 *
 * Pass `null` as `fetcher` to skip fetching (useful when a required
 * param like an id is not yet available).
 */
export function useAsync<T>(
  fetcher: (() => Promise<T>) | null,
  deps: unknown[] = [],
): AsyncState<T> & { refetch: () => void } {
  const [state, setState] = useState<AsyncState<T>>({
    data: undefined,
    loading: !!fetcher,
    error: undefined,
  });

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(() => {
    if (!fetcher) {
      setState({ data: undefined, loading: false, error: undefined });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: undefined }));

    fetcher()
      .then((data) => {
        if (mountedRef.current) {
          setState({ data, loading: false, error: undefined });
        }
      })
      .catch((err) => {
        if (mountedRef.current) {
          const message =
            err instanceof Error ? err.message : "An unknown error occurred";
          setState({ data: undefined, loading: false, error: message });
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { ...state, refetch: run };
}
