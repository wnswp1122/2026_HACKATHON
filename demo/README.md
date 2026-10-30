# 게시판 서버 개발 지침

사용자 담당. 프론트 없는 간단한 FastAPI + SQLite CRUD API를 구현한다. 현재 문서는 구현 기준이며 코드는 아직 없다.

## 범위

- GET /health → 200 상태.
- POST /posts → 201, GET /posts → 200 목록.
- GET/PATCH/DELETE /posts/{id} → 상세·수정·삭제. 없는 ID는 404.
- 글: id, title, content, createdAt, updatedAt. 제목 1~200자(공백만 거부), 내용 최대 10,000자. PATCH는 하나 이상의 필드, 삭제는 204.
- SQLite는 BOARD_DB_PATH 설정, 컨테이너 기본 /data/board.sqlite3. 볼륨으로 재시작 후 유지한다.
- 로그인·댓글·첨부·게시판 프론트·임의 명령 실행 API는 제외한다.

## 소유 파일·연결

demo/ 안에 앱, requirements.txt, Dockerfile, 실행 README를 작성한다. 공통 docs/·backend/·frontend/는 수정하지 않는다. 컨테이너 이름 hack-demo, 내부 8080/호스트 8081을 사용한다. 다른 워크트리와 로컬 실행 포트가 충돌하면 별도 포트를 명시한다.

Tetragon probe와 보호 파일 준비는 tetragon/ 담당이다. 게시판 DB·웹 서버는 시연 대응 대상이 아니다. 게시판 담당이 probe를 중복 작성하지 않는다.

## 확인

CRUD, 유효성 오류, 없는 ID, 재시작 후 저장 유지, 컨테이너 기동을 직접 확인한다. 실패/미확인 사항과 정확한 실행 명령을 이 README에 반영한다. 환경은 [개발 환경](../docs/local-development.md), 공통 범위는 [클라이언트 지침](../docs/client-development.md)을 따른다.
