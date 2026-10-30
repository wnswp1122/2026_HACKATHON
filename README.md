# Tetragon 기반 보안 모니터링 시연

Tetragon으로 시연 서버의 활동을 관찰하고 미리 준비한 정책에 따른 대응을 확인한다. 이벤트는 대시보드와 화면 알림으로 보여주고 AI가 조사 안내를 제공한다. 현재는 **개발 환경과 작업 구조만 준비된 상태**다.

## 문서

- [개발 시작 안내: 팀원과 AI를 위한 전체 작업 가이드](docs/development-guide.md)
- [개발 설계와 API 초안](docs/runtime-security-design.md)
- [시연용 서버](demo/README.md) · [Tetragon 정책](tetragon/README.md) · [이벤트 전송](event-forwarder/README.md)
- [백엔드](backend/README.md) · [대시보드](frontend/README.md)
- [결정 기록](docs/decisions.md) · [작업 기록](worklog/README.md)

## 로컬 개발 환경

Python 3.12를 기준으로 백엔드와 이벤트 전송 모듈을 준비한다. 화면은 HTML·CSS·JavaScript로 시작한다. Tetragon 실행에는 호환되는 Linux 커널 환경과 별도 설치·권한이 필요하며, macOS Docker Desktop의 Linux VM에서 동작하는지 확인해야 한다.

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r backend/requirements.txt
cp .env.example .env
```

`.env`에는 실제 비밀값을 저장소에 올리지 않는다. AI 제공자와 키 이름은 아직 정하지 않았다. 이 준비는 Python 의존성 설치까지만 수행하며, 애플리케이션 실행 코드와 Tetragon 설정은 아직 없다.

## 개발 순서

1. Tetragon의 단일 이벤트와 정책 대응을 Linux 환경에서 검증한다.
2. 실제 이벤트를 전송해 백엔드에서 조회한다.
3. 대시보드와 화면 알림을 연결한다.
4. AI 조사 안내를 연결하고 전체 흐름을 확인한다.
