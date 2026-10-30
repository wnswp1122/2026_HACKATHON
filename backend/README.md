# AI 기반 서버 보안 모니터링·분석 플랫폼

AI 기반 서버 보안 모니터링·분석 플랫폼의 백엔드다. FastAPI 실행 기반, PostgreSQL 공통 스키마, 인증·이벤트/상태 수신·정규화와 조회·스냅샷·AI 모듈을 조립한다. [수신 계약](../docs/api-contract.md)과 [병렬 개발 기준](../docs/saas-parallel-development.md)을 따른다. 아래 개별 워크트리 검증 기록과 최신 [전체 통합 기록](../worklog/integration-merge.md)을 구분한다.

**현재 후속 계약 기준: `d960d3f` — [Tetragon 5개 화면 구현 계획](https://github.com/wnswp1122/2026_HACKATHON/blob/d960d3feeed6b1693be47e1a1e7cd48c0b911dac/docs/tetragon-screen-plan.md), [선행 PR #4](https://github.com/wnswp1122/2026_HACKATHON/pull/4).** 위 이전 docs와 충돌하면 이 새 계획을 우선한다. 원문 `/Users/junje/Projects/2026_hack/docs/tetragon-screen-plan.md` 전체와 saas-core 담당 행을 읽고 구현했다. LiteSOC는 시각 브랜드로 유지하며 이 브랜치에서는 UI/Figma를 수정하지 않는다.

## 실행 기반과 연결 지점

Python 3.12에서 `requirements.txt`의 직접 의존성을 설치하고 전체 설치 버전을 `requirements.lock`에 고정했다. FastAPI 0.162.0, Pydantic 2.14.2, Uvicorn 0.54.0, psycopg/psycopg-binary 3.3.6, HTTPX 0.28.1, Pillow 13.0.0이다. Dockerfile은 Python 3.12 bookworm 이미지 digest를 고정하고 비루트 사용자로 실행한다.

```sh
# 저장소 루트
python3.12 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.lock
backend/.venv/bin/python -m pip check
```

공유 모듈은 동기 context manager `from db import get_connection`을 사용한다. `psycopg.Connection`과 `dict_row`를 제공하며 정상 종료 시 commit, 예외 시 rollback, 항상 close한다. `DATABASE_URL`은 필수이며 연결 제한은 3초다. SQL 값은 바인딩하고 JSONB는 `psycopg.types.json.Jsonb`를 사용한다. 스키마는 기존 공통 SQL에 d960d3f의 sensor_reports/replays를 더했다. `python db.py`로 명시적으로 적용하며 기존 DB에서도 새 테이블·인덱스만 추가하는 보존형 migration이다. 반복 적용할 수 있고 기존 테이블 컬럼·Event JSON·Snapshot·Analysis는 갱신하지 않는다. `IF NOT EXISTS`는 이름이 같은 기존 테이블의 잘못된 구조를 자동 수정하는 기능은 아니다.

앱은 `src.ingest.router`, `src.events.router`, `src.snapshots.router`, `src.analysis.router`의 `router`를 접두사 추가 없이 조립한다. 각 router가 `/api`를 소유한다. 통합 버전에는 네 모듈이 모두 있다. `/health`에서 `loadedModules` 네 개와 `missingModules: []`를 확인한다. 모듈 파일 부재는 경고와 `missingModules`로, 존재하는 모듈 내부 import/의존성 오류는 기동 실패로 드러난다. `/health`만으로 테이블 생성을 확인할 수 없으므로 `python db.py` 적용 후 조회 API도 확인한다.

## 로컬 PostgreSQL과 SSH 터널

공유 Lima VM `2026-hack-client`를 사용한다. Docker 명령은 매번 전용 소켓을 명시한다. 다른 작업의 VM·컨테이너·볼륨을 중단하거나 기본 Docker context를 바꾸지 않는다. 이 작업의 컨테이너와 볼륨 이름은 모두 `hack-saas-core-db`다.

설정 예시는 [.env.example](.env.example)이다. `.env` 자동 로딩은 없다. 필수 변수는 `DATABASE_URL`, 공백 없는 ASCII `INGEST_TOKEN`, 쉼표 구분 허용 목록 `INSTANCE_IDS`다. `ATTENTION_POLICY_NAMES`는 쉼표 구분이며 기본 빈 값이다. 토큰/설정은 서버에만 두고 브라우저·Git·명령 인자에 넣지 않는다.

새 로컬 환경에서만 아래처럼 Git 제외 설정을 생성할 수 있다. 기존 파일이 있으면 덮어쓰지 않고 중단한다.

```sh
# 저장소 루트. .local에는 sample 검증 자료와 로컬 비밀값만 저장한다.
backend/.venv/bin/python - <<'PY'
from pathlib import Path
import secrets
base = Path('backend/.local')
base.mkdir(mode=0o700, exist_ok=True)
paths = [base / 'core.env', base / 'postgres.env']
if any(path.exists() for path in paths):
    raise SystemExit('기존 설정을 보존하세요. 새 생성은 중단합니다.')
password = secrets.token_hex(24)
core = {'DATABASE_URL': f'postgresql://saas:{password}@127.0.0.1:15432/saas',
        'INGEST_TOKEN': secrets.token_hex(32), 'INSTANCE_IDS': 'board-server-01',
        'ATTENTION_POLICY_NAMES': ''}
postgres = {'POSTGRES_USER': 'saas', 'POSTGRES_PASSWORD': password, 'POSTGRES_DB': 'saas'}
for path, values in zip(paths, (core, postgres)):
    with path.open('x') as file:
        file.write(''.join(f'{key}={value}\n' for key, value in values.items()))
    path.chmod(0o600)
PY
```

컨테이너 실행 전 동일 이름의 기존 상태를 먼저 확인한다. 기존 볼륨에서는 새 `POSTGRES_PASSWORD`로 비밀번호가 바뀌지 않으므로 원래 설정을 유지한다.

```sh
docker --host unix:///Users/junje/.lima/2026-hack-client/sock/docker.sock ps -a --filter name=hack-saas-core-db
# 공식 PostgreSQL 17.11 bookworm ARM64 manifest.
DB_IMAGE=postgres@sha256:e692f23ba2393c8b13879dd4ee9f4f0d7bd146fbddceb4c8e10c4ce1fb53e737
docker --host unix:///Users/junje/.lima/2026-hack-client/sock/docker.sock pull --platform linux/arm64 "$DB_IMAGE"
# 이번 워크트리에서는 아래 검증 기록의 로컬 태그를 사용할 수도 있다.
docker --host unix:///Users/junje/.lima/2026-hack-client/sock/docker.sock run -d \
  --name hack-saas-core-db --label owner=saas-core \
  --env-file backend/.local/postgres.env \
  -p 127.0.0.1:55432:5432 \
  -v hack-saas-core-db:/var/lib/postgresql/data "$DB_IMAGE"
docker --host unix:///Users/junje/.lima/2026-hack-client/sock/docker.sock exec hack-saas-core-db pg_isready -U saas -d saas
```

VM 내부 `127.0.0.1:55432`와 macOS `127.0.0.1:15432`는 다른 주소다. 자동 포트 전달에 의존하지 않고 **별도 터미널에서 명시적 SSH 터널**을 유지한다.

```sh
ssh -F /Users/junje/.lima/2026-hack-client/ssh.config \
  -o ControlPath=none -o ExitOnForwardFailure=yes -N \
  -L 127.0.0.1:15432:127.0.0.1:55432 lima-2026-hack-client
```

다른 터미널에서 앱을 실행한다.

```sh
cd backend
# 직접 만든 신뢰 가능한 로컬 설정만 로드한다. 실제 값은 출력하지 않는다.
set -a
source .local/core.env
set +a
.venv/bin/python db.py
.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

`GET http://127.0.0.1:8000/health`는 DB `SELECT 1` 확인과 조립 모듈 목록을 반환한다. DB 장애는 503이다. health 성공은 스키마 초기화·수집기 heartbeat·전체 기능 통합의 증거가 아니다. `/docs`, `/openapi.json`에서 수신 요청 스키마를 확인할 수 있다. Mac의 loopback 수신 주소는 VM 전송기에서 바로 접근할 수 있는 주소가 아니다. VM 전송기 연결은 별도 역방향 터널/접근 경로를 검증해야 한다.

컨테이너 빌드: `docker --host unix:///Users/junje/.lima/2026-hack-client/sock/docker.sock build -t hack-saas-core:local backend`. 컨테이너의 `DATABASE_URL`에는 VM에서 접근 가능한 DB 주소를 지정해야 하며 위 Mac 터널 주소를 그대로 쓰지 않는다.

## 수신·정규화 동작

`POST /api/events`는 `Authorization: Bearer <INGEST_TOKEN>`과 `application/json`을 요구한다. 토큰 누락/불일치는 401, 허용되지 않은 instanceId는 403이다. 봉투의 필수 필드·타입·버전·UUID·enum·추가 필드는 Pydantic 2 strict 모델로 검증한다. 원본 내부 구조는 열어 둔다. 잘못된 JSON/UTF-8/NaN/Infinity는 400, 봉투 오류는 422다.

원본과 공개 Event 정규화 결과를 한 트랜잭션에 저장하고 **commit 이후** 201을 반환한다. `(instance_id, message_id)` 유일 제약과 `ON CONFLICT DO NOTHING`으로 동시 수신을 보호한다. 같은 내용은 같은 eventId와 200/duplicate=true, 다른 source/rawEvent는 409다. 중복은 received_at/last_received_at을 바꾸지 않는다. 새 이벤트의 last_received_at은 최댓값으로 갱신한다. JSONB가 객체 키 순서를 무시하고 배열 순서와 boolean/숫자 구분을 유지해 비교한다. 큰 정수·소수는 검증한 JSON 원문을 Jsonb로 직접 전달해 float 반올림을 피한다.

PostgreSQL JSONB가 표현할 수 없는 NUL 문자·잘못된 Unicode surrogate·범위 초과 숫자는 422로 거부한다. 원본을 손실 변환해 저장하지 않는다. 수신 트랜잭션에는 statement 4초/lock 3초 제한을 둔다. DB 연결·쓰기·commit 실패는 503 `STORAGE_UNAVAILABLE`이며 성공 ACK를 반환하지 않는다. 오류 응답에는 원본·토큰·DB 예외 내용을 싣지 않는다. 전역 HTTPException(code/message detail), 요청 검증, psycopg 오류와 예기치 않은 500도 공통 error 봉투를 사용한다. 별도 속도 제한기는 이번에 추가하지 않았다.

정규화 범위:

- `time`의 timezone 포함 ISO 시각을 UTC로 변환한다. 누락·실패·timezone 없음은 occurredAt=null이며 receivedAt과 구분한다.
- `node_name`, `process_exec`/`process_exit`의 process(exec_id/pid/uid/binary), parent(binary/exec_id)를 매핑한다. parent.exec_id만 process.parentExecId로 보존하며 PID나 binary로 관계를 추측하지 않는다. pid/uid는 실제 비음수 uint32 정수만 받으며 bool/문자열은 추정 변환하지 않는다.
- `process_kprobe`는 아래 확인된 정책·훅·인자 타입이 함께 맞는 경우에만 FILE_ACCESS/NETWORK로 분류하고 나머지는 **OTHER**다. 공식 필드 policy_name/action의 문자열만 보존하고, 정책명과 allowlist가 정확히 일치할 때 attention과 reason을 설정한다. 숫자 action enum은 해석하지 않는다.
- unknown/서로 충돌하는 process 이벤트 구조는 OTHER로 보존한다. arbitrary arguments는 공개 Event에 포함하지 않는다. 확인한 file/network만 target 표시 요약을 만들고 그 외는 null이며 outcome은 항상 unknown이다. 명령 인자의 경로·SIGKILL 보고를 파일 접근/차단 성공으로 바꾸지 않는다.
- 파일·네트워크는 Tetragon 담당의 실측 증거로 제한 매핑한다. 알려진 IPv4 TCP connect 매핑을 live 수신에도 적용할 수 있으나 실제 전송기→SaaS live 통합은 미검증이다. 상세 매핑과 한계는 d960d3f 확장 기록을 참고한다.

sample 전송은 환경을 로드한 backend 터미널에서 토큰을 인자로 노출하지 않고 실행한다.

```sh
.venv/bin/python - <<'PY'
import json, os, uuid
from pathlib import Path
import httpx
raw = json.loads(Path('../docs/fixtures/sample-events.jsonl').read_text())
envelope = {'schemaVersion': '1', 'messageId': str(uuid.uuid4()),
            'instanceId': 'board-server-01', 'source': 'sample', 'rawEvent': raw}
with httpx.Client(trust_env=False, timeout=5) as client:
    for _ in range(2):
        response = client.post('http://127.0.0.1:8000/api/events', json=envelope,
                               headers={'Authorization': 'Bearer ' + os.environ['INGEST_TOKEN']})
        print(response.status_code, response.json())  # 최초 201, 재전송 200
PY
```

## 공식 참고 자료

구현 중 공식 [FastAPI 오류 처리](https://fastapi.tiangolo.com/tutorial/handling-errors/), [Pydantic strict 모드](https://docs.pydantic.dev/latest/concepts/strict_mode/), [psycopg 트랜잭션](https://www.psycopg.org/psycopg3/docs/basic/transactions.html)·[JSON adaptation](https://www.psycopg.org/psycopg3/docs/basic/adapt.html#json-adaptation), [HTTPX](https://www.python-httpx.org/), [Pillow 설치](https://pillow.readthedocs.io/en/stable/installation/basic-installation.html), [PostgreSQL JSONB](https://www.postgresql.org/docs/17/datatype-json.html), [공식 PostgreSQL 이미지](https://hub.docker.com/_/postgres), [Tetragon gRPC 필드](https://tetragon.io/docs/reference/grpc-api/#processkprobe)·[v1.8.0 원본 스키마](https://github.com/cilium/tetragon/blob/v1.8.0/api/v1/tetragon/tetragon.proto)를 확인했다. 설치한 버전과 실행 결과는 아래 기록을 기준으로 한다.

## 2026-10-31 최초 수신기 검증 기록 (d960d3f 확장 전)

모두 직접 작성한 **sample과 임시 harness**로 확인했다. 실제 Tetragon/전송기/다른 SaaS 모듈 통합 검증이 아니다. 자동 테스트·CI는 추가하지 않았다.

| 항목 | 실제 결과 |
|---|---|
| 설치·빌드 | macOS ARM64 Python 3.12.2 가상환경 설치, `pip check` 성공. 고정 lock으로 Linux ARM64 Docker 이미지 `hack-saas-core:local` 빌드 성공. 앱 컨테이너 실행은 하지 않음 |
| PostgreSQL | 전용 Lima의 `hack-saas-core-db`, PostgreSQL **17.11 (Debian 17.11-1.pgdg12+2)**. 전용 동명 볼륨, VM loopback 55432 게시 |
| 접속 경로 | 명시적 SSH `127.0.0.1:15432 → guest 127.0.0.1:55432`. 이 터널을 통해 psycopg/HTTP 검증. 자동 VM 포워딩은 사용 근거로 삼지 않음 |
| 공통 스키마 | 문서 SQL과 파일 내용 일치. `python backend/db.py` 두 번 성공. instances/events/snapshots/analyses 테이블 확인 |
| 실제 앱 | Mac `127.0.0.1:8000` Uvicorn 기동. health 200, DB 연결 확인. loadedModules=[ingest], missingModules=[events,snapshots,analysis]. 시작 경고 확인, OpenAPI 수신 스키마 확인 |
| 저장 후 ACK | sample 신규 201, 응답 이후 별도 DB 연결에서 raw_event/normalized와 eventId 확인 |
| 중복·충돌 | 키 순서만 바꾼 재수신 200/같은 eventId. 원본/source 변경 409. 최초 raw_event와 received_at/last_received_at 유지 |
| 동시 수신 | 같은 메시지 24건: **201 1건 + 200 23건**, eventId 하나. 서로 다른 두 내용으로 같은 메시지 20건: **201 1건 + 200 9건 + 409 10건** |
| 잘못된 입력·인증 | 토큰 누락/불일치/다른 인증 방식/빈 Bearer 401, 미허용 인스턴스 403. 필수·추가 필드/타입/버전/UUID/길이/source/rawEvent 등 12종 봉투 오류 422. JSON/UTF-8/NaN/Infinity 400, 잘못된 Content-Type 422. 일반 404/405도 공통 error 봉투 |
| 보수적 정규화 | sample exec/exit, timezone UTC 변환, 잘못된 시각 null, bool/음수 pid/uid null 확인. kprobe는 OTHER, 정책명 정확 일치만 attention, 숫자 action 미해석, target=null/outcome=unknown. 명령 인자 미노출 |
| 원본 값 보존 | 30자리 정수와 긴 소수를 SQL 문자열 조회로 대조. 동일 소수 재전송 200, 배열 순서/boolean·숫자 변경 409. NUL 값은 422이며 ACK 없음 |
| 트랜잭션 | `get_connection()` 정상/예외 종료 후 close, 예외 insert rollback 확인. 전용 DB 임시 deferred trigger로 **COMMIT 시점 실패**를 유도해 503/저장 없음 확인. 임시 trigger/function 제거 확인 |
| 재시작 영속성 | 앱 프로세스와 PostgreSQL 컨테이너 재시작 후 **기존 10건 유지**, 최초 이벤트 재전송 200/같은 eventId |
| DB 장애·복구 | 전용 DB만 중단했을 때 수신/health 모두 503, 성공 ACK 없음. 컨테이너만 제거하고 같은 전용 볼륨으로 재생성해 10건과 eventId 유지 재확인. 장애 중 요청은 미저장, 동일 요청 복구 후 201. 최종 sample 11건 |
| 설정·조립 오류 | DATABASE_URL/INGEST_TOKEN/INSTANCE_IDS 각각 누락 시 설정 실패, 토큰 미노출. 별도 임시 디렉터리의 router 내부 ImportError가 앱 import를 실패시킴. 임시 router로 HTTPException/검증/DB/예기치 않은 오류의 409/422/503/500 및 비밀 문자열 미노출 확인. 이 부분은 **독립 harness** |

Docker Hub의 VM 직접 pull에서 TLS timeout이 반복됐다. 실제 ARM64 manifest digest `e692f23ba2393c8b13879dd4ee9f4f0d7bd146fbddceb4c8e10c4ce1fb53e737`를 공식 레지스트리에서 조회하고, 호스트에서 blob을 분할 다운로드했다. manifest/압축 blob SHA256과 압축 해제 레이어의 config diff ID를 모두 대조한 후 `docker load`했다. 이번 로컬 태그는 `postgres:17-core-verified`이며 실행 명령의 `DB_IMAGE=postgres:17-core-verified`로 사용할 수 있다. 이 로컬 태그가 공개 레지스트리 태그라고 가정하지 않는다. 검증 시 컨테이너·볼륨은 위 이름만 생성/중단/재생성했고 기존 클라이언트 컨테이너와 VM은 유지했다.

현재 로컬 확인용 앱/DB/SSH 터널은 실행 상태로 남겼다. `http://127.0.0.1:8000/health`로 확인한다. `.local/core.env`, `.local/postgres.env`는 권한 600의 Git 제외 설정이며 토큰을 복사해 공유하지 않는다. 임시 수동 harness와 결과도 `.local/`에만 있으며 커밋하지 않는다.

**미검증·남은 연결:** events/snapshots/analysis router의 실제 조립과 공유 스키마 소비, UI·조회·스냅샷·캡처·실제 AI, VM 전송기의 SaaS 접근 경로, 실제 live Tetragon 원본·파일/네트워크·정책 대응 결과. 현재 수신/DB 기반의 sample 검증을 기능 전체 완성으로 보고하지 않는다. 공통 DB/HTTP 계약은 변경하지 않았다.


## d960d3f 확장: 상태·Event·마이그레이션

현재 소유 범위는 그대로 backend 최상위와 src/ingest/, src/__init__.py다. 공유 docs나 다른 모듈은 수정/병합하지 않았다. 기존 v1 POST /api/events 봉투·인증·중복·ACK와 안전 Snapshot 계약은 유지한다. 공개 Event의 nullable 필드와 독립 상태 API/테이블을 추가했다. 새 데이터를 AI Snapshot.events에 복사하는 코드는 추가하지 않았다.

### 조회 담당에게 제공하는 인터페이스

- `settings.allowed_instance_ids() -> frozenset[str]`: INSTANCE_IDS만 읽어 유효성을 검사한다. 상태 보고가 없는 허용 대상도 data가 unknown으로 조회할 수 있다. DB/토큰 설정을 요구하지 않는 함수다. 메인 앱의 Settings도 같은 함수를 사용한다.
- `sensor_reports`: 새 계획의 컬럼·source CHECK·유일 키·인덱스를 그대로 사용한다. **payload는 수신한 전체 검증 봉투**(schemaVersion/messageId/instanceId/source/observedAt/collector/tetragon)다. observed_at은 별도 UTC timestamptz, received_at은 SaaS 수신 시각이며 원본 observedAt 문자열을 덮어쓰지 않는다. data는 payload.collector/payload.tetragon을 직접 읽을 수 있다.
- `replays`: replay_id/created_at/payload 테이블만 추가했다. 실제 생성·조회와 REPEATABLE READ 고정 읽기는 data 담당이다.
- 기존 normalized JSON에는 parentExecId/file/network가 없을 수 있다. **과거 행을 보정하지 않는다.** 조회 시 없는 필드를 null로 채우는 것은 data 담당이다.

### POST /api/sensor-status

인증/허용 instanceId는 이벤트와 동일하고 Content-Type은 application/json이다. 새 계획의 봉투·collector/tetragon 중첩 필드를 Pydantic 2 strict 모델로 검증한다. nullable 항목도 명시적으로 null을 보낸다. 정의되지 않은 필드/원본 전체·잘못된 enum/타입·timezone 없는 observedAt은 422다. 잘못된 JSON/UTF-8/NaN/Infinity는 400이다. 이름은 1~100자, error/errorCode는 최대 300자, sensors는 100개, policies는 200개까지다. 초과 요청을 조용히 자르지 않고 422로 거부한다. 송신자는 한도 초과를 발견하면 목록을 제한하고 collector.state=error/errorCode=STATUS_LIMIT_EXCEEDED로 보고한다.

전체 검증 봉투를 JSONB로 저장한 뒤 `{reportId,messageId,duplicate}`를 반환한다. 신규 201, 같은 (instanceId,messageId)·같은 JSON 내용 200/같은 reportId, 다른 내용 409 MESSAGE_CONFLICT다. 비교에서 UUID 문자열 표기만 다른 messageId와 identity instanceId는 제외하고 나머지 JSON 값을 비교하므로 source/observedAt/collector/tetragon 변경도 충돌이다. 객체 키 순서는 무시하며 목록 순서는 보존한다. 중복은 received_at/observed_at/payload를 갱신하지 않는다. DB/commit 실패는 503이며 ACK를 반환하지 않는다.

상태는 events에 넣지 않고 **instances에도 쓰지 않는다**. 따라서 상태만 보내는 허용 인스턴스를 저장할 수 있고 instances.last_received_at을 바꾸지 않는다. 오래된/미래 보고도 원래 관찰 시각과 함께 별도 행으로 보존한다. source별 observed_at/received_at/report_id 내림차순 선택 및 stale 90초/CLOCK_SKEW 30초/ready 등 판정은 새 계획대로 **data의 GET /api/readiness**가 담당한다. 이 API가 수신을 성공했다고 준비 상태를 ready로 판정하는 것은 아니다.

### 활성화한 매핑과 필요한 입력

Tetragon 인접 워크트리의 기존 기준 커밋 `5f7b473`, `tetragon/field-mapping.md`, `tetragon/policies/observe.yaml`, `tetragon/evidence/final-events.jsonl`을 읽었다. 이어서 d960d3f 후속 작업의 고정 커밋 [`a3f160a`](https://github.com/wnswp1122/2026_HACKATHON/commit/a3f160ad64cb34620f711bc169714ec6f5503a4c), [Draft PR #12](https://github.com/wnswp1122/2026_HACKATHON/pull/12)의 [최종 매핑](https://github.com/wnswp1122/2026_HACKATHON/blob/a3f160ad64cb34620f711bc169714ec6f5503a4c/tetragon/field-mapping.md)·정책·실행 결과·상태 증거를 확인했다. 아래 기존 실행 기록과 별도로 고정 원본 29줄의 재생 결과를 마지막 절에 남겼다. v1.8.0/kernel 6.8.0-142-generic의 비밀 없는 격리 시연이다. VM JSONL에서 알려진 정책·훅·전용 net-probe binary에 해당하는 원본 2줄만 읽어 sample로 재생했다. 원본은 Git 제외 `.local/`에만 두었으며, 다른 담당 코드는 복사/병합하지 않았다.

- **파일:** policy_name이 hack-demo-observe 또는 hack-demo-enforce, function_name이 security_file_permission, args[0].file_arg.path가 비어 있지 않은 문자열, args[1].int_arg가 실제 정수 4인 경우만 FILE_ACCESS. `file={path,operation:"read"}`, target=path다. 숫자 문자열/틀린 인자 순서/다른 정책·훅은 OTHER와 null이다. 이 훅의 의미는 읽기 권한 확인 관찰이며 읽기 성공이나 바이트 차단을 입증하지 않는다. 같은 구조를 live 수신에도 매핑할 수 있으나 이번 SaaS 검증은 보관된 증거의 **sample 재생**이다.
- **네트워크:** policy_name=hack-demo-network, function_name=tcp_connect, args[0].sock_arg 객체와 그 안의 family=AF_INET/type=SOCK_STREAM/protocol=IPPROTO_TCP가 모두 일치할 때만 NETWORK. saddr/sport/daddr/dport를 sourceIp/sourcePort/destinationIp/destinationPort로, 확인된 protocol 문자열은 **TCP**로, operation은 **connect**로 명시 매핑한다. 유효한 IP와 실제 0~65535 정수 포트만 보존하며 누락/오류 값은 null이다. 알 수 없는 정책·훅·sock family/type/protocol은 OTHER/network=null이다. 확인된 IPv4 TCP 구조는 live와 sample 모두 같은 방식으로 정규화한다. AF_INET6 등 별도 정책의 live 매핑은 실측 전 지원하지 않는다.
- target은 확인된 destination endpoint, 없으면 source endpoint의 표시 요약이며 파싱 원천으로 사용하지 않는다. IP 검증 함수와 표시 함수는 IPv4/IPv6를 처리하지만 이것을 IPv6 정책 실측으로 보고하지 않는다. Tetragon의 성공 연결(8080)과 ECONNREFUSED(18080)에서 모두 tcp_connect·TCP_SYN_SENT·Post 이벤트가 관찰되었으므로 **연결 성공/전송/침입을 추정하지 않고 outcome=unknown**을 유지한다.
- **센서 한계:** v1.8.0 ListSensors 미지원 보고인 collector.state=unknown/errorCode=SENSOR_STATUS_UNSUPPORTED, reachable=true/version=1.8.0/sensors=[]를 그대로 받는다. 비어 있는 센서를 생성하거나 ready로 바꾸지 않는다. 정책 enabled/disabled/error와 센서 중단·관리 조회 실패는 보고 내용 그대로 별도 보존하며 준비 상태 판단은 data가 맡는다.
- **부모:** parent.exec_id만 parentExecId다. 부모를 관찰하지 못했으면 null이고 process.parent_exec_id/PID/binary를 대체 근거로 합치지 않는다. exec/exit와 알려지지 않은 원본도 file/network nullable 필드를 포함한다.

### 이번 실제 수동 확인

Python 3.12.2, 기존 고정 의존성과 전용 PostgreSQL 17.11을 그대로 사용했다. Mac 포트 8000에서 앱을 실행하고 기존 SSH 15432→VM 55432 터널로 DB에 접속했다. 검증용 harness/결과는 Git 제외 `.local/`에만 있으며 자동 테스트·CI는 추가하지 않았다.

| 확인 | 실제 결과와 한계 |
|---|---|
| 보존형 migration | 이전 Event 11건/instances 2건의 전체 행 digest가 schema 적용 전후 동일. 최종 Event 54건/상태 16건이 있는 DB에서도 schema 두 번 재적용 후 모든 테이블 digest 동일. 새 두 테이블과 지정 인덱스 확인. 반복 schema 적용 후 기존 행 동일, replays 임시 마커 payload 유지 후 마커 제거. 기존 Snapshot/Analysis는 0건이므로 비어 있는 테이블 유지까지만 확인 |
| 상태 HTTP/DB | 신규 201/별도 DB 연결에서 payload와 reportId 확인, 키 순서 중복 200, UUID 대소문자 재전송 200/요청 표기 echo, 시간·source·collector·tetragon 충돌 409. 중복 행의 모든 값 유지 |
| 입력·인증 | 누락/잘못된 토큰 401, 미허용 instance 403, JSON 오류 400. 중첩 추가 필드·enum·길이·목록·시각 등 29종 잘못된 요청 422. 정확한 100 sensors/200 policies/100자 이름/300자 error 허용. unknown/빈 목록을 준비 정상으로 바꾸지 않음 |
| 상태 분리 | 상태 전용 허용 인스턴스 저장 전후 events/instances 및 last_received_at 동일. 오래된 보고·미래 보고를 보존하고 SQL에서 source별 observedAt 최신 보고 선택 확인. **readiness HTTP API 판정 실행 검증은 아님** |
| 상태 동시성 | 동일 메시지 24건: 201 1건+200 23건/같은 reportId. 다른 두 내용의 동일 메시지 20건: 201 1건+200 9건+409 10건 |
| 저장 후 ACK | sensor_reports 임시 deferred trigger로 COMMIT 실패를 유도해 503/저장 없음 확인. 임시 trigger/function 제거 확인. JSONB 미지원 NUL도 422/저장 없음 |
| 기존 이벤트 호환 | 기존 v1 요청 재전송 200, 최초 eventId/received_at/normalized 유지. 새 nullable 필드를 과거 JSON에 덧붙이지 않음 |
| 파일/부모 | Tetragon 실측 예시 12줄을 **source=sample**로 재생. 최종 전달 계약에 맞춰 파일 4건을 재전송해 FILE_ACCESS·operation=read·확인된 path/parent.exec_id/outcome=unknown 확인. 훅/정책/인자 순서/타입/경로가 다른 입력은 OTHER로 확인 |
| 네트워크 | 최종 실측 계약에 대한 수동 확인 70개 통과. 알려진 policy/hook/family/type/protocol만 NETWORK/TCP/connect, IP·bool/범위 초과 포트는 null, 모르는 구조는 OTHER. 이후 실제 VM에서 선택한 네트워크 원본 2줄(8080/18080)도 sample 재생해 같은 필드·부모·outcome=unknown 확인. live 입력 분류는 순수 함수로 확인했으며 실시간 HTTP 전달은 아님. 개발 초기 live 분기 경계용 합성 2행(event/status)은 해당 ID만 제거했고 현재 live 행은 0건 |
| 재시작·장애 | 앱과 전용 DB 재시작 후 status reportId·모든 상태 행 유지. 전용 DB만 중단했을 때 상태/기존 이벤트/health 모두 503, 복구 후 실패 상태 미저장·동일 요청 201 확인. 최종 매핑·실측 예시 재생 후 검증용 Event 54건/상태 16건, 모두 sample |
| 실측 상태 예시 | Tetragon 담당의 enabled/disabled/no-policies/policy-error/sensor-stopped/unreachable 상태 6개를 sample로 재생해 봉투 원본·빈 sensors·collector unknown/error/errorCode가 그대로 저장됨을 확인. 정책 상태와 센서 상태를 합치거나 ready로 바꾸지 않음 |
| 실행·문서 | 실제 OpenAPI title/새 상태 요청 스키마의 중첩 참조 확인. health 200, loaded=[ingest], missing=[events,snapshots,analysis]. pip check·Docker 이미지 빌드·diff 검사 성공. 이미지 컨테이너 실행 검증은 하지 않음 |

**필요한 후속 입력·미검증:** 실제 이벤트/상태 생성기→전송기→본 수신기 live 연결, data/AI/frontend 모듈 조립과 5개 화면 사용자 흐름. data의 진행 중 코드와 payload.collector/tetragon·allowed_instance_ids() 연결이 맞는 것은 정적으로 읽었지만 실행 통합하지 않았다. readiness 판정/리플레이 고정 조회·AI 안전 Snapshot의 신규 화면 통합은 각 담당 범위이며 본 브랜치에서 대체 구현하지 않았다. **실제 전체 통합은 미검증**이다. 기존 앱/전용 DB/SSH 터널은 실행 상태다.


## a3f160a 고정 source 후속 검증

계약 기준은 위 `d960d3f`로 유지한다. 입력은 `feat/tetragon-runtime`의 고정 커밋 `a3f160ad64cb34620f711bc169714ec6f5503a4c`이며 [PR #12](https://github.com/wnswp1122/2026_HACKATHON/pull/12)가 해당 head의 열린 Draft인 것을 조회했다. 인접 워크트리의 변경 가능한 파일 대신 `git show <고정 SHA>:<경로>`로 원본을 읽었다.

- [원본 29줄](https://github.com/wnswp1122/2026_HACKATHON/blob/a3f160ad64cb34620f711bc169714ec6f5503a4c/tetragon/evidence/screen-plan/events.jsonl)을 **source=sample**로 실제 포트 8000 수신기에 재생했다. 신규 모두 201, 원본 JSON 값·부모 execId 일치, 모든 재전송 200/같은 eventId를 확인했다. 정규화 결과는 PROCESS_EXEC 10건, PROCESS_EXIT 10건, FILE_ACCESS 6건, NETWORK 3건이며 outcome은 전부 unknown이다. file operation=read, network protocol=TCP/operation=connect가 고정 표와 일치했다.
- [부정 대조 기록](https://github.com/wnswp1122/2026_HACKATHON/blob/a3f160ad64cb34620f711bc169714ec6f5503a4c/tetragon/evidence/screen-plan/README.md)의 일반 Python/다른 포트/정책 disabled/해제 후 4개 프로세스에는 exec/exit만 존재하는 것을 대조했다. 수신기가 파일·네트워크 관찰을 만들어 넣지 않았다. 성공·ECONNREFUSED의 관찰을 접속 성공/실패 outcome으로 바꾸지 않았다.
- [상태 증거](https://github.com/wnswp1122/2026_HACKATHON/tree/a3f160ad64cb34620f711bc169714ec6f5503a4c/tetragon/evidence/screen-plan)의 status.json, enabled/disabled/no-policies/policy-error/sensor-stopped/unreachable와 periodic-evidence의 최종 COLLECTOR_STOPPED까지 **8개 보고**를 sample로 수신했다. 신규 201, 재전송 200/같은 reportId, observedAt/receivedAt/payload 불변을 확인했다. 빈 sensors, SENSOR_STATUS_UNSUPPORTED/unknown, TETRAGON_STOPPED·TETRAGON_UNREACHABLE·COLLECTOR_STOPPED/error와 실제 정책 상태를 모두 그대로 보존했다. writer 실패 증거는 상태 본문이 아니므로 전송하지 않았다.
- 현재 구현이 고정된 실측 표와 일치해 기능 코드 수정은 필요하지 않았다. 이번 변경은 이 README의 출처·검증 기록뿐이다. core 전용 검증 DB는 Event **83건**, 상태 **24건**이며 모두 sample, live 행은 0건이다. `/health` 200과 ingest 조립/3개 모듈 부재 표시도 확인했다.

이 검증은 **고정 증거의 수신·저장 재생**이다. 30초 수집기/전송기의 현재 live 연결, data readiness의 실제 화면 판정, SaaS→5개 화면·AI의 전체 통합은 여전히 미검증이다. Tetragon의 현재 실행 상태를 재점검하거나 공유 VM·수집기·정책을 조작하지 않았다. 원본을 이 브랜치 Git에 복사하지 않았고 master 머지나 타 브랜치 병합도 하지 않았다.
