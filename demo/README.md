# 게시판 서버

FastAPI + SQLite 게시판 CRUD API다. `server.py`의 lifespan에서 테이블을 준비하고 `posts.py`가 입력 검증과 CRUD를 담당한다. `database.py`는 연결별 커밋·예외 시 롤백·연결 종료를 처리한다.

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

**미확인:** Tetragon 정책 적용 중 CRUD 유지, probe/보호 파일, 실제 보안 이벤트 수집·전송·SaaS·프론트 통합은 이번 게시판 검증에 포함하지 않았다. 공통 데이터 계약 변경은 필요하지 않다. 공통 문서의 health-only 상태 설명은 담당 외 범위라 수정하지 않았으며 통합 시 갱신이 필요하다.

공통 범위는 [클라이언트 지침](../docs/client-development.md), 환경은 [개발 환경](../docs/local-development.md), 통합 시나리오는 [수동 확인](../docs/manual-verification.md)을 따른다.
