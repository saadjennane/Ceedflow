import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  set: (value: T) => void;
}

/** Loads on mount and whenever `key` changes; `reload()` refetches. */
export function useAsync<T>(loader: () => Promise<T>, key: string): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const latest = useRef(loader);
  latest.current = loader;

  useEffect(() => {
    let live = true;
    setLoading(true);
    latest
      .current()
      .then((value) => {
        if (!live) return;
        setData(value);
        setError(null);
      })
      .catch((err: Error) => live && setError(err.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [key, tick]);

  return {
    data,
    error,
    loading,
    reload: useCallback(() => setTick((t) => t + 1), []),
    set: useCallback((value: T) => setData(value), []),
  };
}
