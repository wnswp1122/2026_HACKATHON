# 로컬 개발환경

사용자 담당의 게시판·Tetragon·전송기 환경을 먼저 준비한다. SaaS·프론트 구현은 다른 팀원 담당이다. 실제 설치·기동 확인은 환경 준비 후 이 문서에 기록한다.

## 배치·설정 계약

- macOS: 코드·Orca 워크트리·Python 3.12 개발 가상환경.
- 별도 Linux VM: Docker, 게시판, Tetragon, 전송기. Docker Desktop의 커널 호환성을 가정하지 않는다.
- VM 런타임 데이터: ~/2026-hack-runtime/. JSONL은 tetragon/events.jsonl, 게시판 SQLite는 컨테이너 /data 볼륨.
- SaaS URL은 팀원이 제공하는 VM에서 접근 가능한 주소를 사용한다. VM localhost는 Mac의 localhost가 아니다.
- 워크트리마다 .venv를 만들며 .env·.local·DB·원본 런타임 데이터는 커밋하지 않는다.

| 변수 | 의미 |
|---|---|
| EVENTS_URL | SaaS 수신 전체 URL, /api/events 포함 |
| INSTANCE_ID | 관찰 대상 식별자, 예 board-server-01 |
| INGEST_TOKEN | SaaS에서 허용한 토큰. 예시 파일에는 빈 값만 |
| TETRAGON_LOG_PATH | 현재 실행 호스트에서 읽을 JSONL 절대 경로 |
| BOARD_DB_PATH | 게시판 SQLite 파일, 컨테이너 기본 /data/board.sqlite3 |

코드는 환경변수를 읽는다. .env 자동 로딩을 가정하지 않는다. 기존 .env를 덮어쓰지 않고 직접 작성한 신뢰할 수 있는 로컬 설정만 로드한다. 토큰은 셸 명령 인자·출력에 넣지 않는다.

## 환경과 기능 검증 구분

의존성 설치와 Docker 실행만으로 게시판 CRUD·Tetragon 정책·실제 SaaS 수신을 확인한 것은 아니다. 환경 준비 단계의 재현 파일과 검증 기록을 추가한 뒤 [클라이언트 개발 지침](client-development.md)에 따라 기능 개발을 시작한다.
