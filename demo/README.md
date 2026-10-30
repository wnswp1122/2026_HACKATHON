# 게시판 서버

LiteSOC **AI 기반 서버 보안 모니터링·분석 플랫폼**의 시연용 사용자 서버다. 현재 후속 기준은 **`d960d3f`**의 [Tetragon 5개 화면 구현 계획](https://github.com/wnswp1122/2026_HACKATHON/blob/d960d3feeed6b1693be47e1a1e7cd48c0b911dac/docs/tetragon-screen-plan.md) ([PR #4](https://github.com/wnswp1122/2026_HACKATHON/pull/4))이다. 오래된 로컬 docs나 saas-parallel-development.md와 충돌하면 이 계획을 따른다. 이 브랜치로 다른 담당의 코드를 merge/cherry-pick하지 않았다.

FastAPI + SQLite 게시판 CRUD API다. `server.py`의 lifespan에서 테이블을 준비하고 `posts.py`가 입력 검증과 CRUD를 담당한다. `database.py`는 연결별 커밋·예외 시 롤백·연결 종료를 처리한다.

## 5개 화면 계획에서 게시판의 연결 경계

- 게시판 책임은 기존 CRUD 유지·안전한 시연·관찰 정책 적용 중 동작 확인이다. 5개 화면·센서 상태 전송·이벤트 정규화·AI는 각 담당이 구현한다. 게시판 HTTP 응답이나 SQLite 글을 SaaS 보안 이벤트로 전송하지 않는다.
- `/health`는 게시판 DB 연결만 확인한다. Tetragon 도달 가능 여부·센서·정책 상태·서버 보안 정상의 근거로 사용하지 않는다. 준비 점검은 별도 `/api/sensor-status` 보고를 사용한다.
- 이벤트 수신 v1 봉투와 AI 안전 Snapshot/캡처 allowlist를 유지한다. 게시판에 원격 셸 실행·인증 우회 API, probe, 보호 파일, 상태 수집 API를 추가하지 않는다. 새 공통 필드 요청은 없다.
- 정책 소유자는 tetragon-runtime이다. 게시판 담당은 정책을 직접 적용·해제하지 않으며 `hack-demo`·`hack-tetragon`·그 볼륨을 중지/삭제/교체하지 않는다. 제어가 필요한 시연은 소유자와 검증 구간부터 맞춘다.

## API

| 요청 | 성공 | 동작 |
|---|---|---|
| GET /health | 200 | DB 연결 확인. 연결 불가 시 503 |
| POST /posts | 201 | title, content로 생성한 글 반환 |
| GET /posts | 200 | ID 내림차순 글 배열. 빈 목록은 [] |
| GET /posts/{id} | 200 | 글 반환 |
| PATCH /posts/{id} | 200 | 전달한 필드만 수정한 글 반환 |
| DELETE /posts/{id} | 204 | 삭제, 응답 본문 없음 |

- 글 필드는 `id`, `title`, `content`, `createdAt`, `updatedAt`이다. ID는 서버가 발급하는 양의 64비트 정수이며 삭제한 ID를 재사용하지 않는다. 시각은 UTC ISO 8601이다. 수정 시 createdAt을 보존하고 updatedAt을 갱신한다.
- POST는 title과 content 모두 필요하다. title은 문자열 1~200자이고 공백만 있는 값은 거부한다. 앞뒤 공백을 자동 제거하지 않는다. content는 문자열 최대 10,000자이며 빈 문자열을 허용한다.
- PATCH는 title/content 중 최소 하나가 필요하다. 생략한 필드는 보존하며 명시적 null, 잘못된 타입, 알 수 없는 필드는 422로 거부한다. POST도 null·잘못된 타입·알 수 없는 필드를 거부한다.
- 유효한 형식의 존재하지 않는 ID는 상세·수정·삭제 모두 404다. 입력 검증 실패는 FastAPI 기본 422 응답이다.

로그인·댓글·첨부·프론트·셸 실행 API는 범위 밖이다. Tetragon probe와 보호 파일은 tetragon/ 담당이며 이 컴포넌트에서 작성하지 않는다.

## 로컬 실행

저장소 루트에서 Python 3.12로 독립 가상환경을 만든다. `.env`는 자동 로딩하지 않는다.

```sh
python3.12 -m venv demo/.venv
demo/.venv/bin/python -m pip install -r demo/requirements.lock
demo/.venv/bin/python -m pip check
BOARD_DB_PATH=demo/.local/manual-board.sqlite3 demo/.venv/bin/python -m uvicorn server:app --app-dir demo --host 127.0.0.1 --port 18081
```

BOARD_DB_PATH 미설정 시 `demo/.local/board.sqlite3`, 컨테이너에서는 `/data/board.sqlite3`를 사용한다. 시작할 때 WAL과 테이블을 준비하며 기존 글을 초기화하지 않는다. `.venv`·`.local`·DB는 Git에 넣지 않는다. 종료는 Ctrl+C다.

다음은 재현용 수동 요청이다. `{id}`는 POST 응답의 ID로 바꾼다.

```sh
curl -i http://127.0.0.1:18081/health
curl -i -H 'Content-Type: application/json' -d '{"title":"확인 제목","content":"확인 본문"}' http://127.0.0.1:18081/posts
curl -i http://127.0.0.1:18081/posts
curl -i http://127.0.0.1:18081/posts/{id}
curl -i -X PATCH -H 'Content-Type: application/json' -d '{"content":"수정 본문"}' http://127.0.0.1:18081/posts/{id}
curl -i -X PATCH -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:18081/posts/{id}
curl -i http://127.0.0.1:18081/posts/999999
curl -i -X DELETE http://127.0.0.1:18081/posts/{id}
```

영속성은 삭제하지 않은 글의 전체 응답을 저장하고 서버 종료·동일 DB 경로로 재기동한 뒤 상세/목록 응답과 비교한다. 삭제한 글도 계속 없는지 확인한다.

## 전용 Linux VM 컨테이너

VM `2026-hack-client`가 실행 중이어야 한다. 기본 Docker context를 바꾸지 않고 명령마다 전용 소켓을 지정한다. 게시판 개발용 이름·볼륨·포트는 `hack-board-dev`, `hack-board-dev-data`, VM `127.0.0.1:18081`이다. 내부 포트는 8080이다. 이미 같은 이름이 있으면 소유·상태부터 확인하며 다른 담당의 `hack-demo`·`hack-tetragon`을 조작하지 않는다.

```sh
board_docker_socket="unix://$HOME/.lima/2026-hack-client/sock/docker.sock"
docker --host "$board_docker_socket" ps -a
docker --host "$board_docker_socket" build -t hack-board-dev:local demo
docker --host "$board_docker_socket" volume create hack-board-dev-data
docker --host "$board_docker_socket" run -d --name hack-board-dev -p 127.0.0.1:18081:8080 -v hack-board-dev-data:/data hack-board-dev:local
limactl shell 2026-hack-client curl --fail --silent http://127.0.0.1:18081/health
limactl shell 2026-hack-client curl --fail --silent http://127.0.0.1:18081/posts
```

현재 Lima 설정은 Mac에 8081만 전달한다. 컨테이너의 18081 확인은 VM 내부에서 수행한다. Mac의 18081은 위 로컬 Python 서버를 실행했을 때 접근할 수 있다. 공통 VM 설정은 수정하지 않는다.

자신의 개발 컨테이너만 삭제·재생성해 동일 볼륨의 영속성을 확인하는 명령:

```sh
docker --host "$board_docker_socket" stop hack-board-dev
docker --host "$board_docker_socket" rm hack-board-dev
docker --host "$board_docker_socket" run -d --name hack-board-dev -p 127.0.0.1:18081:8080 -v hack-board-dev-data:/data hack-board-dev:local
limactl shell 2026-hack-client curl --fail --silent http://127.0.0.1:18081/posts
```

검증 후 개발 컨테이너와 독립 볼륨은 재확인용으로 유지했다. 중지는 위 stop 명령으로 할 수 있다. 공유 VM은 중지하지 않는다. Dockerfile은 추가한 `posts.py`를 COPY하며 기존 lock과 비루트 사용자(app, UID 10001)를 유지한다.

## 2026-10-31 직접 확인한 결과

기준 커밋 `1e94262`에서 기능을 추가했다. 아래는 문서 예시를 인용한 결과가 아니라, 실행한 서버에 Python 표준 라이브러리 urllib로 일회성 HTTP 요청을 보내 확인한 결과다. 자동 테스트 파일이나 CI는 추가하지 않았다. 입력 글은 직접 작성한 검증용 문자열이며 실제 사용자 데이터·Tetragon 이벤트가 아니다.

| 환경·항목 | 실제 결과 |
|---|---|
| 로컬 의존성 | Python 3.12.2, FastAPI 0.162.0 / Uvicorn 0.54.0 / Pydantic 2.14.2. demo/requirements.lock으로 설치, pip check 성공 |
| 로컬 기동 | 위 BOARD_DB_PATH·18081 명령으로 실제 실행, health 200과 빈 목록 [] 확인 |
| CRUD | 생성 201, 목록/상세/제목만·내용만·두 필드 수정 200, 삭제 204와 본문 0바이트. 삭제 뒤 상세/재삭제 404 |
| 필드·시각 | 응답의 5개 필드, ID 내림차순, 한글·emoji·작은따옴표 저장/조회, createdAt 유지·updatedAt 증가 확인 |
| 길이 경계 | 제목 1/200자, 내용 0/10000자 허용. 빈/공백만 제목, 201자 제목, 10001자 내용은 422 |
| 기타 입력 오류 | POST 필수값 누락/null/숫자/추가 필드, PATCH 빈 객체/null/숫자/추가 필드 422. 실패 PATCH 뒤 기존 글 전체 값 유지 |
| 없는 ID | GET/PATCH/DELETE /posts/999999 모두 404. 숫자가 아닌 ID와 64비트 범위 초과 ID는 422 |
| 로컬 재시작 | Ctrl+C 후 같은 기동 명령으로 재시작. 남긴 글의 id/title/content/createdAt/updatedAt 전체 일치, 삭제한 글 복구되지 않음 |
| 트랜잭션 | 별도 demo/.local/rollback.sqlite3에서 INSERT 후 의도적 Python 예외 발생. 다음 연결의 글 개수 0으로 롤백 확인. 로컬 SQLite 3.51.0 |
| health 실패·복구 | 임시 DB의 상위 디렉터리를 파일로 바꿔 연결 실패 유도: HTTP 503, Database unavailable. 경로 복구 후 200. 임시 서버/파일 정리 |
| 컨테이너 | 전용 VM kernel 6.8.0-142-generic. 위 build/run 성공, Python 3.12.16 / SQLite 3.40.1 / UID 10001, pip check 성공 |
| 컨테이너 API | VM 내부 18081에서 health/CRUD, 공백·길이 초과·빈 PATCH·null의 422, 없는 글 404, 빈 본문 삭제 204 확인 |
| 컨테이너 영속성 | hack-board-dev stop/rm/run 수행. hack-board-dev-data 재사용 후 남긴 글 전체 5개 필드 일치, 삭제한 글은 목록에 없음, health 200 |
| 최종 OpenAPI/PATCH | PATCH 필드는 생략 가능·문자열만 허용으로 표시하며 null 허용 표시는 없음. 이미지 재빌드 후 OpenAPI 200, PATCH 성공/422/기존 값 보존과 CRUD 재확인 |

최초 Mac → 컨테이너 18081 요청은 Connection refused였다. 서버 로그와 VM 내부 curl의 200을 확인하고, dev/lima.yaml의 8081 전용 전달 설정을 확인해 이후 컨테이너 요청은 VM 내부에서 수행했다.

**이 최초 CRUD 구현 단계의 미확인:** Tetragon 정책 적용 중 CRUD 유지, probe/보호 파일, 실제 보안 이벤트 수집·전송·SaaS·프론트 통합. 이후 관찰 구간의 추가 확인은 아래 기록과 구분한다. 공통 문서의 health-only 상태 설명은 담당 외 범위라 수정하지 않았다.

## 안전한 게시판 시연 순서

1. Tetragon 담당에게 정책명·enabled 여부·실행 대상·검증 구간을 확인한다. 컨테이너 소유 label, 실제 mount namespace, `/openapi.json`을 조회해 포트와 구현을 구분한다. `/posts`가 없는 서버를 CRUD 성공으로 표시하지 않는다.
2. 게시판 개발은 VM `127.0.0.1:18081`의 `hack-board-dev`를 사용한다. 생성 전에 기존 글 목록을 확인하고 `board-observe-<새 UUID>`처럼 이번 실행만의 표식을 제목에 쓴다. 실제 사용자/비밀 데이터를 넣지 않는다.
3. POST 응답의 ID를 기록한 뒤 그 ID의 상세·PATCH·목록 포함을 확인한다. 빈 PATCH/공백 제목/길이 초과를 요청해 422와 원래 값 보존을 확인한다. 존재하지 않는 글의 응답은 404다.
4. 삭제 직전 GET으로 기록한 ID와 UUID 제목이 모두 일치하는지 확인한다. 그 글만 DELETE하고 204·빈 본문·후속 GET 404를 확인한다. 목록 전체 삭제, DB 초기화, ID 범위 삭제는 하지 않는다. 생성 응답이 불명확하면 재생성/전체 삭제하지 말고 표식으로 목록을 조사한다.
5. 기존 글의 값이 유지됐는지 확인한다. 전후 정책 상태와 양쪽 health를 기록하고 Tetragon 담당에게 검증 구간 종료를 알린다. 독립 볼륨/컨테이너를 재시작할 때에도 소유 자원만 다루며 공유 VM은 유지한다.

소유·관찰 상태를 읽는 명령(정책 적용 명령이 아님):

```sh
board_docker_socket="unix://$HOME/.lima/2026-hack-client/sock/docker.sock"
docker --host "$board_docker_socket" inspect hack-demo hack-board-dev hack-tetragon --format '{{.Name}} labels={{json .Config.Labels}} image={{.Config.Image}}'
docker --host "$board_docker_socket" exec hack-tetragon tetra --server-address unix:///var/run/tetragon/tetragon.sock tracingpolicy list -o json
docker --host "$board_docker_socket" exec hack-demo readlink /proc/self/ns/mnt
docker --host "$board_docker_socket" exec hack-board-dev readlink /proc/self/ns/mnt
limactl shell 2026-hack-client curl --fail --silent http://127.0.0.1:8081/openapi.json
limactl shell 2026-hack-client curl --fail --silent http://127.0.0.1:18081/openapi.json
```

## d960d3f 후속: 관찰 구간의 실제 수동 확인

2026-10-31 **04:37:01.614~04:37:02.316 KST**(UTC 2026-10-30 19:37:01.614~19:37:02.316)에 실행했다. Tetragon 담당이 기존 Orca 작업으로 관찰 구간을 제공했고, 위 CLI로 요청 전후 모두 `hack-demo-observe / TP_STATE_ENABLED / TP_MODE_MONITOR_ONLY`를 직접 확인했다. HTTP는 VM의 Python 표준 라이브러리 urllib로 일회성 요청을 보냈다. 요약 원본은 [observation-crud.json](evidence/observation-crud.json)에 저장했다. 자동 테스트/CI는 추가하지 않았다.

| 실제 대상 | 확인 결과 | 해석 범위 |
|---|---|---|
| `hack-board-dev:18081` | health 200, POST 201, 상세/목록/PATCH 200, 빈 PATCH/null/공백/201자 제목/10001자 내용 422, 삭제 204·빈 본문, 삭제 후 404 | 관찰 정책이 enabled인 같은 VM에서 독립 게시판 CRUD 유지 |
| `hack-demo:8081` | health 200, OpenAPI 경로는 `/health`만 존재, GET /posts 404 | 관찰 대상 컨테이너는 health-only. 같은 대상 컨테이너의 CRUD는 확인 불가 |
| 생성·정리 | 이번 생성 ID 4, UUID 제목을 재확인한 뒤 해당 글만 삭제. 기존 글 1건의 전체 값 불변, 종료 후 목록도 1건 | 타인/기존 데이터와 DB/볼륨을 정리하지 않음 |
| 컨테이너 경계 | 당시 hack-demo mount namespace `4026532395`, hack-board-dev `4026532323` | 서로 다른 namespace. 재기동 후 번호를 재조회하며 고정값으로 사용하지 않음 |

이번 확인 중 정책·보호 파일·probe·타인 컨테이너를 변경하거나 새 네트워크 정책을 실행하지 않았다. Tetragon 담당에게 확인 완료와 구간 종료 가능 상태를 전달했다.

## 조정 담당·다른 담당에게 전달할 사항

- **확인한 파일 정책:** `hack-demo-observe`는 `/usr/local/bin/hack-demo-probe` AND 현재 hack-demo mount namespace AND `/tmp/hack-demo/protected.txt` AND `MAY_READ=4`에만 Post 관찰한다. 일반 웹 서버 Python과 SQLite 파일은 이 정책의 대상이 아니다. 게시판 글 내용·SQL·HTTP 요청 단위가 관찰됐다고 주장하지 않는다.
- **공통 정규화 연결:** 알려진 정책/훅 `security_file_permission`에서 `process_kprobe.args[0].file_arg.path`, `args[1].int_arg=4`를 확인해야 파일 접근 근거로 쓸 수 있다. 새 필드 `file`/`network`/`process.parentExecId`와 정책별 원본 타입·매핑은 Tetragon 증거에 따라 core가 구현하며 게시판이 임의 생성하지 않는다. `reportedAction`을 성공 결과로 바꾸지 않고 outcome은 unknown을 유지한다.
- **준비 중인 네트워크:** 담당이 알려준 이름은 `hack-demo-network`, 별도 net-probe binary + 같은 컨테이너 namespace + `127.0.0.1`의 8080/18080 connect에 Post만 적용할 계획이다. 이 게시판 검증 시점에는 live 미검증이다. 정확 binary/원본 필드·타입과 최종 매핑은 담당 완료 후 수령해야 한다. connect 관찰을 연결 성공·전송량·공격으로 해석하지 않는다.
- **남은 연결 입력:** 같은 대상에서 CRUD 시연이 필요하면 Tetragon 소유자가 현재 CRUD 이미지와 기존 볼륨/probe mount를 맞춘 다음 재검증 구간을 제공해야 한다. 이 작업에서 hack-demo를 교체하거나 정책 대상을 넓히지 않는다. 독립 게시판의 정상 결과로 이 항목을 완료 처리하지 않는다.
- **통합 미검증:** 실제 live 전송기→SaaS 저장→5개 화면, 준비 상태 전송/신선도, 고정 Replay·Snapshot·PNG·실제 AI는 이 작업에서 확인하지 않았다. 과거 실측을 재생하면 sample이며, 위 기록은 실제 HTTP 실행 결과이지 보안 이벤트 봉투나 전송 성공 증거가 아니다.

공통 범위는 [클라이언트 지침](../docs/client-development.md), 환경은 [개발 환경](../docs/local-development.md), 통합 시나리오는 [수동 확인](../docs/manual-verification.md)을 따른다.
