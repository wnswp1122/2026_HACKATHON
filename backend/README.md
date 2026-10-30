# AI 기반 서버 보안 모니터링·분석 플랫폼

AI 기반 서버 보안 모니터링·분석 플랫폼의 백엔드다. 이 브랜치는 `saas-core` 소유 범위인 FastAPI 실행 기반, PostgreSQL 공통 스키마, 인증·수신·정규화를 구현한다. [수신 계약](../docs/api-contract.md)과 [병렬 개발 기준](../docs/saas-parallel-development.md)을 따른다. 조회·스냅샷·AI·프론트와 실제 Tetragon 통합은 별도 작업이다.

## 실행 기반과 연결 지점

Python 3.12에서 `requirements.txt`의 직접 의존성을 설치하고 전체 설치 버전을 `requirements.lock`에 고정했다. FastAPI 0.162.0, Pydantic 2.14.2, Uvicorn 0.54.0, psycopg/psycopg-binary 3.3.6, HTTPX 0.28.1, Pillow 13.0.0이다. Dockerfile은 Python 3.12 bookworm 이미지 digest를 고정하고 비루트 사용자로 실행한다.

```sh
# 저장소 루트
python3.12 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.lock
backend/.venv/bin/python -m pip check
```

공유 모듈은 동기 context manager `from db import get_connection`을 사용한다. `psycopg.Connection`과 `dict_row`를 제공하며 정상 종료 시 commit, 예외 시 rollback, 항상 close한다. `DATABASE_URL`은 필수이며 연결 제한은 3초다. SQL 값은 바인딩하고 JSONB는 `psycopg.types.json.Jsonb`를 사용한다. 스키마는 공통 문서 SQL과 동일하며 `python db.py`로 명시적으로 적용한다. `IF NOT EXISTS`는 기존 테이블을 마이그레이션하지 않는다.

앱은 `src.ingest.router`, `src.events.router`, `src.snapshots.router`, `src.analysis.router`의 `router`를 접두사 추가 없이 조립한다. 각 router가 `/api`를 소유한다. 이 브랜치에는 **ingest만 구현**되어 있다. 나머지 세 router 부재는 시작 경고와 `/health`의 `missingModules`에 표시된다. 존재하는 router 내부의 import/의존성 오류는 그대로 기동 실패로 처리한다. 다른 모듈의 대체 구현은 추가하지 않았다.

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
- `node_name`, `process_exec`/`process_exit`의 process(exec_id/pid/uid/binary), parent(binary)를 매핑한다. pid/uid는 실제 비음수 uint32 정수만 받으며 bool/문자열은 추정 변환하지 않는다.
- `process_kprobe`는 **OTHER**다. 공식 필드 policy_name/action의 문자열만 보존하고, 정책명과 allowlist가 정확히 일치할 때 attention과 reason을 설정한다. 숫자 action enum은 해석하지 않는다.
- unknown/서로 충돌하는 process 이벤트 구조는 OTHER로 보존한다. arbitrary arguments는 공개 Event에 포함하지 않으며 target은 null, outcome은 항상 unknown이다. 명령 인자의 경로·SIGKILL 보고를 파일 접근/차단 성공으로 바꾸지 않는다.
- 파일·네트워크 target/유형은 실측 정책 매핑 확보 후 별도 계약 검토가 필요하다. 현재 그 기능을 지원 완료로 표시하지 않는다.

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

## 2026-10-31 수동 검증

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
