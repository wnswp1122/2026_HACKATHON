# 로컬 개발 환경과 실행 계약

상태: Python 의존성 설치는 이전 작업에서 확인했다. **아래 애플리케이션 실행 명령은 해당 파일을 구현한 뒤 사용한다.** 현재 앱·전송기·Tetragon 정책은 미구현이다.

## 배치

- 개발 호스트: FastAPI 백엔드와 화면(포트 8000), Python 전송기.
- 로컬 Linux 환경: 시연용 컨테이너, Tetragon. macOS이면 Docker Desktop의 Linux VM 또는 별도 로컬 Linux VM.
- Tetragon이 기록한 이벤트 파일을 개발 호스트에서 읽을 수 있게 공유한다. 프로젝트의 `.local/tetragon/events.jsonl`을 연결 경로로 권장한다. 이 디렉터리는 런타임 생성물이며 Git에 추가하지 않는다.
- 개발 호스트의 전송기 → 같은 호스트 백엔드: `http://127.0.0.1:8000/api/events`.
- 전송기를 나중에 컨테이너로 옮긴다면 주소를 별도로 정한다. 컨테이너의 `localhost`를 개발 호스트로 가정하지 않는다. Tetragon의 높은 권한을 백엔드·전송기에 주지 않는다.

## 환경 준비

저장소 루트에서:

```sh
python3 --version
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
.venv/bin/python -m pip check
```

Python 3.12 기준이다. 이 파일은 프로젝트별 가상환경을 만들며 전역 Python에 설치하지 않는다. 기존 `.env`가 있으면 덮어쓰지 않고 필요한 값만 추가한다.

## 사용할 환경변수

다음은 **구현할 코드가 읽어야 할 변수 목록**이다. 현재 `.env.example`에는 일부만 있으므로 담당자가 해당 기능을 구현할 때 값이 없는 비밀키 예시와 설명을 추가한다.

| 변수 | 기본값 또는 예 | 사용처 |
|---|---|---|
| `BACKEND_HOST` | `127.0.0.1` | Uvicorn 실행 주소 |
| `BACKEND_PORT` | `8000` | Uvicorn 포트 |
| `EVENTS_URL` | `http://127.0.0.1:8000/api/events` | 전송기 목적지 |
| `INSTANCE_ID` | `demo-client-1` | 전송기 수집 대상 식별 |
| `TETRAGON_LOG_PATH` | `.local/tetragon/events.jsonl` | 전송기가 읽는 파일, 저장소 루트 기준 |
| `ALERT_POLICY_NAMES` | 빈 문자열 | 쉼표로 나눈 시연 경고 정책명. 실제 정책명이 정해지면 입력 |
| `OPENAI_MODEL` | `gpt-5-mini` | 분석 모델 |
| `OPENAI_API_KEY` | 빈 문자열 | 백엔드만 사용. 실제 값은 커밋하지 않음 |

코드는 `os.environ`에서 설정을 읽는다. `.env`는 자동으로 읽힌다고 가정하지 않는다. 아래처럼 **직접 작성한 신뢰 가능한 로컬 설정 파일**을 셸에서 로드한다. 셸 문법이므로 공백이 있는 값은 따옴표로 감싼다.

```sh
# .env가 없을 때만 생성
if [ ! -f .env ]; then cp .env.example .env; fi
set -a
. ./.env
set +a
```

## 구현 후 앱 실행

저장소 루트에서 환경변수를 로드한 뒤 터미널 A:

```sh
.venv/bin/python -m uvicorn src.main:app --app-dir backend --host "${BACKEND_HOST:-127.0.0.1}" --port "${BACKEND_PORT:-8000}"
```

- `backend/src/main.py`에 `app`을 정의해야 한다.
- 백엔드가 `frontend/index.html`을 `/`에서 제공하고 정적 파일을 `/static`에 연결한다. 경로는 실행 디렉터리가 아닌 소스 파일 위치 기준으로 구한다.
- 화면 주소: `http://127.0.0.1:8000/`, 상태: `/api/health`.
- 메모리 저장이므로 여러 Uvicorn worker를 쓰지 않는다. 자동 reload도 재시작 시 저장 데이터가 사라지므로 시연 중 사용하지 않는다.
- 프론트엔드는 `/static/src/main.js`를 ES module로 로드하고 API에는 `/api/...`를 사용한다. 별도 npm 서버는 없다.

터미널 B에서 같은 가상환경과 설정을 사용:

```sh
# 실제 JSONL 경로가 준비된 뒤 실시간 수집
.venv/bin/python event-forwarder/main.py --follow
# 팀이 실제로 만든 JSONL 예시를 한 번 재생하는 개발용 경로
.venv/bin/python event-forwarder/main.py --replay /path/to/sample-events.jsonl
```

`--replay` 입력은 항상 `source=sample`이다. `--follow`는 현재 Tetragon이 기록 중인 파일에서만 `source=live`를 사용한다. 인자·동작은 [전송기 계약](../event-forwarder/README.md)을 따른다. 예시 파일 경로는 실제 파일을 생성한 후 바꿔 사용한다.

## Tetragon 설치는 별도 확인

[공식 컨테이너 설치 문서](https://tetragon.io/docs/installation/container/)를 기준으로 Linux 커널·BTF·아키텍처·실행 권한을 확인한다. 실제 선택한 이미지 버전을 고정하고 `.local`의 원본 이벤트 파일 접근을 검증한다. 단순히 Docker 명령이 존재한다고 설치가 완료된 것은 아니다.

Tetragon 설치·정책 로드 명령은 환경을 확인한 담당자가 [Tetragon README](../tetragon/README.md)에 추가한다. 확인하지 않은 macOS/Docker 조합에 범용 실행 명령을 제공하지 않는다.

## 종료와 데이터

백엔드와 전송기는 터미널에서 Ctrl+C로 종료한다. Tetragon 정책 해제와 시연 컨테이너 종료는 담당자가 기록한 정확한 이름·명령을 사용한다. 다른 컨테이너나 정책을 일괄 삭제하지 않는다. `.local` 데이터와 `.env`는 저장소에 커밋하지 않는다.
