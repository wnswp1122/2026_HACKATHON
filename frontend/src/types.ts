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
export type Selection = Omit<Filters, 'from' | 'to'> & { period: string; from: string; to: string };
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
  };
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
    ? 'sample · 예시/재생'
    : source === 'live'
      ? 'live · 현재 수집'
      : 'live + sample';
export function selectionFilters(selection: Selection, now = Date.now()): Filters {
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
  return { ...optional, from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}
