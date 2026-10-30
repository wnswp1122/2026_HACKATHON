import type {
  Analysis,
  Dashboard,
  Event,
  EventPage,
  Filters,
  Instance,
  Snapshot,
  PeriodFilters,
  NetworkResponse,
  Graph,
  Servers,
  Readiness,
  Replay,
} from './types';
import { safeSnapshotFilters } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(path.endsWith('/analysis') || path.endsWith('/analyze') ? 120_000 : 15_000);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, signal });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결하지 못했거나 응답 시간이 초과되었습니다.');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = body && typeof body === 'object' && 'error' in body ? body.error : null;
    const safeCode =
      code && typeof code === 'object' && 'code' in code && typeof code.code === 'string'
        ? code.code
        : `HTTP_${response.status}`;
    // 서버 오류 본문에 원본/키가 섞여 있어도 UI에 그대로 복사하지 않습니다.
    throw new ApiError(response.status, safeCode, errorMessage(safeCode));
  }
  if (!body || typeof body !== 'object')
    throw new ApiError(502, 'INVALID_RESPONSE', '서버 응답 형식을 확인하세요.');
  return body as T;
}
function errorMessage(code: string) {
  const messages: Record<string, string> = {
    HTTP_502: '조회 서버에 연결할 수 없습니다. 잠시 후 새로고침해 주세요.',
    HTTP_503: '조회 서버를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    AI_NOT_CONFIGURED: 'AI가 서버에 설정되지 않았습니다. 서버의 키·모델 설정이 필요합니다.',
    AI_QUOTA_EXHAUSTED: 'Gemini API 사용 한도에 도달했습니다. AI Studio에서 요청·토큰 한도를 확인하고, 한도가 회복된 뒤 같은 스냅샷으로 재시도하세요.',
    AI_FAILED: 'AI 분석에 실패했습니다. 성공 결과는 생성되지 않았습니다.',
    AI_TIMEOUT: 'AI 응답 시간이 초과되었습니다. 같은 스냅샷으로 재시도할 수 있습니다.',
    IMAGE_REQUIRED: '스냅샷 이미지가 필요합니다. 업로드 상태를 확인하세요.',
    VALIDATION_ERROR: '필터나 요청 형식이 계약과 맞지 않습니다.',
    STORAGE_UNAVAILABLE: '저장소를 사용할 수 없습니다. 마지막 성공 데이터를 유지합니다.',
  };
  return messages[code] || '요청을 완료하지 못했습니다. 서버 상태와 요청을 확인하세요.';
}
export const describeError = (error: unknown) =>
  error instanceof ApiError
    ? `${error.message} (${error.code})`
    : error instanceof Error
      ? error.message
      : '알 수 없는 오류입니다.';
export const query = (filters: PeriodFilters) =>
  new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== undefined));
export const api = {
  network: (filters: PeriodFilters, signal: AbortSignal) =>
    request<NetworkResponse>(`/network?${query(filters)}`, { signal }),
  graph: (filters: PeriodFilters, signal: AbortSignal) =>
    request<Graph>(`/graph?${query(filters)}`, { signal }),
  servers: (filters: PeriodFilters, signal: AbortSignal) =>
    request<Servers>(`/servers?${query(filters)}`, { signal }),
  readiness: (instanceId: string | undefined, source: 'live' | 'sample', signal: AbortSignal) =>
    request<Readiness>(
      `/readiness?${new URLSearchParams({ source, ...(instanceId ? { instanceId } : {}) })}`,
      { signal },
    ),
  replay: (filters: PeriodFilters) =>
    request<Replay>('/replays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filters),
    }),
  getReplay: (id: string, signal: AbortSignal) =>
    request<Replay>(`/replays/${encodeURIComponent(id)}`, { signal }),
  instances: (signal: AbortSignal) => request<{ items: Instance[] }>('/instances', { signal }),
  dashboard: (filters: PeriodFilters, signal: AbortSignal) =>
    request<Dashboard>(`/dashboard?${query(filters)}`, { signal }),
  events: (filters: PeriodFilters, page: number, signal: AbortSignal) =>
    request<EventPage>(`/events?${query(filters)}&page=${page}&pageSize=20`, { signal }),
  detail: (id: string, signal: AbortSignal) =>
    request<{ event: Event; rawEvent: object }>(`/events/${encodeURIComponent(id)}`, { signal }),
  snapshot: (filters: Filters) =>
    request<Snapshot>('/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(safeSnapshotFilters(filters)),
    }),
  getSnapshot: (id: string, signal: AbortSignal) =>
    request<Snapshot>(`/snapshots/${encodeURIComponent(id)}`, { signal }),
  upload: (id: string, blob: Blob) =>
    request<{ snapshotId: string; imageSha256: string }>(`/snapshots/${id}/image`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: blob,
    }),
  analyze: (id: string) => request<Analysis>(`/snapshots/${id}/analysis`, { method: 'POST' }),
  analysis: (id: string, signal: AbortSignal) =>
    request<Analysis>(`/snapshots/${encodeURIComponent(id)}/analysis`, { signal }),
};
