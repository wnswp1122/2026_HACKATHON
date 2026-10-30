# Tetragon 기반 5개 화면 구현 계획

제품 소개는 **AI 기반 서버 보안 모니터링·분석 플랫폼**으로 통일한다. LiteSOC는 기존 시각 브랜드로 유지한다. 이 문서는 기존 기능을 바탕으로 추가할 계약과 Orca 작업 지시이며, 아래 기능이 이미 구현·통합됐다는 뜻이 아니다.

## 사용자 확인과 화면 기준

- 원본 Figma 5개 화면을 수정하지 않는다. 같은 페이지의 기존 작업물 아래에 별도 Tetragon용 5개 화면을 추가한다.
- Figma 연결의 읽기 전용 제약으로 브라우저의 Computer Use를 이용해 같은 페이지 아래에 Tetragon용 복제본 5개를 추가했다. 각 화면은 1440×1024이며 첫 행 y=4000, 둘째 행 y=5124에 배치했다. 원본 5개의 이름·위치·크기·텍스트가 변경 전과 같은지 재조회했고 기존 하단 A/B/C/D도 남아 있다. 디자인 추가와 실제 기능 구현·통합 완료는 구분한다.
- 원본의 크기·색상·타이포그래피·사이드바·카드 배치·차트 영역을 유지하고, 데이터·설명·메뉴명·동작을 수집 가능한 범위로 바꾼다.
- [원본 페이지](https://www.figma.com/design/f0DLL11tJXk2Z4pccjd8ki/팀f?node-id=115-2)의 01 보안 개요, 02 공격 리플레이, 03 사전 점검, 04 텔레메트리 탐색기, 05 엔드포인트 대시보드를 각각 아래 기능에 대응한다. 원본 제목은 위치 식별용이며 새 제품의 기능 주장으로 재사용하지 않는다.

| 새 화면 | 유지하는 형식 | 구현할 데이터·동작 | 표시하지 않는 주장 |
|---|---|---|---|
| 보안 개요 · 연결 지구본 | 지구본·상단 지표·추세·최근 이벤트 | 확인된 네트워크 IP와 설정 위치, 수집 이벤트·정책 일치 건수, 위치 미확인 IP 목록 | 공격자 위치, 침입·유출 확정, 이벤트 수를 접속 성공 건수로 해석 |
| 관찰 활동 리플레이 | 단계 카드·재생바·레인별 타임라인·AI 패널 | 프로세스 실행/파일 접근/네트워크/종료를 발생 시각순 재생, 원본 상세 연결 | 로그인·계정 탈취·DB 조회·전송량·인과관계 추정 |
| 수집·정책 준비 점검 | 요약 카드·점검표·하단 두 목록 | Tetragon 조회 가능 여부, 센서 상태, 정책 로드/오류, 상태 수신 시각 | 취약 패키지·API 인증·SSH 설정 검사, 보안 점수 |
| 텔레메트리 탐색기 | 시계열·시간 선택·필터·서버별 표·분석 패널 | 이벤트 건수/분, 실행·파일·네트워크 유형, 서버·프로세스·정책 필터 | 검증하지 않은 MB/s·로그인 실패·기준선 이상 탐지 |
| 서버 보안 대시보드 | 지표 카드·서버 분포·여러 차트 | 서버별 관찰/정책 일치 수, 이벤트 유형 분포, 프로세스 트리·통신 관계 | 보호율·격리 성공·위험 점수·정상 서버 판정 |

프론트 탐색 경로는 `/overview`, `/replay`, `/readiness`, `/telemetry`, `/servers`의 5개다. Vite에서 새로고침·직접 URL 접근을 확인하고 기존 hash 진입점은 해당 경로로 안내한다.

공통으로 live/sample, 집계 시간 기준, 마지막 성공 시각, 미수집/미확인/오래된 상태를 구분한다. 디자인에 넣은 예시 수치에는 sample임을 표시하며 제품의 실제 기본값으로 넣지 않는다. 그래프는 독립 여섯 번째 화면이 아니라 대시보드·리플레이·탐색기의 구성 요소다.

### 추가한 Figma 화면

| 화면 | 구현 참조 |
|---|---|
| T01 보안 개요·연결 지구본 | [387:2](https://www.figma.com/design/f0DLL11tJXk2Z4pccjd8ki/팀f?node-id=387-2) |
| T02 관찰 활동 리플레이 | [387:215](https://www.figma.com/design/f0DLL11tJXk2Z4pccjd8ki/팀f?node-id=387-215) |
| T03 수집·정책 준비 점검 | [387:462](https://www.figma.com/design/f0DLL11tJXk2Z4pccjd8ki/팀f?node-id=387-462) |
| T04 텔레메트리 탐색기 | [387:777](https://www.figma.com/design/f0DLL11tJXk2Z4pccjd8ki/팀f?node-id=387-777) |
| T05 서버 보안 대시보드 | [387:1158](https://www.figma.com/design/f0DLL11tJXk2Z4pccjd8ki/팀f?node-id=387-1158) |

디자인의 공통 셸을 유지하되 구현 범위는 이 문서의 계약을 따른다. 원본 이벤트 메뉴는 텔레메트리 상세로 연결하며 별도 여섯 번째 화면을 추가하지 않는다. 공유·저장된 뷰·위젯 편집 등 계약에 없는 조작은 예정 또는 비활성 상태로 표시한다. 필터는 서버·유형·프로세스·정책·출처이며 env/team/os/group을 임의로 지원하지 않는다. AI 패널은 아래 안전 입력 경계를 따르며 IP·경로·프로세스 연결 키·센서 상태를 분석했다고 표시하지 않는다.

## 현재 코드로 가능한 범위

별도 워크트리의 소스와 담당 README를 확인한 정적 판정이다. 각 담당의 과거 실행 기록을 이번 통합 실행 결과로 바꾸어 표현하지 않는다.

| 작업 | 확인한 구현 | 이번에 필요한 보완 |
|---|---|---|
| demo-board | FastAPI·SQLite 게시판 CRUD, 입력 검증·health | 기존 CRUD 유지, 안전한 시연 순서와 관찰 대상 연결 확인 |
| tetragon-runtime | exec/exit, 고정 파일 읽기 훅, 좁은 probe SIGKILL, 정책 조회 도구 | 네트워크 정책·실제 필드 매핑, 주기적 상태 JSON 생성 |
| event-forwarder | JSONL follow/replay, 인증·ACK 검증·제한 재시도 | 이벤트와 독립된 상태 전송 모드 |
| saas-core | PostgreSQL 수신·중복 제거, exec/exit 정규화 | 현재 kprobe는 OTHER, target은 null. 파일/네트워크 매핑·부모 execId·상태 저장 추가 |
| dashboard-data | receivedAt 기준 조회·집계, 안전 요약 스냅샷 | 네트워크/관계 그래프·고정 리플레이·서버별 집계·준비 상태 조회 |
| ai-analysis | 고정 payload+PNG, 엄격 allowlist, 지침·분석 저장 | 관찰 한계에 맞는 지침과 화면 문구. 입력 계약은 유지 |
| dashboard-frontend | App 한 화면의 개요·이벤트·스냅샷/AI, Figma 스타일 | 실제 5개 화면 탐색과 신규 API 연결. 현재 hash는 5개 독립 화면 구현이 아님 |

기존 FastAPI 모듈 구조·PostgreSQL JSONB·React/Vite로 확장할 수 있다. 프레임워크 교체나 별도 서비스 분리는 필요 없다. 다만 현재 코드 그대로 지구본·리플레이·준비 점검을 완성했다고 볼 수 없으며, 아래 계약 구현과 실제 수집 통합이 선행한다.

## 기존 계약을 유지하는 확장

### 이벤트 정규화

[수신 v1](api-contract.md)의 POST /api/events 봉투·인증·ACK·중복 규칙은 변경하지 않는다. 원본은 기존 rawEvent에 넣는다. 아래는 SaaS가 만드는 공개 Event의 추가 nullable 필드다. 기존 저장 행에 필드가 없으면 조회 시 null로 채우며 과거 데이터를 추측해 보정하지 않는다.

| 필드 | 형식·의미 |
|---|---|
| process.parentExecId | string 또는 null. 실제 parent.exec_id 근거. 트리 키는 instanceId+execId, PID나 binary만으로 프로세스를 합치지 않음 |
| file | `{path:string,operation:string|null}` 또는 null. 검증한 파일 훅 인자만 매핑 |
| network | `{sourceIp:string|null,sourcePort:number|null,destinationIp:string|null,destinationPort:number|null,protocol:string|null,operation:string|null}` 또는 null |

포트는 0~65535 정수, IP는 유효한 IPv4/IPv6만 허용한다. 정책명·훅·인자 위치와 자료형을 함께 확인한 매핑만 FILE_ACCESS/NETWORK로 분류한다. 실제 관찰 근거가 없는 필드는 null, 모르는 구조는 OTHER다. 네트워크 연결 훅은 연결 성공이나 데이터 전송의 증거가 아니며 operation에는 확인한 connect/accept 등의 의미만 담는다. target은 확인된 file/network의 표시용 요약으로 유지하고 파싱 원천으로 사용하지 않는다. reportedAction과 outcome은 분리하며 outcome=unknown을 유지한다.

Tetragon 담당은 버전·커널·정책명·훅·원본 필드 경로·타입·예시·미관찰 조건을 `tetragon/`에 기록한다. core는 그 증거를 받은 후 매핑을 활성화한다. 네트워크가 아직 실측되지 않았다면 sample 분기 검증과 live 미지원 상태를 구분한다.

### 수집·정책 상태 전송

일반 보안 이벤트와 별도 `POST /api/sensor-status`를 추가한다. 인증 토큰과 instanceId 허용 목록은 이벤트 수신과 동일하다. 상태 확인은 Tetragon의 실제 관리 API/CLI 결과에 근거하며 게시판 health나 이벤트 유무로 대체하지 않는다.

```json
{
  "schemaVersion": "1",
  "messageId": "7f9559cc-6aa5-4d80-a08f-6c26ad72959f",
  "instanceId": "board-server-01",
  "source": "sample",
  "observedAt": "2026-10-31T03:30:12Z",
  "collector": {"state": "ok", "errorCode": null},
  "tetragon": {
    "reachable": true,
    "version": "1.8.0",
    "sensors": [{"name": "example-sensor", "state": "unknown", "error": null}],
    "policies": [{"name": "example-policy", "state": "enabled", "error": null}]
  }
}
```

이 JSON은 형태를 설명하는 sample이다. collector.state는 `ok/error/unknown`, reachable은 bool/null, version은 string/null, sensors/policies의 state는 `enabled/disabled/error/unknown`, error는 안전한 요약 string/null이다. 조회 자체가 실패하면 목록을 빈 배열로 둘 수 있으나 정상 정책 0개로 해석하지 않는다. status 원본 전체·토큰·환경변수는 보내지 않는다. 이름은 100자, error/errorCode는 300자 이하, sensors 최대 100개·policies 최대 200개다. 수집 대상이 한도를 넘으면 collector.state=error, errorCode=STATUS_LIMIT_EXCEEDED로 명시한다.

- Tetragon 담당이 30초마다 새 observedAt을 가진 상태 파일을 임시 파일→원자적 교체로 기록한다. 30초는 MVP 운영 선택이며 Tetragon의 보장값이 아니다.
- 전송기는 별도 `--status-follow PATH`로 새 상태만 전송한다. 이벤트 follow를 막지 않는다. `STATUS_URL`은 별도 설정하며 URL을 임의 조합하지 않는다. observedAt을 전송 시각으로 덮어쓰지 않는다. 파일 읽기 실패는 진단하고 마지막 정상 상태를 새 상태처럼 재전송하지 않는다.
- 상태 내용은 instanceId/source를 제외한 observedAt/collector/tetragon 객체이며, 전송기가 v1 봉투와 messageId를 붙인다. live 모드는 새 파일 관찰, sample 모드는 `--status-replay PATH`로 한 번 읽어 검증한다. 두 상태 모드는 이벤트 follow/replay와 상호 배타적 CLI 모드다.
- 성공 ACK는 `{reportId,messageId,duplicate}`. DB 저장 후 신규 201, 같은 ID·내용 200, 같은 ID·다른 내용 409. 인증·제한 재시도·불명확한 ACK 처리는 기존 이벤트와 같다.
- core가 `sensor_reports(report_id uuid PRIMARY KEY, instance_id text NOT NULL, message_id uuid NOT NULL, source text NOT NULL, observed_at timestamptz NOT NULL, received_at timestamptz NOT NULL, payload jsonb NOT NULL, UNIQUE(instance_id,message_id))`와 `(instance_id,source,observed_at DESC,received_at DESC)` 인덱스를 관리한다. source 제약은 live/sample이다.
- sensor_reports는 events에 넣지 않으며 instances.last_received_at도 갱신하지 않는다. 상태만 보내는 허용 인스턴스도 저장할 수 있어야 한다. 상태 중복 ACK가 신선도를 갱신해서는 안 된다.
- 화면 조회 시 SaaS 시각 기준 receivedAt 또는 observedAt이 90초보다 오래됐으면 stale로 표시한다. 90초는 30초 보고의 3회 누락 기준이다. observedAt이 서버보다 30초 이상 미래면 unknown과 CLOCK_SKEW 사유를 표시한다. 오래된 보고가 나중에 도착해 새 observedAt 보고를 덮지 않는다.

### 화면 조회 API

공통 필터와 오류 형식은 [기존 SaaS 계약](saas-parallel-development.md)을 따른다. GET /api/events, /api/dashboard와 아래 기간 기반 신규 조회·replay 입력에는 선택적 `processExecId`·`policyName`의 정확 일치 필터를 추가한다(비어 있지 않은 문자열, 각각 최대 1024/100자). 기존 요청은 계속 허용한다. Snapshot 입력에는 이 두 필드를 추가하지 않으며 분석 진입 시 기간·instanceId·source 등 기존 허용 필터만 전달하고 제외된 필터를 안내한다. 새 API도 최대 31일, 서버 필터를 적용한다. 아래 범위·한도는 MVP 선택이며 응답에 생략 여부를 표시한다. 필드 이름을 담당자가 개별 변경하지 않는다.

| API | 입력 | 응답·책임 |
|---|---|---|
| GET /api/network | 기존 공통 필터 | `{generatedAt,totalNetworkEvents,items,unmappedCount,truncated,limit:200}`. items는 관찰 연결별 `{instanceId,execId,network,count,location,serverLocation}`. count 내림차순 후 결정적 키 순으로 최대 200개. unmappedCount는 전체 범위에서 위치 없는 네트워크 이벤트 수 |
| GET /api/graph | 기존 공통 필터 | `{generatedAt,nodes,edges,truncated,nodeLimit:200,edgeLimit:500}`. 노드는 `{id,kind,label}`(server/process/ip/file), 간선은 `{source,target,kind,count}`(parent/observed). 둘 다 결정적 ID 순으로 제한, 존재하지 않는 노드를 가리키는 간선 제외 |
| GET /api/servers | 기존 공통 필터 | `{generatedAt,items}`. items는 `{instanceId,total,attention,byType,lastReceivedAt}`. 전체 필터 범위 집계, instanceId 오름차순. health 판정은 포함하지 않음 |
| GET /api/readiness | instanceId 선택, source 필수 live/sample | `{generatedAt,staleAfterSeconds:90,items}`. items는 `{instanceId,state,reason,observedAt,receivedAt,report}`. state는 ready/warning/error/unknown/stale, report는 저장된 상태 payload 또는 null |
| POST /api/replays | 기존 공통 필터 객체 | 201, 아래 고정 Replay. 저장 직전 동일 읽기 트랜잭션의 이벤트 집합을 고정 |
| GET /api/replays/{replayId} | UUID | 저장한 Replay 그대로, 없으면 404 |

readiness는 허용 인스턴스 목록을 기준으로 보고가 전혀 없는 대상도 unknown으로 반환한다. source별 마지막 observedAt 보고를 선택하고 같은 시각은 receivedAt/reportId로 정렬한다. stale/시계 오류 판정을 먼저 적용하고, 신선한 보고에서 collector 오류·reachable=false·센서/정책 error는 error, 조회 성공이 확인되지 않거나 상태 unknown은 unknown, disabled는 warning, 나머지 확인 가능한 항목이 모두 enabled면 ready다. 빈 센서 목록은 unknown이며 정책 0개는 warning(POLICY_NOT_CONFIGURED)이다. ready는 수집 준비 상태로만 표현하고 서버 보안 정상으로 표현하지 않는다. GET은 Tetragon에 원격 명령을 내리지 않으며 ‘새로고침’은 저장된 최신 보고 조회다.

network의 location은 `{countryCode:string|null,latitude:number,longitude:number,source:"configured"|"geoip"}` 또는 null이다. destinationIp가 있으면 그 IP, 없으면 sourceIp를 대상 위치로 사용하고 어떤 IP인지 화면에 표시한다. 기본 구현은 SaaS의 명시적 IP→좌표 설정 파일을 사용한다. serverLocation도 같은 위치 객체 또는 null이며 별도 인스턴스→위치 명시 설정만 사용한다. 임의 좌표·공격자 국가 추측·사설 IP의 공인 GeoIP 조회는 금지한다. 공개 GeoIP 서비스 자동 호출·키 등록은 이번 구현에 포함하지 않는다. GeoIP 어댑터는 선택 후속이며 공급자·라이선스·DB 갱신이 정해질 때 추가한다. 설정되지 않은 IP는 지구본 밖 목록에서 확인한다.

Replay는 `{replayId,createdAt,filters,timeBasis:"occurredAt",events,total,undatedCount,eventLimit:2000,truncated}`다. 대상 집합은 기존과 동일하게 receivedAt `[from,to)`로 선택하되, 재생할 이벤트는 occurredAt이 있는 것만 `(occurredAt,eventId)` 오름차순으로 최대 2,000건 저장한다. total은 선택 집합 전체 수, undatedCount는 occurredAt 없는 수다. truncated는 날짜 있는 이벤트가 2,000건을 초과할 때 true다. 날짜 없는 이벤트는 재생에서 제외한 개수와 원본 목록 이동을 제공한다. 수신 시각과 발생 시각 차이를 인과관계로 해석하지 않는다.

Replay.events는 공개 Event 배열이며 원본 전체를 넣지 않는다. core가 `replays(replay_id uuid PRIMARY KEY, created_at timestamptz NOT NULL, payload jsonb NOT NULL)`를 추가하고 data가 REPEATABLE READ에서 읽기→payload 저장을 수행한다. 새 이벤트가 들어와도 기존 Replay는 달라지지 않는다. 재생 중 2초 폴링으로 내용을 바꾸지 않는다. UI는 재생/일시정지/배속/구간 이동과 eventId로 상세 조회를 제공한다.

프로세스 트리는 확인한 parentExecId만 연결한다. 부모 이벤트 누락은 미관찰 부모 노드로 표시하고 같은 PID 재사용·동일 binary를 연결 근거로 사용하지 않는다. 하나의 이벤트에서 여러 간선이 생길 수 있으므로 간선 수를 전체 이벤트 수로 표시하지 않는다. 상한에 걸린 그래프는 전체 관계가 아니라 일부라고 표시한다.

### AI와 캡처 경계

기존 Snapshot·Analysis 계약과 엄격한 allowlist를 유지한다. 새로운 Event의 file/network/process 필드를 Snapshot.events로 그대로 복사하지 않는다. 기존 안전 집계와 최대 100건 안전 요약만 고정 분석 영역에 렌더링하여 PNG와 함께 보낸다. 페이지 전체·원본 상세·지구본의 IP·파일 경로·명령 인자는 자동 캡처하지 않는다.

새 5개 화면의 AI 진입점은 같은 기간·인스턴스·source 필터로 안전 분석 영역을 연다. 분석 대상이 안전 요약이며 화면의 모든 세부 데이터를 포함하지 않는다는 점을 표시한다. 예를 들어 IP가 안전 요약에 없으면 AI는 특정 IP의 악성 여부를 답하지 않는다. 서버 상태와 GeoIP 역시 현 Snapshot에 없으므로 AI가 확인했다고 말하지 않는다. 지침은 관찰 사실·가능한 해석·추가 확인·한계를 구분하고 공격/유출/차단 성공·로그인·DB 행 수를 만들어내지 않도록 보완한다.

## Orca 병렬 작업 지시

기존 7개 작업을 이어서 사용한다. 새 5개 화면을 5개 프론트 워크트리로 나누면 공통 App·스타일 충돌이 크므로 frontend 한 담당이 5개 화면을 맡는다. 공통 docs는 조정 담당만 수정한다. 다른 담당의 브랜치를 임의 merge/cherry-pick하지 않으며, 읽기와 계약에 따른 독립 검증은 허용한다.

| 워크트리 / 수정 범위 | 이어서 수행할 명령 | 선행 입력 | 완료 조건 |
|---|---|---|---|
| demo-board / demo/ | CRUD를 유지하고 안전한 게시판 시연 절차를 정리한다. 임의 명령 실행 API·인증 우회 API를 추가하지 않는다. Tetragon 담당과 대상 컨테이너/프로세스 경계를 맞추고 해당 관찰 정책 적용 중 CRUD 유지 여부를 수동 확인한다. | Tetragon 관찰 대상·정책명 | 본인 생성 데이터만 정리, CRUD 유지 결과와 관찰 가능/불가능 구분 |
| tetragon-runtime / tetragon/ | 좁은 대상의 네트워크 관찰 정책과 시연을 추가한다. 파일/네트워크 실제 원본 매핑표를 core에 전달한다. 30초 주기 센서·정책 상태 파일과 오류/중단 상태를 생성한다. 기존 SIGKILL 시연 대상을 확장하지 않는다. | 현재 전용 VM·검증한 훅 | 실제 exec/file/network/exit와 정책 상태 증거, 조회 실패/정책 오류 구분. 미관찰 필드는 null |
| event-forwarder / event-forwarder/ | 기존 이벤트 follow/replay는 유지한다. 독립 status-follow 모드와 STATUS_URL, 상태 ACK·중복·제한 재시도를 추가한다. 상태 파일 변경이 없으면 새 observedAt/messageId를 만들어 정상처럼 보내지 않는다. | 위 상태 파일 형태·endpoint | 이벤트 없는 시간에도 상태 전송, 파일 오류/오래된 상태/인증/중복/실패를 수동 확인 |
| saas-core / backend 최상위·src/ingest/·src/__init__.py | additive Event 매핑, 상태 수신·검증·중복 저장, sensor_reports/replays 스키마·마이그레이션을 추가한다. 기존 데이터 보존. settings.allowed_instance_ids() → frozenset[str] 인터페이스로 허용 인스턴스 목록을 data에 제공한다. | Tetragon 실제 필드 매핑 | 기존 v1 재생 호환, 모르는 kprobe OTHER, null 처리, ACK/DB 장애·상태 source 분리 |
| dashboard-data / backend/src/events/·src/snapshots/ | network/graph/servers/readiness/replays API를 위 계약으로 구현한다. 직접 설정 위치와 미확인 목록, 고정 리플레이·정렬·상한·stale를 구현한다. Snapshot 안전 필드는 늘리지 않는다. | core 스키마·정규화 및 상태 계약 | 샘플 경계 입력과 실제 PostgreSQL 확인, 과거 snapshot/replay 불변, 목록/전체 집계 일관성 |
| ai-analysis / backend/src/analysis/ | 제품명·지침을 관찰 기반 분석으로 통일한다. 기존 엄격 allowlist와 캡처 필수 계약을 유지한다. 신규 Event 필드가 AI에 유입되면 거부됨을 확인한다. | 기존 Snapshot 계약, 새 화면 문구 | mock upstream과 실제 유료 AI를 구분, 분석 근거/한계·중복 호출 방지 확인 |
| dashboard-frontend / frontend/ | 같은 Figma 페이지에 추가된 Tetragon용 5개 프레임의 레이아웃을 구현한다. 5개 탐색 경로, 지구본과 미확인 목록, 리플레이, 준비 점검, 탐색기, 서버 대시보드·관계 그래프를 연결한다. 기존 안전 캡처 흐름을 재사용한다. | 이 계약, 새 Figma 노드, data API | 타입·빌드·브라우저 수동 확인. 새로고침/필터/empty/error/stale/sample/truncated, 캡처 민감정보 제외 |

네트워크 매핑 증거가 나오기 전 core/data/frontend는 명시적 sample로 개발할 수 있다. 해당 기능을 live 지원으로 표시하거나 예시를 실제 데이터 대신 자동 주입하지 않는다. 상태 API와 화면은 명확한 계약으로 먼저 병렬 구현할 수 있다. 외부 서비스 키가 없어도 직접 설정 위치/미확인 위치로 지구본을 검증한다.

## 통합 순서와 완료 판단

1. 조정 담당이 이 공통 계약을 배포하고 각 Orca 작업이 읽었는지 확인한다. 큐 입력 성공과 구현 완료를 구분한다.
2. Tetragon의 파일/네트워크 매핑표를 core에 연결하고 status 파일을 forwarder에 연결한다. 각 담당의 진행 중인 파일은 보존한다.
3. core 스키마·수신 → data 조회/리플레이 → AI → frontend 순서로 통합 후보 브랜치에서 조립한다. 각 기능 브랜치의 커밋과 선행 관계를 명시하고 자동 master 머지는 하지 않는다.
4. 실제 시연 이벤트가 전송기→SaaS 저장→5개 화면에 나타나는지 확인한다. 실제와 sample을 분리한다. 준비 점검은 센서 중단/정책 비활성/상태 전송 중단을 서로 구별하는지 확인한다.
5. 새 이벤트 수신 중에도 리플레이·Snapshot·캡처가 고정되는지, 위치 없는 IP·누락 부모·시각 없는 이벤트가 조작 없이 표시되는지 확인한다. AI 외부 호출은 별도 실제 검증 여부를 기록한다.
6. 기능별 로컬 검증·커밋 후 사용자 지시에 따라 푸시하고 Draft PR에 검증과 미검증 범위를 기록한다. 이번 계획 변경은 모든 기능의 검증 완료나 머지 허가를 뜻하지 않는다. CI·자동 테스트를 새 기본 과제로 추가하지 않는다.
