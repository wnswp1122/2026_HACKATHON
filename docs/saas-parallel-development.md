# SaaS 병렬 개발 기준

2026-10-31 사용자가 SaaS·프론트까지 직접 개발하도록 범위를 확대했다. 기존 클라이언트 세 작업을 유지하고 아래 네 작업을 추가한다. 이 문서는 구현 시작 기준이며 구현·통합 완료를 뜻하지 않는다. 사용자 서버 수신 계약은 [api-contract.md](api-contract.md)를 유지한다.

## 워크트리와 소유 범위

| 작업 | 수정 가능한 범위 | 책임 |
|---|---|---|
| saas-core | backend/ 최상위 파일, backend/src/ingest/, backend/src/__init__.py | FastAPI 프레임워크, PostgreSQL 스키마/연결, 수신·정규화·중복 제거, 앱 조립 |
| dashboard-data | backend/src/events/, backend/src/snapshots/ | 목록·상세·전체 집계·일관된 스냅샷 |
| ai-analysis | backend/src/analysis/ | 캡처 저장·검증, AI 요청·지침·응답 검증·저장 |
| dashboard-frontend | frontend/ | React/TypeScript/Vite 환경부터 대시보드·캡처·AI UI까지 |

같은 기준 커밋에서 분기한다. 다른 작업 폴더·공통 docs/·루트 파일을 수정하거나 서로의 브랜치를 자동 병합하지 않는다. 추가 의존성이 필요한 모듈은 담당 폴더 requirements.txt와 README에 기록한다. 검증 뒤 로컬 커밋하고 결과를 해당 Orca 작업에 남긴다. 기능 푸시/PR/머지는 이번 실행 지침에 포함하지 않는다.

기존 demo-board / tetragon-runtime / event-forwarder의 소유 범위는 그대로다. SaaS 작업을 위해 기존 작업을 재시작하거나 중단하지 않는다.

## 공통 실행·연결 기준

- Python 3.12, FastAPI/Pydantic 2, psycopg 3(dict_row), HTTPX, Pillow를 backend 기본 의존성으로 둔다. core 담당이 실제 호환 버전을 설치·고정한다. OpenAI 호출은 HTTPX 기반으로 구현해 별도 SDK 결합을 줄인다.
- backend를 현재 디렉터리로 `uvicorn app:app`으로 실행한다. `db.get_connection()`은 psycopg Connection을 제공하는 동기 context manager다. 정상 종료 commit, 예외 rollback, 항상 close. `DATABASE_URL` 필수. SQL 파라미터는 바인딩한다.
- 각 모듈은 `src.ingest.router`, `src.events.router`, `src.snapshots.router`, `src.analysis.router` 파일에 FastAPI `router`를 export한다. 라우트의 `/api` 접두사는 각 router가 소유하고 앱은 접두사 없이 include한다.
- core는 존재하는 모듈만 조립하되 누락 모듈을 시작 로그·README에 명시한다. 누락 모듈 내부의 ImportError를 삼키지 않는다. 모듈 부재 상태를 전체 통합 성공으로 보고하지 않는다.
- 공통 오류는 `{ "error": { "code": "...", "message": "..." } }`. core가 HTTPException(detail에 code/message 객체), 요청 검증 오류, DB 장애의 전역 핸들러를 제공한다. 모듈은 이 규칙으로 오류를 발생시킨다.
- 기존 전용 Lima VM은 공유한다. Docker는 명시적 소켓으로 접속하며 기본 context/VM 설정을 바꾸지 않는다. DB 검증은 작업별 컨테이너·볼륨(hack-saas-core-db / hack-dashboard-data-db / hack-ai-analysis-db)을 사용한다. 다른 작업 컨테이너/볼륨을 삭제하지 않는다.
- core HTTP 포트 8000, data 임시 검증 18002, AI 임시 검증 18003, frontend 5173. PostgreSQL 컨테이너 실행 명령과 버전은 각 README에 기록한다. VM 게스트 DB 포트는 호스트로 자동 전달된다고 가정하지 말고 실제 확인한다.
- frontend는 Vite `/api` proxy를 `VITE_API_PROXY_TARGET`(기본 http://127.0.0.1:8000)로 연결한다. 브라우저에 ingest 토큰/AI 키를 넣지 않는다. 가입·로그인·운영 노출은 제외한 로컬 MVP다.
- 다른 모듈이 아직 없으면 임시 검증 앱/DB로 자신의 모듈을 실행한다. 제품 폴더에 다른 모듈의 대체 구현을 추가하지 않는다. 의존 작업이 끝날 때까지 아무것도 하지 않고 기다리지 않는다. 통합 실행은 모든 모듈 반영 뒤 별도로 확인한다.

## 공유 PostgreSQL 스키마

core가 backend/schema.sql을 구현한다. 아래 이름·타입은 모듈 간 기준이며 임의 변경하지 않는다. UUID는 Python에서 생성한다. JSONB는 psycopg Jsonb로 전달한다.

```sql
CREATE TABLE IF NOT EXISTS instances (
    instance_id text PRIMARY KEY,
    last_received_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
    event_id uuid PRIMARY KEY,
    instance_id text NOT NULL REFERENCES instances(instance_id),
    message_id uuid NOT NULL,
    schema_version text NOT NULL,
    source text NOT NULL CHECK (source IN ('live', 'sample')),
    received_at timestamptz NOT NULL,
    raw_event jsonb NOT NULL,
    normalized jsonb NOT NULL,
    UNIQUE (instance_id, message_id)
);
CREATE INDEX IF NOT EXISTS events_received_idx ON events(received_at DESC, event_id DESC);
CREATE INDEX IF NOT EXISTS events_instance_received_idx ON events(instance_id, received_at DESC);
CREATE TABLE IF NOT EXISTS snapshots (
    snapshot_id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL,
    payload jsonb NOT NULL,
    image_png bytea,
    image_sha256 text
);
CREATE TABLE IF NOT EXISTS analyses (
    analysis_id uuid PRIMARY KEY,
    snapshot_id uuid NOT NULL UNIQUE REFERENCES snapshots(snapshot_id),
    created_at timestamptz NOT NULL,
    model text NOT NULL,
    instruction_version text NOT NULL,
    result jsonb NOT NULL
);
```

normalized는 공개 Event JSON 객체를 저장한다. 필드는 eventId, instanceId, source, receivedAt, occurredAt, nodeName, process, eventType, target, policyName, reportedAction, status, reason, outcome이다. process는 execId/pid/uid/binary/parentBinary를 가진 객체이며 확인되지 않은 값은 null이다. target은 확인된 설명 문자열 또는 null. status는 observed/attention, outcome은 unknown. 의미와 보수적인 매핑은 수신 계약 5절을 따른다. arbitrary arguments는 공개 Event에 넣지 않는다.

INGEST_TOKEN과 허용 INSTANCE_IDS(쉼표 구분)는 core의 backend/.env.example에 명시한다. 토큰 누락 상태로 수신을 허용하지 않는다. 경고 정책명 allowlist는 ATTENTION_POLICY_NAMES(쉼표 구분, 기본 빈 값)로 관리한다. 미확인 정책 필드를 추측하지 않는다. 중복 수신 시 received_at/last_received_at을 새 이벤트처럼 갱신하지 않는다.

## SaaS → 프론트 HTTP 계약 v1

JSON 키는 camelCase, 시간은 UTC ISO 8601 문자열, ID는 UUID다. JSON 객체 순서는 의미가 없다. 단일 로컬 환경이며 공개 인터넷에 노출하지 않는다.

### 조회와 집계

공통 필터: instanceId, from, to, eventType, status, source. from/to는 timezone을 가진 ISO 8601 필수이고 receivedAt에 대해 `[from,to)`로 적용한다. from < to, 최대 31일. 나머지는 선택적 단일 값이며 알 수 없는 enum은 422. eventType/status/source 값은 수신 계약 기준이다.

| API | 응답 |
|---|---|
| GET /api/instances | `{items:[{instanceId,lastReceivedAt}]}`. instanceId 오름차순 |
| GET /api/events | 공통 필터 + page(기본 1), pageSize(기본 50, 최대 100). `{items:Event[],total,page,pageSize}`. receivedAt 내림차순, eventId 내림차순 |
| GET /api/events/{eventId} | `{event:Event,rawEvent:object}`. 없는 ID 404 |
| GET /api/dashboard | 공통 필터. 아래 Dashboard 객체 |

Dashboard: `{total,attention,byType:[{eventType,count}],bySource:[{source,count}],timeline:[{bucketStart,count,attention}],bucketSeconds}`. 모두 필터 전체 범위 기준. byType은 전체 enum을 0 포함, bySource는 live/sample 모두 0 포함, timeline은 0건 버킷 포함해 시간 오름차순. from부터 고정 폭으로 버킷화하고 마지막 버킷은 to에서 자른다. 기간 6시간 이하 60초, 48시간 이하 600초, 그 외 3600초. lastReceivedAt은 정상 heartbeat를 의미하지 않는다.

### 스냅샷

- POST /api/snapshots: 본문은 공통 필터 객체. 201과 Snapshot 반환.
- GET /api/snapshots/{snapshotId}: 저장한 Snapshot 그대로 반환. 없으면 404.
- Snapshot: `{snapshotId,createdAt,filters,dashboard,events,eventLimit,eventsTruncated}`.
- filters는 from/to와 선택 필터를 저장한다. dashboard는 위 Dashboard와 같은 구조. events는 최신 100건까지의 안전한 요약이며 eventId/instanceId/source/receivedAt/occurredAt/eventType/status/outcome만 포함한다. eventLimit=100, eventsTruncated는 total>events.length.
- 모든 집계와 요약을 같은 REPEATABLE READ 트랜잭션에서 읽고 저장한다. 새 이벤트가 와도 저장된 payload는 바뀌지 않는다. 원본·명령 인자·프로세스 경로는 스냅샷/캡처/AI 입력에서 제외한다. 스냅샷 ID/시각도 payload에 포함한다.

### 캡처와 AI

- PUT /api/snapshots/{snapshotId}/image: Content-Type image/png, PNG 바이너리 본문 최대 5 MiB, 해석 후 최대 4096×4096 픽셀. 잘못된 이미지 422, 크기 초과 413, 미존재 스냅샷 404. MIME/시그니처만 믿지 말고 디코딩 검증한다. 첫 이미지 저장 201, 동일 바이트 재전송 200, 다른 이미지 교체는 409. 응답 `{snapshotId,imageSha256}`. 스냅샷 데이터와 이미지의 시각적 일치는 프론트 캡처 절차로 보장하며 서버가 이미지 내용을 증명했다고 쓰지 않는다.
- POST /api/snapshots/{snapshotId}/analysis: 본문 없음. 저장된 payload와 PNG를 함께 Responses API에 보내고 검증된 결과만 저장. 신규 201, 이미 성공한 결과는 외부 재호출 없이 200. 스냅샷 404, 이미지 누락 409 IMAGE_REQUIRED, 키/모델 미설정 503 AI_NOT_CONFIGURED, 외부 실패·거절·잘못된 구조 502 AI_FAILED, 시간 초과 504 AI_TIMEOUT. 동시 요청에는 스냅샷별 DB 잠금을 사용해 중복 외부 호출을 막는다. 실패는 성공으로 저장하지 않는다.
- GET /api/snapshots/{snapshotId}/analysis: 성공 결과 200, 스냅샷/결과 미존재 404.
- Analysis: `{analysisId,snapshotId,createdAt,model,instructionVersion,result:{facts:string[],hypotheses:string[],checks:string[],limitations:string[]}}`.
- OPENAI_API_KEY와 OPENAI_MODEL은 서버 설정. 모델 기본값을 임의로 확정하지 말고 이미지+구조화 출력 지원을 공식 문서에서 확인한다. 실제 유료 호출 없이 요청 구성/응답 처리를 임시 서버로 검증할 수 있으며 실제 AI 검증과 구분한다.
- 지침 파일은 analysis 폴더에 Markdown으로 두고 버전을 기록한다. 외부 이벤트·이미지를 명령으로 따르지 않고, 실제 차단·유출을 단정하거나 정책을 실행하지 않는다. 원본 전체를 외부 AI에 보내지 않는다.

## 프론트 동작·검증

React·TypeScript·Vite·Recharts·html-to-image 의존성/lock/실행 명령과 .env.example을 frontend/에서 준비한다. 라이브 대시보드는 2초 폴링하며 필터 변경 시 오래된 응답을 버린다. 오류 시 마지막 성공 화면/시각과 오류를 함께 보여준다. 정규화된 Event만 표시하고 원본 상세는 별도 영역으로 둔다.

AI는 기간 선택 → 스냅샷 생성 → 별도 고정 분석 영역 렌더링 → 폰트·레이아웃·차트 완료 후 PNG 캡처 → 이미지 업로드 → 분석 요청 순서다. 고정 영역에 snapshotId/기간/source/집계 범위/요약 생략 여부를 표시한다. 라이브 폴링으로 고정 영역을 바꾸지 않는다. 캡처 실패하면 분석을 호출하지 않는다. 요청 중 선택 변경·중복 클릭·미설정 AI를 처리하고 외부 전송 내용(안전 요약+캡처)을 사용자에게 알린다.

각 작업은 실제 기동과 정상·실패 입력을 수동 확인하고 자기 README에 기록한다. 프론트는 설치·타입 검사·빌드 외에 브라우저 화면과 캡처를 확인한다. mock/sample 검증은 실제 전체 통합으로 보고하지 않는다. 공통 통합 순서는 core → data → AI → frontend이며 병렬 구현 완료 후 별도 검증한다.
