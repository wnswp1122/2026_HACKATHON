import type { Analysis, Incident, IncidentStatus, Overview, SecurityEvent, Severity, Source, TrendPoint } from './model';
import { demoAnalysis, demoIncidents, demoOverview, updateDemoIncident } from './mock';

export const dataMode = import.meta.env.VITE_DATA_MODE === 'api' ? 'api' : 'demo';
const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const asObject = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const str = (value: unknown): string => typeof value === 'string' ? value : '';
const opt = (value: unknown): string | null => typeof value === 'string' && value.length ? value : null;
const num = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const status = (value: unknown): IncidentStatus => ['unconfirmed', 'investigating', 'resolved', 'benign'].includes(str(value)) ? value as IncidentStatus : 'unknown';
const severity = (value: unknown): Severity => ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(str(value).toUpperCase()) ? str(value).toUpperCase() as Severity : 'UNKNOWN';
const source = (value: unknown): Source => value === 'sample' || value === 'live' ? value : 'unknown';

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${baseUrl}${path}`, { ...init, signal: controller.signal, headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const error = asObject(asObject(body).error);
      throw new Error(str(error.message) || `API 요청 실패 (${response.status})`);
    }
    return response.status === 204 ? null : response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('API 응답 시간이 초과됐습니다.');
    throw error;
  } finally { clearTimeout(timeout); }
}

function normalizeEvent(input: unknown, incidentId = ''): SecurityEvent {
  const x = asObject(input);
  const process = asObject(x.process);
  const raw = asObject(x.rawEvent ?? x.raw_event);
  return {
    id: str(x.id ?? x.eventId), incidentId: str(x.incidentId) || incidentId,
    occurredAt: opt(x.occurredAt), server: str(x.server ?? x.instanceId), type: str(x.type ?? x.eventType) || 'OTHER',
    title: str(x.title) || str(x.eventType) || '관찰 이벤트', process: opt(process.binary ?? x.binary),
    command: opt(x.command ?? x.arguments), parent: opt(process.parentBinary ?? x.parentBinary),
    target: opt(x.target), ip: opt(x.ip), port: num(x.port), rawEvent: Object.keys(raw).length ? raw : null,
  };
}
function normalizeAnalysis(input: unknown): Analysis | null {
  const x = asObject(input);
  if (!Object.keys(x).length) return null;
  return { behavior: str(x.behavior), risk: str(x.risk), impact: str(x.impact), evidence: str(x.evidence), uncertainty: str(x.uncertainty), analyzedAt: opt(x.analyzedAt) };
}
function normalizeIncident(input: unknown): Incident {
  const x = asObject(input);
  const guide = array(x.guide).filter((v): v is string => typeof v === 'string');
  const checklist = array(x.checklist).map(v => typeof v === 'boolean' ? v : asObject(v).completed === true);
  return {
    id: str(x.id), title: str(x.title) || '제목 없음', server: str(x.server ?? x.instanceId), firstSeenAt: opt(x.firstSeenAt),
    severity: severity(x.severity), status: status(x.status), source: source(x.source),
    events: array(x.events).map(v => normalizeEvent(v, str(x.id))), analysis: normalizeAnalysis(x.analysis),
    guide, checklist: guide.map((_, i) => checklist[i] || false), memo: str(x.memo),
    activity: array(x.activity).map(v => ({ at: str(asObject(v).at), text: str(asObject(v).text) })).filter(v => v.text),
  };
}
function normalizeOverview(input: unknown): Overview {
  const x = asObject(input);
  const collector = str(x.collectorStatus);
  return {
    monitoredServers: num(x.monitoredServers), collectorStatus: collector === 'healthy' || collector === 'degraded' ? collector : 'unknown',
    collectorLabel: opt(x.collectorLabel), todayEvents: num(x.todayEvents),
    trend: array(x.trend).map(v => { const p = asObject(v); return { time: str(p.time), process: num(p.process) || 0, file: num(p.file) || 0, network: num(p.network) || 0, high: num(p.high) || 0 } as TrendPoint; }),
    serverRisk: array(x.serverRisk).map(v => ({ server: str(asObject(v).server), score: num(asObject(v).score) || 0 })),
    severityDistribution: array(x.severityDistribution).map(v => ({ severity: severity(asObject(v).severity), count: num(asObject(v).count) || 0 })),
  };
}

export const dataClient = {
  async overview(): Promise<Overview> { return dataMode === 'demo' ? demoOverview() : normalizeOverview(await request('/api/overview')); },
  async incidents(): Promise<Incident[]> {
    if (dataMode === 'demo') return demoIncidents();
    const body = await request('/api/incidents');
    return array(Array.isArray(body) ? body : asObject(body).items).map(normalizeIncident);
  },
  async incident(id: string): Promise<Incident> {
    if (dataMode === 'demo') {
      const found = demoIncidents().find(x => x.id === id);
      if (!found) throw new Error('사고를 찾을 수 없습니다.');
      return found;
    }
    return normalizeIncident(await request(`/api/incidents/${encodeURIComponent(id)}`));
  },
  async events(): Promise<SecurityEvent[]> {
    if (dataMode === 'demo') return demoIncidents().flatMap(x => x.events);
    const body = await request('/api/events');
    return array(Array.isArray(body) ? body : asObject(body).items).map(v => normalizeEvent(v));
  },
  async analyze(id: string): Promise<Analysis> {
    if (dataMode === 'demo') { await new Promise(resolve => setTimeout(resolve, 650)); return demoAnalysis(id); }
    const body = await request(`/api/incidents/${encodeURIComponent(id)}/analyze`, { method: 'POST' });
    const analysis = normalizeAnalysis(asObject(body).analysis ?? body);
    if (!analysis) throw new Error('분석 결과가 비어 있습니다.');
    return analysis;
  },
  async updateIncident(id: string, changes: Partial<Pick<Incident, 'status' | 'checklist' | 'memo'>>): Promise<Incident> {
    if (dataMode === 'demo') return updateDemoIncident(id, changes);
    await request(`/api/incidents/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(changes) });
    return this.incident(id);
  },
};
