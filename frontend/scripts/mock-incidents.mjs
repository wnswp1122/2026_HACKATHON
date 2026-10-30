/** Independent Demo incidents. They are not correlated from the sample event stream. */
export function demoIncidents() {
  const at = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
  const event = (id, minutes, title, type, process, command, parent, filePath = null) => ({
    id, occurredAt: at(minutes), title, type, process, command, parent, filePath,
    network: null, raw: { demo: true, eventId: id, time: at(minutes), type, process, command, parent, filePath },
  });
  const base = (id, title, server, minutes, severity, status, events, analysis, checklist) => ({
    id, title, server, firstSeenAt: at(minutes), severity, status, source: 'demo',
    eventCount: events.length, events, analysis: { kind: 'demo', ...analysis },
    checklist: checklist.map((label, index) => ({ id: `step-${index + 1}`, label, done: false })),
    memo: '', history: [],
  });
  return [
    base('DEMO-001', '웹 서비스 하위 셸 실행과 민감 파일 접근', 'demo-web-01', 20, 'HIGH', 'unconfirmed', [
      event('demo-a-1', 20, 'nginx 하위에서 셸 실행', 'PROCESS_EXEC', '/bin/sh', '/bin/sh -c whoami', 'nginx'),
      event('demo-a-2', 19, '추가 명령 실행', 'PROCESS_EXEC', '/usr/bin/id', 'id', '/bin/sh'),
      event('demo-a-3', 18, '민감 설정 파일 접근', 'FILE_ACCESS', '/bin/cat', 'cat /etc/ssh/sshd_config', '/bin/sh', '/etc/ssh/sshd_config'),
    ], {
      behavior: '웹 서비스 하위 프로세스에서 셸과 추가 명령이 실행되고 설정 파일 접근이 기록됐습니다.',
      risk: '웹 서비스의 정상 요청 흐름과 다를 수 있어 실행 주체와 운영 작업 여부를 확인해야 합니다.',
      impact: '권한과 파일 변경 여부에 따라 설정 노출 또는 서비스 영향 가능성이 있습니다.',
      evidence: 'Demo 이벤트 3건: 프로세스 실행 2건, 파일 접근 1건.',
      uncertainty: 'Demo 설명입니다. 침입 성공, 파일 변경, 데이터 유출은 확인되지 않았습니다.',
    }, ['정상 관리자 또는 배포 작업 여부 확인', '셸과 자식 프로세스 실행 명령 확인', '설정 파일 변경 여부 확인', '필요하면 담당자에게 격리 검토 요청']),
    base('DEMO-002', '운영 컨테이너의 패키지 관리 프로그램 실행', 'demo-container-02', 63, 'MEDIUM', 'investigating', [
      event('demo-b-1', 63, '패키지 관리 프로그램 실행', 'PROCESS_EXEC', '/usr/bin/apt-get', 'apt-get update', '/bin/sh'),
    ], {
      behavior: '운영 컨테이너에서 패키지 관리 프로그램 실행이 기록됐습니다.',
      risk: '운영 이미지의 예상 밖 변경일 수 있어 배포 기록과 대조가 필요합니다.',
      impact: '패키지 변경이 있었다면 실행 환경 재현성과 서비스 동작에 영향을 줄 수 있습니다.',
      evidence: 'Demo 프로세스 실행 이벤트 1건.',
      uncertainty: '실제 패키지 설치·변경 완료 여부는 관찰되지 않았습니다.',
    }, ['배포·유지보수 작업 기록 대조', '컨테이너 이미지와 실행 사용자 확인', '변경된 패키지가 있는지 별도 확인']),
    base('DEMO-003', '관리자 정기 점검 명령', 'demo-admin-01', 180, 'LOW', 'benign', [
      event('demo-c-1', 180, '서비스 상태 확인', 'PROCESS_EXEC', '/usr/bin/systemctl', 'systemctl status nginx', '/bin/bash'),
    ], {
      behavior: '서비스 상태 조회 명령이 실행됐습니다.',
      risk: '관리자 점검 작업으로 분류된 Demo 사례입니다.',
      impact: '제공된 이벤트에서 서비스 변경 동작은 보이지 않습니다.',
      evidence: 'Demo 프로세스 실행 이벤트 1건과 처리 상태 기록.',
      uncertainty: '정상 작업 분류는 Demo 설정이며 실제 신원 검증 결과가 아닙니다.',
    }, ['점검 일정과 담당자 확인', '사건을 정상 작업으로 기록']),
  ];
}
