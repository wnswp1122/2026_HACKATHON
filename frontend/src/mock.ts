import type { Analysis, Incident, IncidentStatus, Overview, SecurityEvent, TrendPoint } from './model';

const demoAnchor = (() => {
  try {
    const saved = Number(localStorage.getItem('security-story-demo-anchor-v1'));
    if (saved > 0 && Number.isFinite(saved)) return saved;
    const now = Date.now();
    localStorage.setItem('security-story-demo-anchor-v1', String(now));
    return now;
  } catch { return Date.now(); }
})();
const ago = (minutes: number) => new Date(demoAnchor - minutes * 60_000).toISOString();
const guide = ['정상 관리자 작업 여부 확인', '의심 프로세스와 실행 명령 확인', '민감 파일 변경 여부 확인', '필요 시 담당자에게 서버 격리 요청'];
const event = (id: string, incidentId: string, minutes: number, server: string, type: string, title: string, process: string | null, command: string | null, parent: string | null, target: string | null): SecurityEvent => ({
  id, incidentId, occurredAt: ago(minutes), server, type, title, process, command, parent, target, ip: null, port: null,
  rawEvent: { time: ago(minutes), node_name: server, [type]: { process: process ? { binary: process, arguments: command } : null, parent: parent ? { binary: parent } : null, path: target } },
});

const webEvents = [
  event('EVT-241-1', 'INC-0241', 29, 'shop-web-01', 'process_exec', '웹 서비스 하위에서 셸 실행', '/bin/sh', '/bin/sh -c whoami', '/usr/sbin/nginx', null),
  event('EVT-241-2', 'INC-0241', 28, 'shop-web-01', 'process_exec', '추가 명령어 실행', '/usr/bin/id', 'id', '/bin/sh', null),
  event('EVT-241-3', 'INC-0241', 27, 'shop-web-01', 'file_open', '민감 설정 파일 접근', '/usr/bin/cat', 'cat /etc/shadow', '/bin/sh', '/etc/shadow'),
  event('EVT-241-4', 'INC-0241', 25, 'shop-web-01', 'process_exec', '설정 확인 명령 실행', '/usr/bin/grep', 'grep PermitRootLogin /etc/ssh/sshd_config', '/bin/sh', '/etc/ssh/sshd_config'),
];
const webAnalysis: Analysis = {
  behavior: '웹 서버 프로세스 아래에서 셸과 추가 명령어가 실행되고 민감 설정 파일 접근 이벤트가 이어졌습니다.',
  risk: '일반적인 웹 서비스 동작에서는 보기 드문 흐름입니다. 무단 실행 가능성을 확인해야 합니다.',
  impact: '설정 정보 노출 가능성이 있으나 파일 내용 열람이나 외부 전송은 확인되지 않았습니다.',
  evidence: 'Tetragon process_exec 3건과 file_open 1건이 같은 서버에서 짧은 시간 안에 관찰됐습니다.',
  uncertainty: '실행 주체와 관리자 승인 여부는 확인되지 않았습니다. 침해 여부는 추가 조사가 필요합니다.',
  analyzedAt: ago(20),
};

const initial: Incident[] = [
  { id: 'INC-0241', title: '웹 서버에서 예상 밖 셸 실행', server: 'shop-web-01', firstSeenAt: webEvents[0].occurredAt, severity: 'HIGH', status: 'unconfirmed', source: 'demo', events: webEvents, analysis: webAnalysis, guide, checklist: [false, false, false, false], memo: '', activity: [{ at: ago(29), text: '시연용 사고 생성' }] },
  { id: 'INC-0239', title: '민감 설정 파일 접근', server: 'shop-db-01', firstSeenAt: ago(58), severity: 'HIGH', status: 'unconfirmed', source: 'demo', events: [event('EVT-239-1', 'INC-0239', 58, 'shop-db-01', 'file_open', '민감 설정 파일 접근', '/usr/bin/cat', 'cat /etc/ssh/sshd_config', '/bin/bash', '/etc/ssh/sshd_config')], analysis: { behavior: '민감 설정 파일 접근 이벤트가 관찰됐습니다.', risk: '권한과 작업 목적을 확인할 필요가 있습니다.', impact: '파일 내용 사용이나 변경은 확인되지 않았습니다.', evidence: 'Tetragon file_open 이벤트 1건.', uncertainty: '관리자 작업 여부는 확인되지 않았습니다.' }, guide, checklist: [false, false, false, false], memo: '', activity: [] },
  { id: 'INC-0236', title: '컨테이너 패키지 관리자 실행', server: 'api-01', firstSeenAt: ago(91), severity: 'MEDIUM', status: 'investigating', source: 'demo', events: [event('EVT-236-1', 'INC-0236', 91, 'api-01', 'process_exec', '컨테이너에서 패키지 관리자 실행', '/usr/bin/apt-get', 'apt-get update', '/bin/sh', null)], analysis: { behavior: '운영 컨테이너에서 패키지 관리 프로그램이 실행됐습니다.', risk: '예상하지 않은 운영 환경 변경이 시작됐을 수 있습니다.', impact: '실제 패키지 변경 완료 여부는 확인되지 않았습니다.', evidence: 'Tetragon process_exec 이벤트 1건.', uncertainty: '배포 작업과의 관련성 확인이 필요합니다.' }, guide: ['예정된 배포·운영 작업인지 확인', '실행 계정과 컨테이너 이미지 확인', '패키지 변경 이력 확인', '필요 시 담당자에게 격리 요청'], checklist: [false, false, false, false], memo: '', activity: [{ at: ago(85), text: '상태를 조사 중으로 변경' }] },
  { id: 'INC-0233', title: 'SSH 접속 설정 확인', server: 'shop-web-01', firstSeenAt: ago(130), severity: 'MEDIUM', status: 'resolved', source: 'demo', events: [event('EVT-233-1', 'INC-0233', 130, 'shop-web-01', 'process_exec', 'SSH 설정 확인 명령', '/usr/bin/grep', 'grep AuthorizedKeysFile /etc/ssh/sshd_config', '/bin/bash', '/etc/ssh/sshd_config')], analysis: null, guide, checklist: [true, true, true, false], memo: '담당자 확인 완료', activity: [{ at: ago(112), text: '상태를 조치 완료로 변경' }] },
  { id: 'INC-0228', title: '운영자 정기 점검', server: 'shop-admin-01', firstSeenAt: ago(180), severity: 'LOW', status: 'benign', source: 'demo', events: [event('EVT-228-1', 'INC-0228', 180, 'shop-admin-01', 'process_exec', '시스템 점검 명령 실행', '/usr/bin/systemctl', 'systemctl status nginx', '/bin/bash', null)], analysis: { behavior: '시스템 상태 확인 명령이 실행됐습니다.', risk: '관리자가 정상 점검 작업으로 분류했습니다.', impact: '확인된 보안 영향은 없습니다.', evidence: 'Tetragon process_exec 이벤트 1건과 관리자의 분류 기록.', uncertainty: '이 분류는 관리자 기록을 따릅니다.' }, guide, checklist: [true, true, false, false], memo: '정기 점검 작업 확인', activity: [{ at: ago(165), text: '정상 작업 / 오탐으로 분류' }] },
];

const storageKey = 'security-story-demo-v1';
type DemoEdits = Record<string, Pick<Incident, 'status' | 'checklist' | 'memo' | 'activity'>>;
function readEdits(): DemoEdits {
  try { return JSON.parse(localStorage.getItem(storageKey) || '{}') as DemoEdits; } catch { return {}; }
}
export function demoIncidents(): Incident[] {
  const edits = readEdits();
  return initial.map(item => ({ ...item, ...(edits[item.id] || {}), events: item.events.map(x => ({ ...x })) }));
}
export function updateDemoIncident(id: string, changes: Partial<Pick<Incident, 'status' | 'checklist' | 'memo'>>): Incident {
  const current = demoIncidents().find(x => x.id === id);
  if (!current) throw new Error('사고를 찾을 수 없습니다.');
  const next = { ...current, ...changes, activity: [...current.activity] };
  if (changes.status && changes.status !== current.status) next.activity.unshift({ at: new Date().toISOString(), text: `상태를 ${statusText(changes.status)}(으)로 변경` });
  if (changes.memo !== undefined && changes.memo !== current.memo) next.activity.unshift({ at: new Date().toISOString(), text: '관리자 메모 저장' });
  if (changes.checklist && changes.checklist.some((v, i) => v !== current.checklist[i])) next.activity.unshift({ at: new Date().toISOString(), text: '대응 체크리스트 변경' });
  const edits = readEdits();
  edits[id] = { status: next.status, checklist: next.checklist, memo: next.memo, activity: next.activity };
  localStorage.setItem(storageKey, JSON.stringify(edits));
  return next;
}
function statusText(status: IncidentStatus) { return { unconfirmed: '미확인', investigating: '조사 중', resolved: '조치 완료', benign: '정상 작업 / 오탐', unknown: '상태 미제공' }[status]; }
export function demoAnalysis(id: string): Analysis {
  const item = demoIncidents().find(x => x.id === id);
  if (!item?.analysis) throw new Error('이 사고의 시연용 AI 분석이 없습니다.');
  return { ...item.analysis, analyzedAt: new Date().toISOString() };
}

const trend: TrendPoint[] = Array.from({ length: 28 }, (_, i) => ({ time: `${String(Math.floor(i * 5 / 60)).padStart(2, '0')}:${String(i * 5 % 60).padStart(2, '0')}`, process: [3, 4, 5, 4, 6, 5, 4][i % 7] + (i > 16 && i < 23 ? 5 : 0), file: 1 + i % 4 + (i > 17 && i < 22 ? 2 : 0), network: i % 3 === 0 ? 1 : 0, high: i > 16 && i < 23 ? 1 : 0 }));
export function demoOverview(): Overview {
  const incidents = demoIncidents();
  return { monitoredServers: 6, collectorStatus: 'unknown', collectorLabel: '시연용 수집 상태', todayEvents: trend.reduce((sum, x) => sum + x.process + x.file + x.network + x.high, 0), trend,
    serverRisk: [{ server: 'shop-web-01', score: 91 }, { server: 'shop-db-01', score: 65 }, { server: 'api-01', score: 48 }, { server: 'shop-admin-01', score: 32 }, { server: 'worker-01', score: 19 }, { server: 'batch-01', score: 8 }],
    severityDistribution: [
      { severity: 'CRITICAL', count: incidents.filter(x => x.severity === 'CRITICAL').length },
      { severity: 'HIGH', count: incidents.filter(x => x.severity === 'HIGH').length },
      { severity: 'MEDIUM', count: incidents.filter(x => x.severity === 'MEDIUM').length },
      { severity: 'LOW', count: incidents.filter(x => x.severity === 'LOW').length },
    ],
  };
}
