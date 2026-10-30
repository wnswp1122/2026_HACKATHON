export const eventTypes = [
  'PROCESS_EXEC',
  'PROCESS_EXIT',
  'FILE_ACCESS',
  'NETWORK',
  'OTHER',
] as const;
export type EventType = (typeof eventTypes)[number];
export type Source = 'live' | 'sample';
export type Status = 'observed' | 'attention';
export type Filters = {
  from: string;
  to: string;
  instanceId?: string;
  eventType?: EventType;
  status?: Status;
  source?: Source;
};
export type PeriodFilters = Filters & { processExecId?: string; policyName?: string };
export type Selection = Omit<PeriodFilters, 'from' | 'to'> & {
  period: string;
  from: string;
  to: string;
};
export type SafeEvent = {
  eventId: string;
  instanceId: string;
  source: Source;
  receivedAt: string;
  occurredAt: string | null;
  eventType: EventType;
  status: Status;
  outcome: 'unknown';
};
export type Event = SafeEvent & {
  nodeName: string | null;
  process: {
    execId: string | null;
    pid: number | null;
    uid: number | null;
    binary: string | null;
    parentBinary: string | null;
    parentExecId?: string | null;
  };
  file?: { path: string; operation: string | null } | null;
  network?: Network | null;
  target: string | null;
  policyName: string | null;
  reportedAction: string | null;
  reason: string | null;
};
export type Dashboard = {
  total: number;
  attention: number;
  byType: { eventType: EventType; count: number }[];
  bySource: { source: Source; count: number }[];
  timeline: { bucketStart: string; count: number; attention: number }[];
  bucketSeconds: number;
};
export type Snapshot = {
  snapshotId: string;
  createdAt: string;
  filters: Filters;
  dashboard: Dashboard;
  events: SafeEvent[];
  eventLimit: number;
  eventsTruncated: boolean;
};
export type Analysis = {
  analysisId: string;
  snapshotId: string;
  createdAt: string;
  model: string;
  instructionVersion: string;
  result: { facts: string[]; hypotheses: string[]; checks: string[]; limitations: string[] };
};
export type Instance = { instanceId: string; lastReceivedAt: string };
export type EventPage = { items: Event[]; total: number; page: number; pageSize: number };
export const typeLabels: Record<EventType, string> = {
  PROCESS_EXEC: '프로세스 실행',
  PROCESS_EXIT: '프로세스 종료',
  FILE_ACCESS: '파일 접근',
  NETWORK: '네트워크',
  OTHER: '기타',
};
export const dateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString('ko-KR', { hour12: false }) : '확인되지 않음';
export const number = (value: number) => value.toLocaleString('ko-KR');
export const sourceLabel = (source?: Source) =>
  source === 'sample'
    ? '예시 데이터 · sample'
    : source === 'live'
      ? '실제 수집 데이터 · live'
      : '실제 수집 + 예시 데이터';
export function selectionFilters(selection: Selection, now = Date.now()): PeriodFilters {
  const { period, from, to, ...optional } = selection;
  const end = period === 'custom' ? new Date(to).getTime() : now;
  const start = period === 'custom' ? new Date(from).getTime() : end - Number(period) * 60_000;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start >= end ||
    end - start > 31 * 86400_000
  ) {
    throw new Error('시작은 종료보다 빨라야 하며 조회 기간은 최대 31일입니다.');
  }
  if (
    optional.processExecId !== undefined &&
    (!optional.processExecId.trim() || optional.processExecId.length > 1024)
  )
    throw new Error('프로세스 execId는 1~1024자입니다.');
  if (
    optional.policyName !== undefined &&
    (!optional.policyName.trim() || optional.policyName.length > 100)
  )
    throw new Error('정책명은 1~100자입니다.');
  return { ...optional, from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}

export type Network = {
  sourceIp: string | null;
  sourcePort: number | null;
  destinationIp: string | null;
  destinationPort: number | null;
  protocol: string | null;
  operation: string | null;
};
export type Location = {
  countryCode: string | null;
  latitude: number;
  longitude: number;
  source: 'configured' | 'geoip';
};
export type NetworkItem = {
  instanceId: string;
  execId: string | null;
  network: Network | null;
  count: number;
  location: Location | null;
  serverLocation: Location | null;
};
export type NetworkResponse = {
  generatedAt: string;
  totalNetworkEvents: number;
  items: NetworkItem[];
  unmappedCount: number;
  truncated: boolean;
  limit: number;
};
export type Graph = {
  generatedAt: string;
  nodes: { id: string; kind: 'server' | 'process' | 'ip' | 'file'; label: string }[];
  edges: { source: string; target: string; kind: 'parent' | 'observed'; count: number }[];
  truncated: boolean;
  nodeLimit: number;
  edgeLimit: number;
};
export type ServerSummary = {
  instanceId: string;
  total: number;
  attention: number;
  byType: Dashboard['byType'];
  lastReceivedAt: string | null;
};
export type Servers = { generatedAt: string; items: ServerSummary[] };
export type ComponentState = 'enabled' | 'disabled' | 'error' | 'unknown';
export type SensorReport = {
  observedAt: string;
  collector: { state: 'ok' | 'error' | 'unknown'; errorCode: string | null };
  tetragon: {
    reachable: boolean | null;
    version: string | null;
    sensors: { name: string; state: ComponentState; error: string | null }[];
    policies: { name: string; state: ComponentState; error: string | null }[];
  };
};
export type ReadinessItem = {
  instanceId: string;
  state: 'ready' | 'warning' | 'error' | 'unknown' | 'stale';
  reason: string | null;
  observedAt: string | null;
  receivedAt: string | null;
  report: SensorReport | null;
};
export type Readiness = { generatedAt: string; staleAfterSeconds: number; items: ReadinessItem[] };
export type Replay = {
  replayId: string;
  createdAt: string;
  filters: PeriodFilters;
  timeBasis: 'occurredAt';
  events: Event[];
  total: number;
  undatedCount: number;
  eventLimit: number;
  truncated: boolean;
};
// Snapshot 허용 목록은 확장하지 않습니다. 추가 필터와 네트워크 정보는 제외합니다.
export function safeSnapshotFilters(value: Filters): Filters {
  return Object.fromEntries(
    Object.entries({
      from: value.from,
      to: value.to,
      instanceId: value.instanceId,
      eventType: value.eventType,
      status: value.status,
      source: value.source,
    }).filter(([, v]) => v !== undefined),
  ) as Filters;
}
