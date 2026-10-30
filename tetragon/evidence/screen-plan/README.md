# d960d3f 후속 실제 실행 증거

기준: [5개 화면 계약 고정본](https://github.com/wnswp1122/2026_HACKATHON/blob/d960d3feeed6b1693be47e1a1e7cd48c0b911dac/docs/tetragon-screen-plan.md). 모든 파일은 기존 `2026-hack-client`, Tetragon1.8.0, kernel6.8.0-142-generic에서 2026-10-31 KST 실행한 기록이다. 전체 호스트 원본은 제외하고 비밀정보 없는 자기 시연만 선택했다.

| 파일 | 내용 |
|---|---|
| events.jsonl | hack-demo의 두 별도 probe 및 비대상 binary 대조에 대한 exec/kprobe/exit 29줄. 원본 줄 값 변경 없음. HTTP 요청 로그/게시판 글/상태보고는 포함하지 않음 |
| runtime-results.json | 자기 demo 이미지 갱신, 볼륨 보존, 실제 OpenAPI/health, 정책 적용/해제, probe 성공/실패·비대상 대조·기존SIGKILL 재검증 |
| management-results.json | 실제 서버버전·health·센서목록 오류·정책 상태 조회와 안전한 환경 확인 |
| status-operations.json | 실제 정책 오류/비활성·관리 socket 도달 실패/복구·센서 중단/재시작·정책0개 실조회 명령과 결과 |
| status-policy-error.json | 좁은 가상 훅으로 실제 로드 실패한 `hack-demo-status-error`의 error 상태. 상태 보고 자체는 실측이며 합성 성공 예시가 아님 |
| status-disabled.json / status-enabled.json | 실제 네트워크 정책 disable/enable 조회 |
| status-unreachable.json | 자기 관리 socket을 잠시 다른 이름으로 옮긴 동안 실제 API 조회 실패. finally에서 복구 |
| status-sensor-stopped.json | 자기 컨테이너가 실제 중단된 상태. 게시판 health는 유지 |
| status-no-policies.json | 센서 재기동 후 정책0개. 센서목록 미지원/unknown을 유지하여 준비 정상으로 해석하지 않음 |
| periodic-first.json | 최초30초 시작 주기의 실조회3개, 완료 간격31.932519/30.186228초. 수동 측정의 임의31.5초 상한 때문에 종료됐으며 finally의 COLLECTOR_STOPPED도 보존 |
| periodic-evidence.json | 후속 실조회 완료 간격29.933174초, 완결JSON 연속 읽기2471회/오류0, 중복writer 거부, SIGTERM 최종 중단 보고/정상 종료 |
| status.json | 최종 지속 실행 수집기에서 읽어 저장한 실제 상태 한 개. 정적 증거를 현재 상태로 취급하지 않음 |
| status-write-failure.json | 자기 디렉터리를 출력 파일로 지정한 실제 writer 실패/exit1. 기본 상태 파일을 정상 보고로 갱신하지 않음 |

## 네트워크와 부정 대조

네트워크 정책은 `tcp_connect` arg0=`sock`, `hack-demo-network`, 별도 `/usr/local/bin/hack-demo-net-probe`, Mnt4026532395, IPv4 loopback8080/18080에만 Post다.

- VM PID16819: `CONNECT_OK`/0, dport8080, network1건.
- PID16860: `CONNECT_ERROR errno=111`/1, dport18080, network1건.
- 일반 Python PID17509의 같은 목적지 연결: exec/exit만. 별도 net-probe PID17540의 다른 포트18181: exec/exit만.
- network disabled PID18158, 해제 후 PID20331: exec/exit만. 실제 정책 목록·셸 결과와 함께 확인한다.
- 파일 enforce PID20930: 같은 exec_id의 `KPROBE_ACTION_SIGKILL`과 `SIGKILL` exit. 별도 net-probe PID20971은 연결 정상이며 network Post1건. 파일 observe로 복구한 PID21347은 READ_OK/0.

PID/포트는 시연 실값이며 설정으로 고정하지 않는다. 정확한 PID는 JSONL을 기준으로 하고 container PID와 VM PID를 같다고 비교하지 않는다. 파일 이벤트는 읽기 시도당2개씩 나왔으며 독립 공격 수로 세지 않는다. 두 연결 결과에서 TCP_SYN_SENT/POST가 같아 raw만으로 성공을 분류할 수 없다. `outcome=unknown`을 유지한다.

모든 상태 JSON의 루트는 observedAt/collector/tetragon이고 v1 HTTP 봉투가 아니다. `sensors=[]`/SENSOR_STATUS_UNSUPPORTED는 실제 API 미지원이며 정상0개가 아니다. 재생 시 source=sample이며 현재 live 입력으로 자동 주입하지 않는다. 새 파일이 직접 생성되는 VM의 status-follow만 live다.

## 다른 담당 증거와의 관계

같은 hack-demo에서 관찰 두 정책 적용 중 HTTP CRUD는 게시판 담당의 [f18c9f8 원본](https://github.com/wnswp1122/2026_HACKATHON/blob/f18c9f813550e75bc311ea8999a4a100d327ab1f/demo/evidence/same-target-crud.json), [PR #8](https://github.com/wnswp1122/2026_HACKATHON/pull/8)을 읽어 확인했다. 이 작업이 같은 HTTP 검증을 다시 실행한 것으로 기록하지 않았다.

전송기 담당 README의 실조회 상태→임시 수신기 검증도 확인했지만 제품 SaaS 저장 성공은 아니다. 실제 SaaS→5화면·AI 통합, 지구본 위치, 개별 센서 목록/상태, 장기 무손실 수집은 이 증거의 범위 밖이다.
