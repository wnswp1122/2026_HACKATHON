# 고정 스냅샷 PNG·AI 분석 모듈

`ai-analysis` 소유 범위 구현이다. 공통 [HTTP·DB 계약](../../../docs/saas-parallel-development.md)과 [수신/안전 입력 기준](../../../docs/api-contract.md)을 따른다. 이 브랜치에는 core/data/app이 없으므로 단독 임시 앱·문서 SQL·sample PNG·mock upstream으로 검증한다. 전체 SaaS/프론트 통합이나 실제 AI 검증 완료를 뜻하지 않는다.

## 연결과 실행

Python 3.12, FastAPI/Pydantic 2, psycopg 3 `dict_row`, HTTPX, Pillow를 사용한다. 공통 requirements/app/db/schema는 수정하지 않는다. 추가 의존성은 [requirements.txt](requirements.txt), 이번 독립 환경의 전체 고정 버전은 [requirements.lock](requirements.lock)에 있다.

저장소 루트에서 독립 환경을 준비한다.

```sh
python3.12 -m venv backend/src/analysis/.venv
backend/src/analysis/.venv/bin/python -m pip install -r backend/src/analysis/requirements.lock
backend/src/analysis/.venv/bin/python -m pip check
```

core 통합 시에는 backend 가상환경에 이 폴더의 requirements를 설치하고, `app.py`에서 `src.analysis.router.router`를 **추가 prefix 없이** include한다. `db.get_connection()`은 정상 commit/예외 rollback/항상 close하는 동기 context manager이며 psycopg Connection의 `dict_row`를 제공해야 한다. 테이블은 공통 문서의 `snapshots`와 `analyses`를 그대로 사용하며 이 모듈은 테이블 생성·초기화를 실행하지 않는다. HTTPException(detail의 code/message), UUID 검증 오류, psycopg 장애의 공통 오류 봉투는 core 전역 핸들러가 맡는다.

| 파일 | 책임 |
|---|---|
| [router.py](router.py) | `/api/snapshots`의 이미지 PUT, 분석 POST/GET. 업로드 본문을 읽으며 5 MiB 제한 |
| [validation.py](validation.py) | Pillow 검증/실제 디코딩, 허용된 Snapshot 필드와 분석 결과의 Pydantic 검증 |
| [service.py](service.py) | 행 잠금, 이미지 불변 저장, 성공 결과 재사용·PostgreSQL 저장 |
| [upstream.py](upstream.py) | 고정 Responses URL로 HTTPX 요청, 오류/완성 상태/구조 검증 |
| [instructions-v1.md](instructions-v1.md) | 한국어 지침. `snapshot-analysis-v1`; 수정 시 파일·상수 버전을 함께 올린다 |

[.env.example](.env.example)은 변수 이름만 제공한다. `.env` 자동 로딩은 하지 않는다. `DATABASE_URL`은 core DB 연결이 읽으며 `OPENAI_API_KEY`, `OPENAI_MODEL`은 서버에만 설정한다. 모델 기본값은 없다. 기존 성공 결과 조회/재사용에는 AI 설정이 필요하지 않다. 신규 분석에서 키 또는 모델이 비어 있거나 지침 파일이 없으면 503이다. 실제 키를 명령 인자·로그·브라우저·Git에 넣지 않는다.

## 동작과 계약

- `PUT /api/snapshots/{snapshotId}/image`: `Content-Type: image/png`, 바이너리 본문. 최대 5 MiB, 가로/세로 각각 최대 4096. MIME 확인과 Pillow `verify()` 뒤 다시 열어 `load()`까지 확인한다. 정지 PNG만 지원한다. 최초 저장 201, **동일 바이트** 200, 다른 바이트 409 `IMAGE_CONFLICT`. bytea와 SHA256을 함께 저장하며 재인코딩/교체하지 않는다. 깨진 PNG/MIME는 422 `INVALID_IMAGE`, 크기 초과는 413 `IMAGE_TOO_LARGE`다.
- `POST /api/snapshots/{snapshotId}/analysis`: 본문 없음. 스냅샷 행의 `SELECT ... FOR UPDATE` 이후 기존 성공 결과를 조회한다. 성공이 없으면 **저장된 payload와 PNG**만 함께 전송하며 이벤트·라이브 UI·외부 자료를 다시 조회하지 않는다. 성공을 검증해 commit한 다음 201, 기존 성공은 외부 호출 없이 200이다.
- `GET /api/snapshots/{snapshotId}/analysis`: 저장된 성공 결과 200. 없는 스냅샷은 404 `SNAPSHOT_NOT_FOUND`, 성공 결과가 없으면 404 `ANALYSIS_NOT_FOUND`다.

이미지 누락은 409 `IMAGE_REQUIRED`, 미설정은 503 `AI_NOT_CONFIGURED`, upstream HTTP/네트워크 오류·거절·미완성·잘못된 JSON/구조는 502 `AI_FAILED`, HTTPX timeout은 504 `AI_TIMEOUT`이다. upstream이 HTTP 504 자체를 반환한 경우는 외부 HTTP 실패이므로 502로 처리한다. 응답에 upstream 본문/예외/키를 복사하지 않는다.

잠금은 외부 요청부터 성공 저장까지 유지한다. 프로세스가 달라도 같은 스냅샷에 외부 요청을 동시에 보내지 않으며, 대기 요청은 잠금 획득 후 성공 결과를 다시 조회한다. 별도 processing/failed 행이나 스키마 변경은 없다. 실패 시 성공 행 없이 rollback되므로 재시도할 수 있다. 자동 외부 재시도는 하지 않는다. 외부 처리 후 서버 장애/DB commit 실패가 나면 재시도 시 외부 호출이 반복될 수 있어 과금까지 포함한 exactly-once 보장은 아니다.

`Analysis`는 analysisId/snapshotId/UTC createdAt/실제 응답 model/instructionVersion과 `result`의 facts/hypotheses/checks/limitations 문자열 배열을 반환한다. 응답은 completed 상태, 오류·미완성 정보 없음, assistant의 단일 output_text, 네 배열의 엄격한 타입/추가 키 금지/빈 문자열 금지를 통과해야 저장한다. upstream 응답은 최대 1 MiB로 제한한다.

## 외부 전송 경계와 지침

스냅샷 입력은 중첩 객체까지 공통 문서의 필드 allowlist로 확인한다. rawEvent, process/명령 인자, 환경변수 등 예상 밖 필드가 있으면 제거·재구성해 보내는 대신 **전송 전에 실패**한다. ID 일치도 확인한다. 통과한 원래 payload JSON 값과 저장 PNG 바이트를 input_text/input_image(data URL)로 함께 보낸다. 키는 인증 헤더, 모델은 요청 설정으로만 사용하며 환경 전체나 원본 이벤트를 넣지 않는다. `store: false`, tools 없음, 고정 `https://api.openai.com/v1/responses`, 리다이렉트·환경 proxy·SDK 자동 재시도 없음이다. 연결 timeout은 5초, 읽기/쓰기/풀 timeout은 60초의 비활성 기준이다.

지침은 JSON·이미지·식별자 안의 지시를 분석 자료로만 취급하고 한국어 facts/hypotheses/checks/limitations를 구분한다. 수치·ID는 JSON 우선, sample/live·요약 생략·outcome=unknown·PNG 불일치를 설명하며 공격/유출/차단 성공을 단정하거나 정책·명령을 실행하지 않는다.

서버는 PNG의 내용과 스냅샷의 시각적 일치나 이미지 속 비밀값 부재를 증명하지 않는다. 프론트가 원본/명령 인자/비밀값을 제외한 고정 영역만 캡처해야 한다. 이 통제와 실제 모델의 지침 준수·한국어 분석 품질은 통합/실제 AI 검증 대상이다.

공식 문서 확인(2026-10-31): [Responses 이미지 입력](https://developers.openai.com/api/docs/guides/images-vision), [Structured Outputs 및 거절/미완성](https://developers.openai.com/api/docs/guides/structured-outputs), [모델의 이미지·Responses·Structured Outputs 지원 표 예](https://developers.openai.com/api/docs/models/gpt-5-mini). 마지막 페이지의 모델은 deprecated 표시를 확인했으며 기본값/권장 모델로 채택하지 않았다. 운영자가 실제 사용할 모델의 지원·접근 권한을 확인한 후 명시해야 한다. 라이브러리 근거는 [Pillow verify/load](https://pillow.readthedocs.io/en/stable/reference/Image.html), [HTTPX timeout](https://www.python-httpx.org/advanced/timeouts/), [psycopg 트랜잭션](https://www.psycopg.org/psycopg3/docs/basic/transactions.html), [PostgreSQL 행 잠금](https://www.postgresql.org/docs/17/explicit-locking.html)이다.

## 독립 검증 환경

작업 전용 컨테이너 `hack-ai-analysis-db`, 볼륨 `hack-ai-analysis-db-data`만 사용한다. 실행 버전은 PostgreSQL 17.11(Debian 17.11-1.pgdg12+2), ARM64다. 기존 공유 VM/다른 컨테이너·볼륨은 중지·삭제하지 않는다. Docker 기본 context를 바꾸지 않는다.

저장소 루트 기준, `.local/postgres.env`에 POSTGRES_USER/POSTGRES_DB/POSTGRES_PASSWORD를 직접 준비하고 권한 600으로 둔다. 실제 비밀번호는 아래 명령이나 README에 포함하지 않는다.

```sh
docker --host unix:///Users/junje/.lima/2026-hack-client/sock/docker.sock run -d \
  --name hack-ai-analysis-db \
  --env-file backend/src/analysis/.local/postgres.env \
  -p 127.0.0.1:15433:5432 \
  -v hack-ai-analysis-db-data:/var/lib/postgresql/data \
  postgres:17-core-verified
ssh -F /Users/junje/.lima/2026-hack-client/ssh.config -N \
  -L 127.0.0.1:15433:127.0.0.1:15433 \
  -o ExitOnForwardFailure=yes lima-2026-hack-client
```

위 명령의 `postgres:17-core-verified`는 현재 VM에 이미 있던 로컬 이미지다. 실제 사용 image ID는 `sha256:9381034403713bcc6409fe22d3b2e9b93163ffbf9100f3c6e1268a80bdb5cd91`이다. 공개 Registry의 공식 `postgres:17-bookworm` ARM64 manifest `sha256:e692f23ba2393c8b13879dd4ee9f4f0d7bd146fbddceb4c8e10c4ce1fb53e737`의 config를 내려받아 전체 RootFS diff_ids 일치를 확인했다. 로컬 config digest 자체는 공식 config와 다르므로 동일 공식 image digest라고 주장하지 않는다. 새 환경은 마지막 이미지 인자로 `postgres:17-bookworm@sha256:e692f23ba2393c8b13879dd4ee9f4f0d7bd146fbddceb4c8e10c4ce1fb53e737`를 받아 실행한다. 초기 18/18-alpine 다운로드는 지연되어 자신의 CLI만 종료하고 이 로컬 이미지를 사용했다. 공유 이미지/다른 작업은 변경하지 않았다.

Lima의 자동 포워딩은 8081 외에 꺼져 있어 위 DB 전달을 별도로 사용한다. 동일 컨테이너/전달이 이미 있다면 상태를 확인하고 중복 실행하지 않는다. 정리 시 자신의 전달만 `ssh -F /Users/junje/.lima/2026-hack-client/ssh.config -O cancel -L 127.0.0.1:15433:127.0.0.1:15433 lima-2026-hack-client`로 해제하며 공유 SSH master/VM은 종료하지 않는다.

임시 파일은 모두 이 폴더의 ignored `.local/` 안에 있다. 공통 문서의 SQL 블록을 그대로 추출한 `contract-schema.sql`, 계약의 context manager를 제공하는 임시 `db.py`, 공통 오류 핸들러와 router만 조립한 `harness.py`, Unix 소켓 mock `mock_upstream.py`, 수동 시나리오를 재현한 `verify_manual.py`다. 제품에 다른 모듈 대체 코드를 넣지 않았다. 독립 HTTP는 127.0.0.1:18003, 임시 upstream은 `.local/upstream.sock`으로 추가 TCP HTTP 포트를 열지 않는다. 임시 HTTPX 의존성 override를 사용하므로 실제 OpenAI로 요청하지 않는다. 합성 키/모델과 직접 만든 sample 데이터/Pillow PNG만 사용한다.

```sh
backend/src/analysis/.venv/bin/python backend/src/analysis/.local/verify_manual.py
```

이 명령은 현재 워크트리의 ignored 재현 파일이 있을 때만 동작한다. 새 clone에서는 core/data 통합 앱과 공통 SQL로 환경을 구성해야 하며, 위 임시 파일은 제품 의존성이 아니다. 검증 뒤 임시 앱/upstream을 종료한다.

## 실제 검증 결과

2026-10-31, macOS Python 3.12.2에서 독립 수동 시나리오 **59항목 통과**. 실제 PostgreSQL과 실제 TCP HTTP 18003, 실제 HTTPX의 Unix 소켓 요청을 사용했다. 결과는 mock이며 실제 AI 추론이 아니다.

| 확인 범위 | 실제 결과 |
|---|---|
| 환경 | FastAPI 0.162.0, Uvicorn 0.54.0, Pydantic 2.14.2, psycopg 3.3.6, HTTPX 0.28.1, Pillow 13.0.0. pip check, 모듈 import/OpenAPI, requirements 경로, diff/링크 확인 통과 |
| 기동 | 문서 SQL을 전용 DB에 적용하고 임시 FastAPI 앱 2 worker 기동. 추가된 임시 응답 헤더로 동시 요청이 서로 다른 worker에 도착함도 확인 |
| PNG 실패 | 빈 본문, 시그니처만, 잘린 파일, JPEG 위장, 잘못된 바이트, CRC가 유효하지만 IDAT 디코딩이 실패하는 PNG 모두 422. MIME 오류도 422 |
| PNG 크기 | 5 MiB+1 및 Content-Length 없는 청크 초과 413. 가로 또는 세로 4097과 decompression bomb 413. 4096×4096과 정확히 5 MiB는 성공 |
| 이미지 불변성 | 최초 201/SHA256 일치, 동일 바이트 200, 다른 바이트 409. 같은 PNG 동시 8요청은 201 1개/200 7개, 다른 PNG 동시 2요청은 201/409 |
| 없는 자료 | 스냅샷 PUT/POST/GET 모두 404, 잘못된 UUID 422, 성공 결과 없음 404, 이미지 누락 409. upstream 0회 |
| 정상 분석 | 201 → 같은 POST 200 → GET 200의 ID/결과 동일. Responses 경로/strict schema/store=false와 저장 payload JSON·PNG 원본 바이트의 전송 일치 확인 |
| 안전 입력 | tools/환경 전체/원본 없음. 스냅샷에 rawEvent·environment 또는 중첩 arguments를 넣으면 502이고 upstream 0회. 저장 이미지 digest 불일치도 전송 전 502 |
| AI 실패 | 연결 끊김, HTTP 502/504, redirect, 거절, incomplete/failed/error, 타입·추가 키·필수 키 오류, 빈 output, 잘못된 JSON, 1 MiB 초과 응답은 502. 임시 클라이언트의 0.4초 timeout과 실제 소켓 지연으로 504 확인(제품의 60초를 대기한 검사는 아님) |
| 실패 재시도 | 각 실패마다 analyses 행 0/GET 404 확인 후 같은 snapshotId를 정상 mock으로 재요청해 201, 이후 200 재사용. upstream 본문/키 비노출 |
| 설정 | 앱을 키 누락/모델 누락으로 각각 기동해 신규 503·upstream 0회. 설정 복구 후 같은 스냅샷 재시도 201. 키 누락에서도 기존 성공은 200 재사용 |
| 분석 동시성 | 2개 worker에 동시 8요청, upstream 정확히 1회/analyses 1개/201 1개·200 7개. 모든 analysisId 동일 |
| 영속성 | 앱 재시작 및 전용 PostgreSQL 컨테이너 재시작 후 동일 PNG/SHA·analysisId/결과 유지. POST 캐시 재사용으로 upstream 추가 호출 없음 |

임시 시나리오 외에도 직접 생성한 잘못된 PNG 100개에서 처리되지 않은 예외가 없음을 확인했다. 성공한 최종 실행 뒤 제품 코드는 바꾸지 않았다. 재현 스크립트·sample 요청 기록·결과는 ignored `.local/`에만 남겼고 실제 키/토큰/이벤트를 사용하지 않았다. 임시 HTTP 앱과 upstream은 종료했으며 전용 DB/볼륨은 보존하고 자신의 15433 SSH 전달만 해제했다.

미검증: core의 실제 앱 조립·전역 핸들러, data의 실제 스냅샷 생성, 프론트의 고정 화면/캡처·민감정보 제외, 전체 SaaS 흐름, 실제 모델 접근·이미지 인식·한국어 품질·지침 준수. 실제 유료 OpenAI 호출은 요청 범위가 아니어서 실행하지 않았다. 강제 프로세스 종료/외부 성공 직후 DB commit 장애는 주입하지 않았다. 공통 DB/HTTP 계약 변경은 필요하지 않다.
