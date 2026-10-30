# 로컬 개발환경

사용자 담당의 게시판·Tetragon·전송기 환경을 먼저 준비한다. SaaS·프론트 구현은 다른 팀원 담당이다. 2026-10-31 환경·프레임워크 실행을 확인했다. 아래 검증 기록과 기능 미완료 범위를 구분한다.

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

## 프레임워크 준비와 실행

각 워크트리 루트에서 실행한다. Python 3.12가 필요하다. 의존성 범위는 requirements.txt, 검증한 전체 버전은 requirements.lock에 있다. 가상환경 자체는 Git으로 전달하지 않고 아래 명령으로 재현한다.

```sh
python3.12 -m venv demo/.venv
demo/.venv/bin/python -m pip install -r demo/requirements.lock
demo/.venv/bin/python -m pip check
python3.12 -m venv event-forwarder/.venv
event-forwarder/.venv/bin/python -m pip install -r event-forwarder/requirements.lock
event-forwarder/.venv/bin/python -m pip check
```

게시판 프레임워크 기동:

```sh
demo/.venv/bin/python -m uvicorn server:app --app-dir demo --host 127.0.0.1 --port 8081
curl http://127.0.0.1:8081/health
```

현재 /health와 /openapi.json, SQLite 연결·트랜잭션 기반만 있다. CRUD는 demo-board 작업에서 추가한다. BOARD_DB_PATH 미설정 시 demo/.local/board.sqlite3를 사용한다.

전송기는 실제 토큰과 경로를 환경변수에 준비한 뒤 아래 명령으로 설정만 검사한다. 네트워크 요청은 보내지 않는다. follow/replay는 event-forwarder 작업에서 추가한다.

```sh
event-forwarder/.venv/bin/python event-forwarder/main.py --check-config
```

## Linux VM 재현

Apple Silicon macOS + Lima 2.2.1 기준이다. Ubuntu 24.04 ARM64 이미지 URL과 SHA256은 dev/lima.yaml에 고정했다. 오래된 이미지가 내려가면 새 이미지의 출처·해시를 검증한 후 설정을 갱신한다. 호스트 홈은 VM에 마운트하지 않는다.

```sh
brew install lima
limactl validate dev/lima.yaml
limactl start --name=2026-hack-client --tty=false dev/lima.yaml
# 이미 생성한 VM 재시작
limactl start 2026-hack-client
# VM 안에서 실행
limactl shell 2026-hack-client uname -r
limactl shell 2026-hack-client test -r /sys/kernel/btf/vmlinux
limactl shell 2026-hack-client sudo docker info
```

전용 VM은 4 CPU·6GiB RAM·30GiB 디스크다. VM 설정 파일은 기존 VM에 자동 재적용되지 않는다. 기존 VM을 삭제해 맞추지 말고 필요한 변경을 별도 적용·기록한다. 기본 Docker context를 변경하지 않는다. 호스트 Docker CLI에는 아래 전용 소켓을 명령별로 명시한다.

```sh
# limactl list의 Dir에 대응하는 소켓. $HOME은 읽기만 한다.
docker --host "unix://$HOME/.lima/2026-hack-client/sock/docker.sock" info
docker --host "unix://$HOME/.lima/2026-hack-client/sock/docker.sock" build -t hack-demo:local demo
docker --host "unix://$HOME/.lima/2026-hack-client/sock/docker.sock" run -d --name hack-demo -p 127.0.0.1:8081:8080 -v hack-board-data:/data hack-demo:local
```

동일 이름의 컨테이너가 있으면 담당·상태를 먼저 확인한다. 같은 VM에서 다른 작업의 컨테이너·볼륨을 삭제하거나 정책을 중복 적용하지 않는다. 병렬 개발 중 게시판 담당은 hack-board-dev(예: 호스트 18081), Tetragon 담당은 hack-tetragon과 정책 시연용 hack-demo(8081)를 소유한다. Tetragon 담당은 자신의 워크트리 demo/ 기반 이미지를 읽어 빌드할 수 있지만 demo/ 파일은 수정하지 않는다. 전송기는 파일을 읽고 HTTP로 보내므로 privileged 권한을 받지 않는다.

VM의 ~/2026-hack-runtime/은 Linux 파일시스템에 있으며 호스트에 자동 공유하지 않는다. 전송기를 VM에서 실행하거나 입력 파일을 명시적으로 복사한다. 실제 SaaS 주소는 팀원이 제공해야 한다.

종료: 자신의 서버/전송기는 Ctrl+C, VM은 `limactl stop 2026-hack-client`. 다른 담당이 VM을 사용하는 동안 중지하지 않는다.

### 이번 이미지 준비 기록

공식 이미지 서버의 다운로드가 느려 같은 파일을 범위 요청으로 내려받고, 전체 크기 620,224,512바이트와 dev/lima.yaml의 SHA256 일치를 확인했다. 이번 로컬 VM은 검증한 .local/ubuntu-24.04-arm64.img를 입력으로 생성했다. Git 설정은 다른 개발자가 재현할 수 있도록 공식 URL과 동일 해시를 유지한다. .local의 다운로드 파일/임시 스크립트는 푸시하지 않는다.

### VM Docker 소켓

초기 SSH 세션에는 설치 중 추가한 docker 그룹이 반영되지 않아 호스트 소켓 연결이 EOF로 실패했다. Lima 공식 rootful Docker 구성과 같이 docker.socket의 SocketUser를 VM 사용자로 지정하고 소켓/서비스를 재시작해 호스트 CLI 연결을 확인했다. dev/lima.yaml의 provisioning에 같은 설정을 포함한다. 이 소켓은 VM의 root 권한을 제공하므로 전용 로컬 소켓으로만 사용하며 TCP로 노출하지 않는다.

## 2026-10-31 실제 검증 기록

| 항목 | 확인 결과 |
|---|---|
| 호스트 | macOS 26.6.2 ARM64, Python 3.12.2, Lima 2.2.1 |
| VM | 2026-hack-client, Ubuntu 24.04.5 LTS ARM64, kernel 6.8.0-142-generic, BTF 읽기 가능 |
| Docker | VM Docker Engine 29.1.3, 호스트 전용 소켓 연결 성공. 기존 Docker Desktop context는 변경하지 않음 |
| 컨테이너 Python | Python 3.12.16, 두 Dockerfile에 검증한 이미지 digest 고정 |
| 게시판 의존성 | FastAPI 0.162.0 / Uvicorn 0.54.0 / Pydantic 2.14.2, pip check 성공 |
| 게시판 로컬 실행 | /health·/openapi.json 성공, SQLite에 넣은 임시 검증 값이 서버 재시작 후 유지 |
| 게시판 컨테이너 | 빌드 성공, VM 8081 포워딩으로 /health 성공. 컨테이너 삭제·재생성 후 같은 볼륨의 임시 검증 값 유지 |
| 전송기 | HTTPX 0.28.1 / pip check 성공. 설정 정상·필수값 누락·잘못된 URL 확인, 토큰 비출력 |
| 전송기 컨테이너 | 빌드·--check-config 성공, read-only sample mount 인식. HTTP 전송은 수행하지 않음 |
| Tetragon | v1.8.0 이미지 기동, 기본 BPF 센서 로드 및 JSONL export 확인 |
| 실제 이벤트 | VM에서 /usr/bin/true 실행 후 해당 binary의 process_exec 2건 확인. sample 아님 |
| 정리 | 환경 검증용 hack-setup-board·hack-setup-tetragon 컨테이너와 검증 DB 볼륨 삭제. VM·이미지는 후속 작업용으로 유지 |

Tetragon 이미지 digest: `quay.io/cilium/tetragon@sha256:5ed9088a1582131d71b06c98e0d549a37a71ae63ab13aabefc7a47553c822a9d`. 기본 센서만 검증했으며 사용자 정의 관찰/대응 정책은 아직 없다. 원본은 VM의 `~/2026-hack-runtime/tetragon/setup-events.jsonl`에 남겼고 Git에 넣지 않았다.

기본 센서 검증에 사용한 구성은 `--pid=host --cgroupns=host --privileged`, BTF 파일을 `/var/lib/tetragon/btf:ro`로 mount, 전용 로그 디렉터리를 `/var/log/tetragon`으로 mount, `--export-filename=/var/log/tetragon/setup-events.jsonl --export-file-perm=644 --server-address=`다. Tetragon 담당은 이 조합에서 시연 범위의 정책을 추가하고 검증한다. 높은 권한은 전용 Linux VM의 Tetragon에만 부여한다.

**미완료:** 게시판 글 CRUD, 전송기 follow/replay·재시도, 파일 관찰·정책 대응, 실제 SaaS 수신, 대시보드·AI 연결. 환경 확인을 이 기능들의 완료로 해석하지 않는다.
