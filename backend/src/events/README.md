# 이벤트 조회·전체 집계

**후속 구현 기준: `d960d3f` — [Tetragon 5개 화면 계획 원격 원문](https://github.com/wnswp1122/2026_HACKATHON/blob/d960d3feeed6b1693be47e1a1e7cd48c0b911dac/docs/tetragon-screen-plan.md), [선행 PR #4](https://github.com/wnswp1122/2026_HACKATHON/pull/4).** 워크트리의 이전 `docs/saas-parallel-development.md`와 충돌하면 이 원격 계획이 우선한다. LiteSOC의 제품 소개는 **AI 기반 서버 보안 모니터링·분석 플랫폼**이다.

dashboard-data 소유 모듈이다. [공통 HTTP/SQL 계약](../../../docs/saas-parallel-development.md)과 [수신·정규화 의미](../../../docs/api-contract.md)를 유지한다. 수신기·정규화·공통 DB·앱은 saas-core 소유이며 여기에 대체 구현을 두지 않는다.

## 연결 지점

- `src.events.router`가 `/api` 접두사를 포함한 `router`를 export한다. core 앱은 접두사 없이 include한다.
- `db.get_connection()`은 새 psycopg 3 연결(`dict_row`, autocommit=False)을 제공하는 동기 context manager여야 한다. 정상 종료 commit, 예외 rollback, 항상 close한다. `DATABASE_URL`과 공통 DDL은 core가 소유한다.
- core는 `HTTPException.detail`의 code/message, 요청 검증 실패, psycopg 오류를 공통 `{error:{code,message}}` 응답으로 변환한다. 모듈이 DB 오류·원본·비밀값을 오류 응답에 복사하지 않는다.
- [snapshots 모듈](../snapshots/README.md)이 필터와 읽기 함수를 재사용한다. 기존 v1 봉투와 안전 Snapshot 계약은 유지하고, 화면 조회·공개 Event·Replay는 후속 계획대로 확장한다.

## 구현 동작

| HTTP | 동작 |
|---|---|
| `GET /api/instances` | 인스턴스 오름차순 목록·최근 수신 시각. heartbeat 판정 아님 |
| `GET /api/events` | 공통 필터, page=1/pageSize=50, 최대 100. receivedAt/eventId 내림차순 |
| `GET /api/events/{eventId}` | 안전한 공개 Event와 저장한 rawEvent. 없는 UUID 404, 잘못된 UUID 422 |
| `GET /api/dashboard` | 동일 필터 전체 범위의 집계·0 버킷 |

`from`/`to`는 시간대가 있는 ISO 8601 문자열이며 UTC로 변환한다. receivedAt에 `[from,to)`를 적용하고, from < to와 최대 31일을 검증한다. optional instanceId는 1~100자, enum은 공통 계약 그대로다. 잘못된 페이지·알 수 없는 필드·중복 쿼리 값은 422다. SQL 값은 바인딩하며 발생 시각은 필터와 별도 유지한다.

목록의 total과 items는 하나의 REPEATABLE READ READ ONLY 트랜잭션에서 읽는다. 집계는 페이지 제한 없이 DB에서 유형/source/상태/버킷별로 계산한다. 유형 5개·source 2개를 항상 0 포함해 반환한다. timeline은 from을 기준으로 6시간 이하 60초, 48시간 이하 600초, 그 외 3600초 폭이며 마지막 부분 버킷도 포함한다. 매우 큰 유효 페이지는 빈 items를 반환한다.

공개 Event와 process는 허용 필드만 반환하며 rawEvent는 상세에만 포함한다. 원본을 다시 해석하거나 정책 대응 결과를 추측하지 않는다. 스냅샷에는 process/target/reason도 포함하지 않는다.

## 의존성과 core 통합 후 실행

저장소 루트에서:

```sh
python3.12 -m venv backend/src/events/.venv
backend/src/events/.venv/bin/python -m pip install -r backend/src/events/requirements.lock
backend/src/events/.venv/bin/python -m pip check
```

`requirements.txt`는 core 의존성에 추가할 psycopg만 선언한다. `requirements.lock`은 이 작업에서 실제 설치한 검증 환경 전체를 고정한다. core가 고정한 버전과 다르면 통합 시 다시 검증해야 한다.

core의 schema.sql 적용과 DATABASE_URL 설정 후 `backend/`에서:

```sh
src/events/.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

앱 조립 담당이 추가할 import는 다음과 같다. 이 작업에서는 core 파일을 수정하지 않는다.

```python
from src.events.router import router as events_router
from src.snapshots.router import router as snapshots_router
app.include_router(events_router)
app.include_router(snapshots_router)
```

## core 없는 독립 검증 환경

실제 PostgreSQL을 사용하고, DB 연결·앱·샘플 삽입·관측 스크립트는 ignored `backend/src/events/.local/`에만 둔다. 제품 코드에 가짜 DB·수신기·대체 앱은 없다. 이 환경의 HTTP는 `127.0.0.1:18002`, DB는 SSH 터널을 통한 `127.0.0.1:18432`다. 자동 테스트/CI는 추가하지 않았다.

전용 컨테이너와 볼륨은 모두 `hack-dashboard-data-db`다. 기존 이름이 있으면 먼저 소유·상태를 확인하고 재사용한다. 공유 VM과 다른 작업의 컨테이너/볼륨을 중지·삭제하지 않는다. 아래는 `backend/` 기준이다.

```sh
mkdir -p src/events/.local
python3.12 - <<'PY'
from pathlib import Path
import secrets
p = Path('src/events/.local/postgres.env')
if not p.exists():
    p.write_text('POSTGRES_USER=dashboard_data\nPOSTGRES_DB=dashboard_data\nPOSTGRES_PASSWORD=' + secrets.token_urlsafe(32) + '\n')
    p.chmod(0o600)
PY
docker --host unix:///Users/junje/.lima/2026-hack-client/sock/docker.sock run -d \
  --name hack-dashboard-data-db --env-file src/events/.local/postgres.env \
  -p 127.0.0.1:18432:5432 -v hack-dashboard-data-db:/var/lib/postgresql/data postgres:17-alpine
```

게스트 DB 포트는 자동 포워딩하지 않는다. 별도 터미널에서 터널을 유지한다.

```sh
ssh -F /Users/junje/.lima/2026-hack-client/ssh.config -o ControlMaster=no -S none \
  -N -L 127.0.0.1:18432:127.0.0.1:18432 lima-2026-hack-client
```

DDL은 공통 문서의 SQL 코드 블록을 그대로 `.local/contract-schema.sql`에 복사해 적용한다. 별도 스키마를 정의하지 않는다.

```sh
docker --host unix:///Users/junje/.lima/2026-hack-client/sock/docker.sock exec -i \
  hack-dashboard-data-db psql -U dashboard_data -d dashboard_data -v ON_ERROR_STOP=1 \
  < src/events/.local/contract-schema.sql
```

임시 `.local/db.py`는 다음 인터페이스를 사용한다. DATABASE_URL은 위 로컬 자격 증명과 터널 주소로 환경변수에 설정하고 출력·커밋하지 않는다.

```python
from contextlib import contextmanager
import os
import psycopg
from psycopg.rows import dict_row

@contextmanager
def get_connection():
    with psycopg.connect(os.environ['DATABASE_URL'], row_factory=dict_row) as conn:
        yield conn
```

임시 `.local/harness_app.py`는 FastAPI 앱에 위 두 router만 include하고, core와 동일한 HTTPException/RequestValidationError/psycopg.Error 핸들러를 제공한다. 마지막 두 오류는 입력·DB 예외 내용을 복사하지 않고 고정 메시지의 422 VALIDATION_ERROR/503 STORAGE_UNAVAILABLE로 응답한다. 수신·AI·프론트는 붙이지 않는다.

```sh
PYTHONPATH="$PWD:$PWD/src/events/.local" src/events/.venv/bin/python -m uvicorn \
  harness_app:app --app-dir src/events/.local --host 127.0.0.1 --port 18002
curl --get http://127.0.0.1:18002/api/events \
  --data-urlencode 'from=2026-10-31T00:00:17.250000Z' \
  --data-urlencode 'to=2026-10-31T00:04:22.250001Z' \
  --data-urlencode 'pageSize=37'
```

## 2026-10-31 초기 구현 검증 기록

macOS ARM64/Python 3.12.2에서 FastAPI 0.162.0, Pydantic 2.14.2, psycopg/binary 3.3.6, Uvicorn 0.54.0, HTTPX 0.28.1을 설치했다. `pip check`와 제품 Python 파싱, `git diff --check`가 통과했다. DB는 공유 Lima VM 안의 실제 PostgreSQL 17.11 ARM64이며, DB 포트는 자동 전달이 아닌 위 SSH 터널로 연결했다.

공식 `postgres:17-alpine`의 ARM64 manifest는 `sha256:a717692f944862397bd102c6abee9b3f7927adbf7ee5f3a93e50b65aea0c5396`이다. VM의 Docker Hub pull 지연/TLS timeout으로 호스트에서 공식 registry manifest·blob을 내려받아 SHA-256/압축 해제 후 rootfs 해시를 확인하고 `docker --host unix:///Users/junje/.lima/2026-hack-client/sock/docker.sock load`로 적재했다. 실제 실행 이미지 ID는 `sha256:cfeacb2d382e5d4f18830895e1a638efd60cee7597d7a5144486dc285e74a6bd`이며, 적재된 ARM64 이미지의 모든 rootfs 레이어가 검증한 공식 config와 일치했다. 정상 pull이 가능한 환경은 `postgres@sha256:a717692f944862397bd102c6abee9b3f7927adbf7ee5f3a93e50b65aea0c5396`으로 고정할 수 있다.

공통 문서 DDL을 그대로 적용했다. 데이터는 **직접 DB에 넣은 synthetic/sample**이며 실제 Tetragon 수집·인증·정규화 통합 결과가 아니다. source=live도 필터 검증용으로 직접 입력한 라벨이다. `occurredAt`을 2000년으로 고정해 receivedAt 필터와 분리되는지도 확인했다.

| 수동 실행 | 실제 결과 |
|---|---|
| 빈 DB의 instances/events/dashboard/snapshot | 200/201, 빈 목록·0 집계·5개 0 버킷 |
| 범위 내 239건, 경계 밖 2건 | from 정확히 포함, from−1µs 제외, to−1µs 포함, to 정확히 제외 |
| pageSize=37 전체 페이지 합계 | 중복/누락 없이 239건. 동일 receivedAt의 UUID 내림차순과 일치 |
| 전체 집계 | total=239, attention=80, timeline count=`[121,117,0,0,1]` |
| 인스턴스·source·유형·상태 각각과 결합 조건 | 목록 페이지 합계/total/집계/유형/source/타임라인 합계가 기대값과 일치 |
| 없는 인스턴스와 SQL 형태의 instanceId | 빈 목록과 모든 enum 0 집계. 바인딩된 값으로 처리 |
| 기간 폭 경계 | 6h=60초, 6h+1µs=600초, 48h=600초, 48h+1µs=3600초, 31일=744개 1h 버킷 |
| 1µs 기간·동일 범위 +09:00 표현 | 부분 버킷 1개·UTC 범위와 동일 응답 |
| 목록 기본값·아주 큰 page | 1/50, 범위 밖 page는 빈 items |
| 인스턴스 정렬·상세 | board-a/b/c 오름차순, rawEvent는 상세에만 포함, process의 임의 arguments 제외 |
| 없는 event/snapshot UUID | 404 NOT_FOUND |
| 잘못된 입력 25건 | 시간대 누락/역전/31일 초과/숫자 시각/enum/instanceId/페이지/UUID/추가 필드/UTC overflow/중복 쿼리 모두 422 |
| OpenAPI | 공통 계약의 6개 경로 확인 |
| DB 중지 | HTTP 503 STORAGE_UNAVAILABLE, DB 예외·비밀값 비노출 |
| 앱 재시작·전용 DB stop/start | 인스턴스 3개·이벤트 243건·스냅샷 5건 보존. 기존 스냅샷 값 동일 |

처음 241건을 넣은 뒤 불변성과 동시성 검증에서 2건을 추가했다. 현재 같은 범위의 라이브 집계는 241건, 처음 저장한 스냅샷은 239건이다. [스냅샷 검증 기록](../snapshots/README.md)에 동시 commit·저장 실패 확인을 별도로 남겼다.

이 워크트리에 남긴 ignored 실행 파일은 `.local/run.py`, `runtime.py`, `db.py`, `harness_app.py`다. run.py는 이 작업이 생성한 `.local/postgres.env`만 읽어 DATABASE_URL/PYTHONPATH를 설정한다. `.env` 자동 로딩은 없다. 서버를 종료했다면 저장소 루트에서 다음으로 다시 실행할 수 있다. DB 컨테이너와 SSH 터널도 실행 중이어야 한다.

```sh
backend/src/events/.venv/bin/python backend/src/events/.local/run.py
```

검증용 HTTP 앱은 `http://127.0.0.1:18002/docs`에서 조작할 수 있다. 임시 harness·자격 증명·DB·검증 스크립트는 커밋에 포함하지 않는다. 공유 VM과 다른 작업의 컨테이너/볼륨은 중지·삭제하지 않았다.

**미검증:** core의 실제 db.py/schema.sql/app.py 및 수신·정규화와의 통합, AI 이미지/분석 모듈, 프론트 화면·캡처, 실제 Tetragon 이벤트 전체 흐름. 공통 핸들러의 오류 모양은 임시 앱에서만 확인했으며 core에서도 다시 확인해야 한다. 독립 모듈 검증을 기능 전체 통합 완료로 해석하지 않는다.

확인한 공식 문서: [FastAPI query parameter models](https://fastapi.tiangolo.com/tutorial/query-param-models/), [Pydantic 날짜·시간 타입](https://docs.pydantic.dev/latest/api/standard_library_types/), [psycopg 트랜잭션](https://www.psycopg.org/psycopg3/docs/basic/transactions.html), [dict_row](https://www.psycopg.org/psycopg3/docs/api/rows.html), [Jsonb](https://www.psycopg.org/psycopg3/docs/basic/adapt.html#json-adaptation), [PostgreSQL 17 격리 수준](https://www.postgresql.org/docs/17/transaction-iso.html), [공식 PostgreSQL 이미지](https://hub.docker.com/_/postgres).

## d960d3f 후속 구현: 5개 화면용 API

기존 `src.events.router`에 아래 API를 함께 export한다. 별도 서비스나 앱 등록은 필요 없다. `QueryFilters`만 processExecId(1~1024자)·policyName(1~100자)의 정확 일치 필터를 추가했다. GET events/dashboard와 아래 기간 조회 및 POST replays가 사용한다. Snapshot은 별도 `EventFilters`를 유지하며 새 두 필드를 본문에 넣으면 422다.

공개 Event에는 nullable file/network와 process.parentExecId를 추가했다. 과거 저장 행에 없으면 null이며, rawEvent/target/binary/PID에서 추측해 채우지 않는다. file/network/process는 허용 키만 반환한다. 수신·매핑·IP/포트 검증은 core 소유다.

| API | 실제 구현 |
|---|---|
| `GET /api/network` | 전체 NETWORK 건수·관찰 연결별 count, count 내림차순 및 결정적 키 순 200개. 위치 없는 건수는 상한 적용 전 전체 범위에서 계산 |
| `GET /api/graph` | server/process/ip/file 노드, parent/observed 간선. 200노드·500간선, 누락 노드를 가리키는 간선 제외, 생략 시 truncated=true |
| `GET /api/servers` | 전체 필터 범위의 서버별 total/attention/0 포함 byType/lastReceivedAt. instanceId 오름차순, health 판정 없음 |
| `GET /api/readiness` | source 필수, instanceId 선택. 허용 인스턴스를 기준으로 source별 마지막 observedAt/receivedAt/reportId 보고 조회 |
| `POST/GET /api/replays[/{replayId}]` | [고정 리플레이 설명·검증](../snapshots/README.md). snapshots router에 함께 포함 |

graph ID는 충돌 없는 JSON 식별자에 종류 순서 접두사를 붙인 불투명 문자열이다. 서버→프로세스→IP→파일 순으로 노드 상한을 적용하고, 각 종류 안에서는 ID 오름차순이다. 간선은 source/target/kind 순이다. 프로세스 ID는 instanceId+execId이며 PID·binary 재사용으로 합치지 않는다. parentExecId만 parent 간선을 만들고 부모 이벤트가 범위에 없으면 `미관찰 부모: ...` 노드를 둔다. 그래프 간선 수/관찰 count를 전체 이벤트 수나 인과관계로 표현하지 않는다.

readiness는 events/instances의 최근 수신 시각을 사용하지 않는다. 보고가 없는 허용 대상은 unknown/NO_REPORT다. 30초 초과 미래 observedAt은 unknown/CLOCK_SKEW, observedAt 또는 receivedAt이 90초보다 오래됐으면 stale이다. 이후 오류→미확인→빈 센서→빈 정책→disabled→ready 순으로 판정한다. 빈 센서는 unknown/SENSOR_NOT_OBSERVED, 정책 0개는 warning/POLICY_NOT_CONFIGURED다. collector 오류는 안전한 errorCode 또는 COLLECTOR_ERROR, 나머지는 TETRAGON_UNREACHABLE/SENSOR_ERROR/POLICY_ERROR/STATUS_UNKNOWN/SENSOR_DISABLED/POLICY_DISABLED를 사용한다. ready의 reason은 null이다. GET은 저장된 보고만 조회하며 Tetragon 명령을 실행하지 않는다.

### 명시적 위치 설정

추가 의존성은 없다. 서버 환경변수 `DASHBOARD_LOCATIONS_FILE`은 선택적 JSON 파일 경로다([변수 예시](.env.example)). 미설정이면 모든 위치가 null이다. 위치 파일을 잘못 설정하면 503 LOCATION_CONFIG_INVALID를 반환하고 경로·내용은 오류에 노출하지 않는다. 파일 상한은 1 MiB, IP는 IPv4/IPv6, 위도/경도는 유한한 −90~90/−180~180 숫자다. 좌표는 설정값만 쓰며 외부 GeoIP 호출은 없다.

다음은 **직접 설정 형식을 보여주는 sample이며 실제 관찰 위치가 아니다.** 제품 기본 데이터로 주입하지 않는다.

```json
{
  "ips": {
    "203.0.113.10": {"countryCode": null, "latitude": 0, "longitude": 0, "source": "configured"}
  },
  "instances": {
    "sample-server": {"countryCode": null, "latitude": 0, "longitude": 0, "source": "configured"}
  }
}
```

destinationIp가 있으면 그 위치, 없으면 sourceIp의 위치를 사용한다. IPv6 표기는 정규화해 비교한다. serverLocation은 instances 설정만 사용한다. 위치 미확인 이벤트도 items에 남으며 location=null이다. 과거 NETWORK 행에 network가 없으면 null 연결 요약으로 집계하고 미확인 수에 포함한다. source를 생략하면 live/sample을 포함한 범위가 되므로 화면은 선택한 출처를 명시해야 한다.

### core 연결과 이번 실행 환경

core의 갱신된 schema.sql에 sensor_reports/replays가 있고 `settings.allowed_instance_ids() -> frozenset[str]`가 있어야 한다. `INSTANCE_IDS`는 보고가 없거나 이벤트를 보내지 않은 허용 대상도 포함한다. 이 작업에서 공통 파일·마이그레이션·다른 브랜치를 수정하거나 병합하지 않았다. 2026-10-31 core 워크트리의 해당 함수와 DDL이 계획과 일치함을 **정적으로 읽어 확인**했다.

이번 실행은 기존 전용 DB/볼륨 `hack-dashboard-data-db`, SSH 터널 18432, HTTP 18002를 재사용했다. `.local/plan-extension.sql`의 계획 DDL과 ignored settings/app/db harness를 사용했다. 실제 core 앱·수신기·프론트를 조립한 실행은 아니다. 실행 명령은 위 `.local/run.py`와 같으며 `.local/runtime.py`가 검증용 INSTANCE_IDS와 빈 위치 설정 파일 경로를 명시적으로 넣는다. 상태 보고도 직접 DB에 넣은 synthetic 데이터이며 source=live 라벨의 분리 검증 1건을 실제 수집으로 해석하면 안 된다.

### 2026-10-31 후속 수동 실행 결과

| 확인 | 실제 결과 |
|---|---|
| 신규 6개 경로의 empty/없는 ID/입력 오류 | 빈 결과·빈 Replay 201, 없는 UUID 404, 잘못된 UUID/필터/페이지/중복 쿼리/잘못된 source 422 |
| processExecId/policyName 및 기존 필터 | 목록 total=전체 dashboard=서버별 합계. 정확 일치·결합·SQL 형태 값의 빈 결과 확인 |
| 서버 latest 시각 | 범위 끝 제외, 같은 초의 서로 다른 µs를 포함해 실제 최대 receivedAt 확인 |
| network 전체 범위·200개 상한 | 205개 연결 중 200개 반환, truncated=true. 반환에서 빠진 IP에만 위치를 설정해도 unmappedCount=204로 전체 범위 계산 |
| 위치·미확인 | IPv4/IPv6·sourceIp fallback·별도 serverLocation 확인. 미설정/null 위치 유지, 잘못된 IP·좌표·bool 좌표·geoip 설정은 안전한 503 |
| graph 식별·정렬·상한 | 작은 범위 12노드/13간선, 큰 범위 200노드/199간선, 밀집 범위 31노드/500간선. 반복 조회 순서 동일·모든 간선 끝점 존재·truncated 확인 |
| process identity/미관찰 부모 | 같은 PID/binary를 가진 다른 execId와 다른 인스턴스의 같은 execId를 분리. 확인된 parentExecId만 연결 |
| readiness SQL/HTTP 16개 상태 사례 | ready/warning/error/unknown/stale, 수신 지연·관찰 지연·미래 시각·빈 센서/정책·오류·disabled·보고 없는 대상 확인 |
| readiness source·최신 보고 | live/sample 분리, 늦게 도착한 오래된 observedAt 제외, 동률 reportId 순 확인. 90초/30초 ±1µs 정확 경계는 고정 시각의 함수 보조 검증으로 구분 |
| 앱 재시작 및 전용 DB stop/start | 이벤트 3,363·Snapshot 6·Replay 7·상태 보고 17건 보존. 예전 Snapshot과 새 Snapshot/Replay의 JSON 값 동일 |
| DB 중지 | 신규 조회 4개와 Replay POST의 503 STORAGE_UNAVAILABLE 확인 |
| 검사 | Python 파싱·pip check·git diff --check·README 상대 링크 확인. CI/자동 테스트 파일 추가 없음 |

source=sample로 생성한 신규 이벤트가 정상 경로 검증의 입력이다. 검증 범위는 독립 data 모듈과 실제 PostgreSQL이다. **미검증:** Tetragon 네트워크 실측/정규화 활성화, 실제 상태 전송→core 수신, core 공통 앱과의 실행 통합, 5화면/위치·리플레이 UI·PNG·AI 전체 연결. 일부 소스가 구현됐다는 사실이나 여기의 sample 실행을 전체 통합 완료로 보고하지 않는다.

추가로 확인한 공식 자료: [PostgreSQL JSON 연산](https://www.postgresql.org/docs/17/functions-json.html), [Python 3.12 ipaddress](https://docs.python.org/3.12/library/ipaddress.html), [psycopg cursor_factory](https://www.psycopg.org/psycopg3/docs/advanced/cursors.html). 런타임 버전은 초기 검증과 같은 requirements.lock을 재사용했다.
