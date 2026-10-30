import { useEffect, useRef, useState } from 'react';
import { api, describeError } from '../api';
import type { InvestigationAnalysis } from '../types';

export function useInvestigationAnalysis(replayId?: string, eventId?: string) {
  const key = `${replayId || ''}:${eventId || 'risks'}`;
  const controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ key: string; loading?: boolean; error?: string; data?: InvestigationAnalysis }>({ key });
  useEffect(() => () => { controller.current?.abort(); controller.current = null; }, [key]);
  const shown = state.key === key ? state : { key };
  async function run() {
    if (!replayId || shown.loading) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setState({ key, loading: true });
    try {
      const data = await api.investigationAnalysis(replayId, eventId, request.signal);
      if (data.replayId !== replayId || data.eventId !== (eventId || null)) throw new Error('분석 대상이 일치하지 않습니다.');
      if (!request.signal.aborted) setState({ key, data });
    } catch (error) {
      if (!request.signal.aborted) setState({ key, error: describeError(error) });
    }
  }
  return { ...shown, run };
}
