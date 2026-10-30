import { useCallback, useEffect, useState } from 'react';
import { describeError } from '../api';
import { selectionFilters, type PeriodFilters, type Selection } from '../types';

export type Resource<T> = { data?: T; error: string; loading: boolean; successAt?: string };
export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  refresh: number,
  enabled = true,
): Resource<T> {
  const [state, setState] = useState<Resource<T> & { loader: typeof load }>({ error: '', loading: true, loader: load });
  useEffect(() => {
    if (!enabled) return;
    let active = true,
      busy = false;
    const controller = new AbortController();
    setState((previous) => ({ ...(previous.loader === load ? previous : {}), loader: load, error: '', loading: true }));
    async function poll() {
      if (busy) return;
      busy = true;
      try {
        const data = await load(controller.signal);
        if (active)
          setState({ data, error: '', loading: false, successAt: new Date().toISOString(), loader: load });
      } catch (error) {
        if (active)
          setState((previous) => ({ ...previous, error: describeError(error), loading: false }));
      } finally {
        busy = false;
      }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [load, refresh, enabled]);
  return state.loader === load ? state : { error: '', loading: enabled };
}
export function usePeriodResource<T>(
  fetcher: (filters: PeriodFilters, signal: AbortSignal) => Promise<T>,
  selection: Selection,
  refresh: number,
  enabled = true,
) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const filters = selectionFilters(selection);
      return { value: await fetcher(filters, signal), filters };
    },
    [fetcher, selection],
  );
  return useResource(load, refresh, enabled);
}
