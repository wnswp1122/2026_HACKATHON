# 통합 시나리오 검증 스크립트 계획

이 문서는 병합한 코드로 **게시판 → Tetragon 관찰·정책 대응 → 전송기 → SaaS 저장·가공 → 5개 화면 → 고정 데이터·PNG·AI**를 반복 검증하기 위한 구현 계획이다. 아래 신규 실행기는 아직 구현되지 않았으며 표의 기대 결과는 이번 실행의 성공 기록이 아니다. 기존 기능별 README의 과거 기록과 새 통합 실행 결과를 구분한다. CI는 추가하지 않는다.

## 1. 기존 기능을 재사용하고 통합 실행기만 추가한다

| 구분 | 현재 있는 코드·명령 | 계획에서 맡길 역할 |
|---|---|---|
| 게시판 | [demo/server.py](../demo/server.py), [posts.py](../demo/posts.py): `/health`, `/posts` CRUD | 실행 ID로 만든 글만 생성·조회·수정·삭제, 기존 글 보존 확인 |
| Linux 관찰·정책 | [tetragon/runtime.py](../tetragon/runtime.py): `status/observe/enforce/network/off/probe/network-probe/network-probe-closed/health` | 기존 좁은 대상·정책을 그대로 호출하고 전후 상태·probe 결과 확인 |
| 상태 수집 | [sensor_status.py](../tetragon/sensor_status.py): `--output PATH`, `--once`, 기본 30초 반복 | 실제 센서·정책 보고를 원자적으로 기록 |
| 전송 | [event-forwarder/main.py](../event-forwarder/main.py): `--replay/--follow/--status-replay/--status-follow` | 이벤트와 상태를 별도 프로세스로 실제 SaaS에 전송 |
| SaaS | [app.py](../backend/app.py), [db.py](../backend/db.py), `src/ingest/events/snapshots/analysis` | 실제 PostgreSQL에 수신·중복 제거·조회·고정·이미지·분석 저장 |
| 화면 | [frontend/README.md](../frontend/README.md), `npm run typecheck`, `npm run build`, `npm run dev` | `/overview`, `/replay`, `/readiness`, `/telemetry`, `/servers` 브라우저 확인 |
| 독립 UI mock | `frontend/scripts/mock-server.mjs`, `npm run mock` | UI 장애·상한 재현 보조. 실제 수신기·PostgreSQL·AI 검증을 대신하지 않음 |
| **신규 제안** | `scripts/verify_scenarios.py` | 단계 선택, HTTP 요청·기존 CLI 호출, 실행 자원 기록·정리, JSON/Markdown 보고 |
| **신규 제안** | `frontend/scripts/verify-browser.mjs` | 실제 화면 조작·캡처·요청 순서 검사. Playwright를 로컬 개발 의존성으로 고정하고 제품 번들·CI에는 넣지 않음 |

첫 버전은 Python 표준 라이브러리와 backend의 기존 HTTPX/Pillow를 재사용한다. 기능별 실행기를 여러 개 복제하거나 새 서비스·운영용 API·테스트 전용 제품 경로를 만들지 않는다. 브라우저 도구 추가 전에는 같은 체크리스트를 수동으로 수행해 `manual` 증거로 남길 수 있다.

## 2. 실행 전제와 격리

- Python 3.12와 각 `requirements.lock`, 프론트 Node `>=22.12.0`·lock 설치 상태를 확인한다. backend 작업 디렉터리에서 `python db.py`를 명시적으로 실행한다. `/health`의 DB 연결 성공만으로 스키마 준비를 판단하지 않는다.
- 기본 대상은 **이번 검증 전용 PostgreSQL DB와 게시판 DB**다. `DATABASE_URL`, `INGEST_TOKEN`, `INSTANCE_IDS`, `ATTENTION_POLICY_NAMES`를 서버에 설정하고, 전송기에는 `EVENTS_URL`, `STATUS_URL`, `INSTANCE_ID`, 이벤트 모드의 `TETRAGON_LOG_PATH`를 설정한다. `.env` 자동 로딩을 가정하지 않는다.
- 실행마다 UUID `runId`와 구별되는 sample/live 인스턴스 ID를 발급하고 SaaS 허용 목록에 미리 등록한다. 기존 공용 DB를 사용해야 한다면 이번 ID·UUID 목록으로만 조회·정리하며 전체 테이블 초기화는 금지한다.
- live는 `2026-hack-client` Linux VM, 기존 Tetragon 버전·커널·BTF·소유 label·컨테이너 상태를 실제 조회한다. Mac에서 `runtime.py`를 직접 실행하지 않는다. VM 내부 `127.0.0.1`과 Mac의 주소는 다르므로 전송기 위치에서 SaaS 접근을 별도로 확인한다.
- 게시판과 SaaS DB가 같은 검증 VM에 있으면 `TETRAGON_EXPORT_DEMO_ONLY=1`로 게시판 컨테이너 전용 JSON export를 선택한다. 전체 호스트 export는 SaaS DB 접속 종료를 다시 수집하는 순환을 만들 수 있다. 별도 고객 서버를 관찰하는 환경에서는 이 시연용 옵션을 기본으로 강제하지 않는다. S08 뒤 probe 없는 구간에 DB 조회를 반복해 SaaS 자체 이벤트가 늘지 않는지도 확인한다.
- 실행기는 서비스를 기본 자동 기동하지 않는다. 준비되지 않은 의존성은 `BLOCKED`로 기록한다. 필요한 기동을 선택할 경우 자신이 만든 PID·컨테이너·DB만 소유 목록에 기록한다. 이미 있는 컨테이너를 삭제하거나 VM·전체 워크트리를 재시작하지 않는다.
- 지구본은 전용 `DASHBOARD_LOCATIONS_FILE`의 명시적 IP/서버 좌표만 쓴다. loopback의 좌표를 넣는 sample 시연은 ‘설정된 시연 위치’로 표시하고 실제 지리 위치로 해석하지 않는다. 설정 없는 IP도 반드시 포함한다.
- 실제 키·DB 비밀번호·Authorization 헤더·환경변수 전체·실제 rawEvent는 보고서나 Git에 넣지 않는다. 설정 파일은 Git 제외 경로에 제한 권한으로 두고 값 대신 설정 여부만 기록한다.

## 3. 제안할 명령 인터페이스

**다음 명령은 구현 후 제공할 인터페이스이며 현재 실행할 수 없다.** 저장소 루트에서 실행하고 비밀값은 기존 환경변수로 전달한다.

```sh
backend/.venv/bin/python scripts/verify_scenarios.py --profile sample --stage smoke --saas-url http://127.0.0.1:8000 --board-url http://127.0.0.1:18081
backend/.venv/bin/python scripts/verify_scenarios.py --profile sample --stage browser --frontend-url http://127.0.0.1:5173
backend/.venv/bin/python scripts/verify_scenarios.py --profile live --stage runtime --vm 2026-hack-client
backend/.venv/bin/python scripts/verify_scenarios.py --profile sample --stage resilience
backend/.venv/bin/python scripts/verify_scenarios.py --profile sample --stage ai --ai-mode mock
backend/.venv/bin/python scripts/verify_scenarios.py --cleanup-run <runId>
```

공통 옵션은 `--run-id`, `--output-dir`이며 기본 출력은 `.local/scenarios/<runId>/`다. `--stage`는 `smoke/runtime/browser/resilience/ai/all`, `--ai-mode`는 `unconfigured/mock/real`을 제안한다. 기본 AI 모드는 `unconfigured`이고 `real`은 설정된 키·모델과 명시적 선택이 있을 때만 호출한다. `all`도 유료 AI를 자동 선택하지 않는다.

`sample`은 실제 SaaS·PostgreSQL에 합성 자료를 넣는 검증이다. `live`는 새로 관찰한 실제 이벤트·상태만 사용한다. 독립 UI mock은 결과에 `backend=ui-mock`으로 따로 표기하며 sample 통합 성공에 합산하지 않는다. 종료 코드 제안은 `0=선택 단계 전부 PASS`, `1=FAIL`, `2=필수 전제 BLOCKED`, `130=중단`; 선택하지 않은 단계는 `NOT_RUN`, 선택했지만 증거 없는 단계는 PASS로 계산하지 않는다.

## 4. 시나리오와 판정

| ID·우선순위 | 실행 흐름 | 기대 결과·실패 판정 |
|---|---|---|
| S01 · P0 준비 | schema 적용 → health → OpenAPI → 모듈/필수 테이블 확인 | loadedModules에 ingest/events/snapshots/analysis, missingModules=[]; 모든 필수 경로·테이블 존재. 부분 앱·스키마 누락은 BLOCKED |
| S02 · P0 게시판 | UUID 제목 글 POST → GET/목록 → PATCH → 오류 PATCH → DELETE | 201/200/200/422/204, 삭제 본문 없음·후속 GET 404. createdAt 유지, updatedAt 갱신, 실패 PATCH 후 내용 유지. 실행 전 기존 글 불변 |
| S03 · P0 실제 수신 | sample fixture를 `--replay`로 전송 → eventId/instanceId/source로 실제 DB·조회 확인 | accepted/failed 집계와 실제 저장 개수 일치, source=sample. 토큰 누락·틀림401, 허용 외 인스턴스403, 잘못된 봉투422/JSON400, 거부 요청은 저장되지 않음 |
| S04 · P0 중복·충돌 | 고정 messageId 봉투를 HTTP로 2회 전송 → 같은 ID의 내용 변경 | 최초201/duplicate=false, 재전송200/true·같은 eventId, 변경409. DB 한 행, receivedAt와 last_received_at 유지. 상태는 reportId와 동일 규칙·신선도 미갱신 |
| S05 · P0 정규화·5개 조회 | exec/exit/file/network/unknown 및 시각 없는 fixture → events/dashboard/network/graph/servers/readiness | 실제 훅 매핑만 FILE_ACCESS/NETWORK, 미지원 OTHER·미관찰 null, outcome=unknown. 합계·source·필터 일치, parentExecId만 부모 연결, 위치 없는 IP 목록 유지 |
| S06 · P0 고정 저장 | snapshot/replay 생성 → 새 이벤트 추가 → 기존 ID GET | 원래 payload 전체 불변. snapshot 안전 8필드·최대100; replay는 receivedAt으로 선택하고 occurredAt/eventId 정렬·최대2000, 시각 없는 수 별도 표시 |
| S07 · P0 PNG·미설정 | snapshot 생성 → 이미지 없는 분석 → PNG 업로드 → 동일/다른 PNG 업로드 → 키 없는 분석 | IMAGE_REQUIRED409; 정상PNG201, 같은 바이트200, 다른 바이트409. 키·모델 없는 분석503 AI_NOT_CONFIGURED, analyses 저장 없음. 이미지 오류 시 분석 호출 금지 |
| S08 · P1 observe/live | 실제 대상 게시판 확인 → 이벤트 follow 기동 → observe 적용 → probe·CRUD → SaaS 조회 | probe READ_OK/0, CRUD 유지. 새 raw 관찰과 저장된 live 이벤트를 execId·정책·시각으로 대조. CRUD HTTP 요청 자체를 커널 이벤트와 일대일 매칭하거나 API 발견으로 주장하지 않음 |
| S09 · P1 network/live | network 정책 → `network-probe`와 `network-probe-closed` → 조회 | 각각 CONNECT_OK/0, CONNECT_ERROR/1. 양쪽 connect 관찰 확인, normalized NETWORK·IPv4/TCP/포트 보존. 실패 연결도 관찰되므로 대시보드는 연결 성공으로 표시하면 FAIL |
| S10 · P1 enforce·복구 | enforce 적용 → 제한 probe → 게시판 health/CRUD → 정책 해제·복구 → probe 재실행 | 대상 probe137·READ_OK 없음·SIGKILL 관찰, 게시판 유지, 복구 후 READ_OK/0. 137만으로 전체 대응 성공 판정하지 않고 정책·프로세스·이벤트 증거 함께 확인. SaaS outcome은 여전히 unknown |
| S11 · P1 상태 독립성 | 수집기 + status-follow를 이벤트 follow와 별도 실행 → 무이벤트 시간 → 상태/수집기 중단·복구 | 이벤트 없이도 새 observedAt 보고. 상태 파일이 그대로면 새 보고 없음. 보고 중단90초 초과 stale, 센서 도달 실패의 새 보고 error 구분. 상태만 보낸 서버도 readiness에 표시하며 events/instances 지표는 증가하지 않음 |
| S12 · P1 브라우저 | 실제 SaaS에 연결한 5경로 직접 진입·새로고침·필터·뒤로가기 → replay 재생/배속/이동 → 안전 분석 | UI 값과 같은 필터 API 대조, live/sample 혼동 없음, replay 내용 고정. PNG는 안전 영역만, 업로드 뒤 분석 순서. 원본 상세·IP·파일 경로·execId·센서 상태가 PNG/AI payload에 들어가면 FAIL |
| S13 · P2 장애·재시도 | 제어된 임시 수신기로 503/429/모호한ACK→성공, 인증오류, 재시도 소진 → 실제 DB 장애 별도 | 전송 최대4회, 각 시도 같은 ID/본문;401/403 즉시 종료, 모호한ACK 성공 취급 금지. 실제 DB 장애503에는 성공ACK 없음. 임시 수신기 결과는 실제 DB 연동과 구분 |
| S14 · P2 경계·상태 | 2505개 sample·누락 부모·미지원 필드·null IP·미보고·disabled·error·빈 센서/정책·미래/과거 보고 | network200, graph200/500, replay2000, snapshot100 한도·truncated 표시. 미래30초 초과 unknown/CLOCK_SKEW, 오래된 보고 stale, 빈센서unknown·빈정책warning. 늦게 도착한 과거 observedAt이 최신 보고를 덮지 않음 |
| S15 · P2 화면 실패·영속성 | 지연/조회실패·필터 변경·source 변경 → 앱 재시작 → 저장 ID 복원 | 이전 sample 응답을 live로 표시하지 않음. 마지막 성공 범위/오류 표시, 원본 script 문자열 비실행. replay/snapshot/analysis DB 값 유지. 새로고침 후 PNG 재캡처의409는 오류로 안내하고 덮어쓰지 않음 |
| S16 · P2 AI mock | 실제 snapshot/PNG/DB + FastAPI get_http_client 의존성 교체 → 정상/실패/시간초과/잘못된 응답 → 동일ID 동시 요청 | 성공201·후속200·한 성공 행, upstream 호출 중복 억제. 실패502/timeout504·성공행 없음. PNG hash·허용 payload·지침버전 v2 확인. mock 결과를 실제 모델 분석으로 표시하지 않음 |
| S17 · 선택 실제 AI | 별도 선택한 real 모드로 안전 snapshot/PNG 한 건 요청 | 실제 모델·instructionVersion·analysisId·상태 기록, 분석 근거가 허용 입력 범위 내인지 검토. 미설정/실패를 mock 성공으로 대체하지 않음 |

S04는 전송기 replay를 두 번 실행하는 방식으로 검사하지 않는다. [forwarder.py](../event-forwarder/forwarder.py)는 replay마다 새 messageId를 만들므로 서로 다른 새 이벤트가 되는 것이 현재 동작이다. 전달 중 재시도에만 같은 봉투를 유지한다. 영속 큐·회전 자동 복구·재시작 무손실은 구현 범위 밖이다.

S14의 오래된 상태를 빠르게 검사할 때는 **sample fixture**에 과거 observedAt을 넣는다. 실제 live stale 증거는 상태 보고를 중단하고 90초 초과를 실제 기다려 얻는다. 긴 대기는 제한 시간 내 polling하며 대기 사유를 표시한다. 수집기 실패·정책 오류 fixture의 결과를 실제 Tetragon 장애 재현으로 바꾸어 보고하지 않는다.

## 5. Live 정책 변경은 시작 상태로 복구한다

실행 전 현재 정책명·활성 상태·대상 namespace·컨테이너 ID·게시판 내용과 health를 기록한다. 원래 enforce가 활성화되어 있거나 소유가 불명확하면 자동 실험을 중단한다. 기본 시연은 원래 observe/network 상태 또는 해당 세 정책이 없는 전용 환경에서만 진행한다.

1. 이벤트 `--follow`는 **기동 시점 파일 끝 이후**를 읽으므로 먼저 실행하고 준비 확인 후 probe를 발생시킨다. 오래된 파일 전체를 live로 재생하지 않는다. 실행기는 새 구간의 execId·시각을 기록해 무관한 이벤트를 제외한다.
2. observe·network를 확인한 다음 enforce 구간을 짧게 실행한다. 런타임 CLI의 137과 closed network probe의1은 기대 종료 코드이므로 단순한 `모든 비영=실패` 규칙을 쓰지 않는다.
3. 성공·실패·중단 모두 `finally`에서 이번에 바꾼 정책을 원복한다. `runtime.py off`는 observe/enforce뿐 아니라 **network도 해제**하므로 시작 상태에 있던 observe/network는 다시 적용하고 실제 상태를 확인한다. 알 수 없는 다른 정책은 건드리지 않는다.
4. 복구 후 health·CRUD·probe READ_OK를 확인한다. 복구 실패는 앞 단계 성공 여부와 무관하게 전체 FAIL이며 남은 정책 상태와 필요한 수동 조치를 보고한다. 공유 VM 종료를 복구 절차로 사용하지 않는다.

## 6. 반복 실행과 정리

- 생성한 글 ID와 UUID 제목을 함께 기록하고 삭제 직전 다시 일치 확인한다. 응답이 불명확하면 표식으로 조회하며 POST를 무조건 반복하지 않는다.
- sample 입력은 고정 구조에 실행 시각·새 식별자만 주입한다. raw 민감정보 제외 sentinel은 가짜 표식으로 생성해 snapshot JSON·PNG 영역·AI 요청에서 제외됐는지 검사한다. 실행 DB에는 sample/live별 독립 인스턴스를 사용한다.
- 테스트 DB 삭제는 실행기가 생성했고 소유 표식이 일치할 때만 수행한다. 공용 DB에서는 이번 생성 analysis → snapshot/replay → event/status → 필요 시 이번 인스턴스 순으로 **기록된 UUID만** 정리한다. 기존 행을 건드릴 가능성이 있으면 정리를 건너뛰고 잔여 목록을 보고한다.
- 시작하지 않은 서버는 종료하지 않는다. 생성한 PID도 실행 명령·시작 시각·소유 runId를 재확인하고 종료한다. 임시 수신기·브라우저 프로필·파일은 해당 runId 경로만 정리한다.
- 중단 뒤 `--cleanup-run`은 동일 manifest를 재사용하며 이미 정리된 자원은 성공으로 취급한다. 정책 복구 결과와 데이터 정리를 별도 항목으로 기록한다. 전송 실패 후 재실행이 같은 메시지를 자동 복구한다고 약속하지 않는다.

## 7. 결과물과 완료 기준

`.local/scenarios/<runId>/`에 `manifest.json`(코드 SHA·도구 버전·선택 단계·소유 자원·기준 시각), `results.json`(시나리오별 PASS/FAIL/BLOCKED/NOT_RUN·기대/실제·증거), `summary.md`, 안전하게 줄인 HTTP/CLI 기록, 화면별 PNG와 안전 분석 PNG의 크기·SHA-256을 남긴다. 실제 원본·비밀값은 수집하지 않고 필요한 live 증거는 로컬 보관 경로와 비식별 요약만 남긴다. Git에는 정제한 결과 요약과 미검증 범위만 기록한다.

PR의 통합 성공 표시는 **선택한 실제 실행 범위**에 한정한다. P0 성공은 sample 기반 실제 SaaS 통합, P1 성공은 새 live 수집·전송과 화면 연결, P2는 장애·경계 보강을 뜻한다. UI mock·AI mock·실제 모델 결과를 분리하고, 외부 AI 미실행은 `NOT_RUN`으로 남긴다.

구현 순서는 **P0 실행기·보고·정리 → P1 Linux live 연결과 정책 원복 → 실제 SaaS 브라우저 어댑터 → P2 장애·경계·AI mock → 선택 실제 AI**다. 각 단계는 실패 위치와 복구 여부가 드러나는 작은 단위로 완료하며 새 자동 CI나 제품 기능 확장은 포함하지 않는다.
