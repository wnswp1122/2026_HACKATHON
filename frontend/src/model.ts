export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type IncidentStatus = 'unconfirmed' | 'investigating' | 'resolved' | 'benign' | 'unknown';
export type Source = 'demo' | 'live' | 'sample' | 'unknown';

export interface SecurityEvent {
  id: string;
  incidentId: string;
  occurredAt: string | null;
  server: string;
  type: string;
  title: string;
  process: string | null;
  command: string | null;
  parent: string | null;
  target: string | null;
  ip: string | null;
  port: number | null;
  rawEvent: Record<string, unknown> | null;
}

export interface Analysis {
  behavior: string;
  risk: string;
  impact: string;
  evidence: string;
  uncertainty: string;
  analyzedAt?: string | null;
}

export interface Activity {
  at: string;
  text: string;
}

export interface Incident {
  id: string;
  title: string;
  server: string;
  firstSeenAt: string | null;
  severity: Severity;
  status: IncidentStatus;
  source: Source;
  events: SecurityEvent[];
  analysis: Analysis | null;
  guide: string[];
  checklist: boolean[];
  memo: string;
  activity: Activity[];
}

export interface TrendPoint { time: string; process: number; file: number; network: number; high: number }
export interface Overview {
  monitoredServers: number | null;
  collectorStatus: 'healthy' | 'degraded' | 'unknown';
  collectorLabel: string | null;
  todayEvents: number | null;
  trend: TrendPoint[];
  serverRisk: { server: string; score: number }[];
  severityDistribution: { severity: Severity; count: number }[];
}

export const statusLabels: Record<IncidentStatus, string> = {
  unconfirmed: '미확인', investigating: '조사 중', resolved: '조치 완료', benign: '정상 작업 / 오탐', unknown: '상태 미제공',
};
export const severityLabels: Record<Severity, string> = {
  CRITICAL: '치명', HIGH: '높음', MEDIUM: '중간', LOW: '낮음', UNKNOWN: '위험도 미제공',
};
export const statuses: IncidentStatus[] = ['unconfirmed', 'investigating', 'resolved', 'benign'];
export const severities: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
