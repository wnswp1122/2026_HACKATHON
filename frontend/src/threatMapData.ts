export type ThreatSeverity = 'low' | 'medium' | 'high' | 'critical' | 'unknown';
export type ThreatType = 'network' | 'auth' | 'process' | 'file' | 'db' | 'exfil' | 'other';

export interface ThreatEvent {
  id: string;
  at: string | null;
  type: ThreatType;
  severity: ThreatSeverity;
  detail: string;
  srcIp: string | null;
  srcCountry: string | null;
  srcIso: string | null;
  srcCity: string | null;
  srcLat: number | null;
  srcLng: number | null;
  dstHost: string | null;
  dstLat: number | null;
  dstLng: number | null;
  chain: number | null;
  origin: 'demo' | 'stream';
}

type Source = { ip: string; city: string; country: string; iso: string; lat: number; lng: number };
const sources: Source[] = [
  { ip: '185.220.101.4', city: 'Moscow', country: '러시아', iso: 'RU', lat: 55.75, lng: 37.62 },
  { ip: '45.137.21.9', city: 'Amsterdam', country: '네덜란드', iso: 'NL', lat: 52.37, lng: 4.9 },
  { ip: '103.45.12.8', city: 'Shanghai', country: '중국', iso: 'CN', lat: 31.23, lng: 121.47 },
  { ip: '177.54.9.33', city: 'São Paulo', country: '브라질', iso: 'BR', lat: -23.55, lng: -46.63 },
  { ip: '41.203.7.21', city: 'Lagos', country: '나이지리아', iso: 'NG', lat: 6.52, lng: 3.38 },
  { ip: '67.205.3.10', city: 'New York', country: '미국', iso: 'US', lat: 40.71, lng: -74.01 },
];
const destination = { lat: 37.57, lng: 126.98 };
type Template = { source: number; host: string; type: ThreatType; severity: ThreatSeverity; detail: string; chain?: number };
const noise: Template[] = [
  { source: 1, host: 'web-01', type: 'network', severity: 'low', detail: '포트 스캔 22/tcp' },
  { source: 2, host: 'web-02', type: 'auth', severity: 'medium', detail: 'SSH 로그인 실패 user=admin' },
  { source: 3, host: 'api-01', type: 'network', severity: 'low', detail: 'HTTP 취약점 스캔 GET /.env' },
  { source: 4, host: 'web-01', type: 'auth', severity: 'medium', detail: '인증 없는 API 호출 GET /api/users' },
  { source: 5, host: 'web-02', type: 'network', severity: 'low', detail: '포트 스캔 5432/tcp' },
];
const chain: Template[] = [
  { source: 0, host: 'db-prod-01', type: 'auth', severity: 'medium', detail: 'SSH 무차별 대입 2,341회', chain: 1 },
  { source: 0, host: 'db-prod-01', type: 'auth', severity: 'high', detail: '처음 보는 IP에서 SSH 로그인 성공 user=svc-backup', chain: 2 },
  { source: 0, host: 'db-prod-01', type: 'process', severity: 'high', detail: '평소 없던 프로세스 실행 bash → pg_dump', chain: 3 },
  { source: 0, host: 'db-prod-01', type: 'file', severity: 'high', detail: '/etc/shadow 읽기 시도', chain: 3 },
  { source: 0, host: 'db-prod-01', type: 'db', severity: 'critical', detail: 'customers 테이블 340,512행 SELECT', chain: 4 },
  { source: 0, host: 'db-prod-01', type: 'exfil', severity: 'critical', detail: '외부로 2.3GB 전송 → 45.137.21.9:443', chain: 5 },
];
const demoSequence = [...noise, ...chain, ...noise.slice(1, 4)];

export function demoThreatEvent(index: number, at = new Date()): ThreatEvent {
  const template = demoSequence[index % demoSequence.length];
  const source = sources[template.source];
  return {
    id: `demo-${index}`, at: at.toISOString(), type: template.type, severity: template.severity,
    detail: template.detail, srcIp: source.ip, srcCountry: source.country, srcIso: source.iso, srcCity: source.city,
    srcLat: source.lat, srcLng: source.lng, dstHost: template.host, dstLat: destination.lat, dstLng: destination.lng,
    chain: template.chain ?? null, origin: 'demo',
  };
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value.slice(0, 400) : null;
const coordinate = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max ? value : null;
const eventTypes: ThreatType[] = ['network', 'auth', 'process', 'file', 'db', 'exfil', 'other'];
const severities: ThreatSeverity[] = ['low', 'medium', 'high', 'critical', 'unknown'];

export function normalizeThreatEvent(value: unknown): ThreatEvent | null {
  const item = record(value);
  if (!Object.keys(item).length) return null;
  const type = text(item.type);
  const severity = text(item.severity);
  const epoch = typeof item.t === 'number' && Number.isFinite(item.t) ? item.t * 1000 : NaN;
  const at = Number.isFinite(epoch) && !Number.isNaN(new Date(epoch).getTime()) ? new Date(epoch).toISOString() : text(item.occurredAt);
  return {
    id: text(item.id) || `${at || 'unknown'}-${type || 'other'}`,
    at: at && !Number.isNaN(Date.parse(at)) ? at : null,
    type: eventTypes.includes(type as ThreatType) ? type as ThreatType : 'other',
    severity: severities.includes(severity as ThreatSeverity) ? severity as ThreatSeverity : 'unknown',
    detail: text(item.detail) || '상세 정보가 제공되지 않았습니다.',
    srcIp: text(item.src_ip), srcCountry: text(item.src_country), srcIso: text(item.src_iso), srcCity: text(item.src_city),
    srcLat: coordinate(item.src_lat, 90), srcLng: coordinate(item.src_lng, 180),
    dstHost: text(item.dst_host), dstLat: coordinate(item.dst_lat, 90), dstLng: coordinate(item.dst_lng, 180),
    chain: typeof item.chain === 'number' && Number.isInteger(item.chain) && item.chain >= 1 && item.chain <= 5 ? item.chain : null,
    origin: 'stream',
  };
}

export function hasGeo(event: ThreatEvent): boolean {
  return event.srcLat !== null && event.srcLng !== null && event.dstLat !== null && event.dstLng !== null;
}

export const threatTypeLabels: Record<ThreatType, string> = {
  network: '네트워크', auth: '인증', process: '프로세스', file: '파일', db: 'DB', exfil: '외부 유출', other: '기타',
};
export const threatSeverityLabels: Record<ThreatSeverity, string> = {
  low: '낮음', medium: '중간', high: '높음', critical: '치명', unknown: '미제공',
};
