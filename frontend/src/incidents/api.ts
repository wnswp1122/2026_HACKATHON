import { ApiError, request } from '../api';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type IncidentStatus = 'unconfirmed' | 'investigating' | 'resolved' | 'benign' | 'unknown';
export type IncidentEvent = {
  id: string;
  occurredAt: string | null;
  title: string;
  type: string | null;
  process: string | null;
  command: string | null;
  parent: string | null;
  filePath: string | null;
  network: string | null;
  raw: unknown;
};
export type Incident = {
  id: string;
  title: string;
  server: string | null;
  firstSeenAt: string | null;
  severity: Severity;
  status: IncidentStatus;
  source: 'demo' | 'live' | 'unknown';
  events: IncidentEvent[];
  eventCount: number;
  analysis: {
    kind: 'demo' | 'ai';
    behavior: string;
    risk: string;
    impact: string;
    evidence: string;
    uncertainty: string;
  } | null;
  checklist: { id: string; label: string; done: boolean }[];
  memo: string;
  history: { at: string; text: string }[];
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const str = (value: unknown) => typeof value === 'string' ? value : '';
const nullable = (value: unknown) => str(value) || null;
const choices = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? value as T : fallback;
const normalizeEvent = (value: unknown, index: number): IncidentEvent => {
  const e = record(value);
  return {
    id: str(e.id || e.eventId) || `event-${index}`,
    occurredAt: nullable(e.occurredAt),
    title: str(e.title) || '관찰 이벤트',
    type: nullable(e.type || e.eventType),
    process: nullable(e.process),
    command: nullable(e.command),
    parent: nullable(e.parent),
    filePath: nullable(e.filePath),
    network: nullable(e.network),
    raw: e.raw ?? null,
  };
};
export function normalizeIncident(value: unknown): Incident {
  const i = record(value);
  const analysis = record(i.analysis);
  const events = Array.isArray(i.events) ? i.events.map(normalizeEvent) : [];
  const checklist = Array.isArray(i.checklist) ? i.checklist.map((value, index) => {
    const item = record(value);
    return { id: str(item.id) || `step-${index}`, label: str(item.label), done: item.done === true };
  }).filter((item) => item.label) : [];
  return {
    id: str(i.id), title: str(i.title) || '제목 미제공', server: nullable(i.server),
    firstSeenAt: nullable(i.firstSeenAt),
    severity: choices(i.severity, ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'], 'UNKNOWN'),
    status: choices(i.status, ['unconfirmed', 'investigating', 'resolved', 'benign', 'unknown'], 'unknown'),
    source: choices(i.source, ['demo', 'live', 'unknown'], 'unknown'),
    events, eventCount: typeof i.eventCount === 'number' && i.eventCount >= 0 ? i.eventCount : events.length,
    analysis: analysis.behavior || analysis.risk || analysis.impact ? {
      kind: analysis.kind === 'demo' ? 'demo' : 'ai',
      behavior: str(analysis.behavior), risk: str(analysis.risk), impact: str(analysis.impact),
      evidence: str(analysis.evidence), uncertainty: str(analysis.uncertainty),
    } : null,
    checklist, memo: str(i.memo),
    history: Array.isArray(i.history) ? i.history.map((value) => {
      const entry = record(value);
      return { at: str(entry.at), text: str(entry.text) };
    }) : [],
  };
}
const path = (id: string) => `/incidents/${encodeURIComponent(id)}`;
const headers = { 'Content-Type': 'application/json' };
export const incidentApi = {
  list: async (signal: AbortSignal) => {
    const value = record(await request<unknown>('/incidents', { signal }));
    if (!Array.isArray(value.items)) throw new ApiError(502, 'INVALID_RESPONSE', '사건 목록 응답 형식을 확인하세요.');
    return value.items.map(normalizeIncident);
  },
  detail: async (id: string, signal: AbortSignal) => normalizeIncident(await request<unknown>(path(id), { signal })),
  analyze: async (id: string) => normalizeIncident(await request<unknown>(`${path(id)}/analyze`, { method: 'POST' })),
  update: async (id: string, changes: Pick<Incident, 'status' | 'checklist' | 'memo'>) =>
    normalizeIncident(await request<unknown>(path(id), { method: 'PATCH', headers, body: JSON.stringify(changes) })),
};
