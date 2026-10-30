import { useEffect, useState } from 'react';
import { api, describeError } from '../api';
import {
  selectionFilters,
  type Dashboard,
  type EventPage,
  type Filters,
  type Instance,
  type Selection,
} from '../types';

type Data = {
  dashboard: Dashboard;
  events: EventPage;
  instances: Instance[];
  filters: Filters;
  successAt: string;
};
export function useDashboard(selection: Selection, page: number, refresh: number) {
  const [data, setData] = useState<Data>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    let busy = false;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    async function poll() {
      if (busy) return;
      busy = true;
      try {
        const filters = selectionFilters(selection);
        const [dashboard, events, instances] = await Promise.all([
          api.dashboard(filters, controller.signal),
          api.events(filters, page, controller.signal),
          api.instances(controller.signal),
        ]);
        if (active) {
          setData({
            dashboard,
            events,
            instances: instances.items,
            filters,
            successAt: new Date().toISOString(),
          });
          setError('');
        }
      } catch (error) {
        if (active) setError(describeError(error));
      } finally {
        busy = false;
        if (active) setLoading(false);
      }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [selection, page, refresh]);
  return { data, error, loading };
}
