# Tetragon 기반 보안 모니터링 시연

Tetragon으로 로컬 서버 활동을 수집하고, 미리 준비한 정책의 대응 결과를 확인한다. 우리 서비스는 대시보드·화면 알림·AI 조사 안내를 제공한다.

**현재는 폴더, Python 의존성 설정과 개발 문서만 있다. 애플리케이션 코드·정책·실제 연동은 아직 없다.** 문서 속 `구현 후` 명령은 해당 코드를 만든 뒤 사용할 실행 계약이다.

## 처음 시작할 때

1. [개발 시작 안내](docs/development-guide.md): 전체 목표, 만들 파일, 분담, AI에 전달할 요청.
2. [기술 스택](docs/tech-stack.md): 선정 결과와 이유, 대안으로 바꿀 조건.
3. [개발 환경](docs/local-development.md): 설치, 환경변수, 구현 후 실행 방법.
4. [API 계약 v1](docs/api-contract.md): 원본 수신·정규화·조회·분석의 JSON 예시와 오류.
5. [수동 확인](docs/manual-verification.md): 실제 실행과 기대 결과.
6. [GitHub 협업 규칙](docs/github-collaboration.md): 이슈 없이 기능별 PR, 로컬 검증 후 푸시, 단위별 커밋, 검증 후 머지.

## 선정한 스택

| 영역 | 선택 |
|---|---|
| 관찰·대응 | Tetragon + eBPF, 로컬 Linux + Docker |
| 백엔드·전송 | Python 3.12, FastAPI, Uvicorn, HTTPX, Pydantic |
| 화면 | HTML/CSS/JavaScript, 백엔드가 정적 파일 제공 |
| 보관·갱신 | 메모리 최근 1,000건, 2초 폴링 |
| AI | OpenAI Responses API, gpt-5-mini |

## 담당별 문서

- [시연 서버](demo/README.md) · [Tetragon](tetragon/README.md) · [정책](tetragon/policies/README.md)
- [전송 모듈](event-forwarder/README.md) · [백엔드](backend/README.md) · [화면](frontend/README.md)
- [이벤트 처리](backend/src/events/README.md) · [AI 분석](backend/src/analysis/README.md)
- [전체 설계](docs/runtime-security-design.md) · [결정 기록](docs/decisions.md) · [작업 기록](worklog/README.md)

## Python 환경 준비

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
.venv/bin/python -m pip check
```

실제 비밀키는 `.env`에만 두고 커밋하지 않는다. `.env.example`은 현재 최소 예시이며 담당자가 [설정 계약](docs/local-development.md)에 맞춰 보완한다. Tetragon은 macOS 자체에서 실행되는 것이 아니라 호환되는 Linux 환경이 필요하다. Docker Desktop의 Linux VM 지원은 실제로 검증해야 한다.
