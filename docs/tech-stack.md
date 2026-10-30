# 기술 스택 선정

2026-10-31 기준 이번 구현에 사용할 선택이다. 설치·구현 완료를 뜻하지 않는다. 목적은 5시간 안에 단일 시나리오의 실제 수집·대응·대시보드·AI 분석을 연결하는 것이다.

| 영역 | 선정 | 선택 이유 |
|---|---|---|
| 관찰·대응 | Tetragon + eBPF | 같은 도구로 정책에 맞는 활동의 이벤트와 지원되는 대응을 다룸 |
| 시연 격리 | 로컬 Linux의 Docker 컨테이너 | 시연 파일과 프로세스를 개인 작업 환경에서 분리 |
| 백엔드 | Python 3.12 + FastAPI | JSON API와 요청·응답 검증을 적은 코드로 구현 |
| API 서버 | Uvicorn, worker 1개 | FastAPI 실행. 메모리 저장을 한 프로세스에서 일관되게 유지 |
| 데이터 검증 | Pydantic v2 | FastAPI와 함께 요청·응답 및 AI 구조화 결과 검증 |
| HTTP 클라이언트 | HTTPX | 전송기 POST와 백엔드의 비동기 AI 호출에 사용 |
| 프론트엔드 | HTML5 + CSS + JavaScript ES modules | 한 화면에 필요한 상태만 관리하고 빌드·별도 서버 설정을 줄임 |
| 화면 제공 | FastAPI 정적 파일 | 같은 주소에서 API를 호출하므로 별도 CORS·프록시 구성 불필요 |
| 저장 | Python 메모리 최근 1,000건 | 설치할 DB가 없고 시연 기능에 집중. 재시작 시 삭제됨 |
| 화면 갱신 | HTTP 2초 폴링 | WebSocket/SSE 연결 관리 없이 최근 이벤트와 새 경고 표시 |
| 전송 형식 | JSONL 읽기 → HTTP JSON | Tetragon 원본을 보존하고 백엔드 한 곳에서 변환 |
| AI | OpenAI Responses API + `gpt-5-mini` | 짧은 이벤트 해석과 정해진 JSON 응답 형식에 사용할 모델 선택 |
| 협업 | GitHub 기능 브랜치·기능별 PR | 이슈 없이 PR에 구현·검증 기록 |

## 역할별 기술 사용

- **시연 서버:** Python 표준 라이브러리의 간단한 HTTP 서버와 파일 읽기용 별도 프로세스. 웹 요청으로 임의 명령을 실행하는 취약한 서버는 만들지 않는다.
- **전송기:** Python + HTTPX. 원본 이벤트를 읽고 보내는 역할만 하며 경고 판정은 백엔드가 담당한다.
- **백엔드:** FastAPI + Pydantic. 수신·조회·분석 API와 정적 화면을 제공한다. 키와 AI 호출은 백엔드에만 둔다.
- **화면:** 기본 DOM API와 `fetch`로 작성한다. 경고와 원본·AI 응답 문자열은 `textContent`로 렌더링한다.
- **AI:** HTTPX로 `POST https://api.openai.com/v1/responses`를 호출한다. 별도 AI SDK·LangChain·에이전트 프레임워크는 추가하지 않는다.

## AI 선택의 근거와 한계

공식 문서에서 GPT-5 Mini는 범위가 정해진 작업과 구조화 출력에 사용할 수 있다. 이번 서비스는 이벤트 하나의 설명과 네 개 문자열 목록 응답으로 제한하므로 시작 모델로 선택했다. 최신 또는 최상의 모델이라는 주장은 아니다. [모델 문서](https://developers.openai.com/api/docs/models/gpt-5-mini)

Responses API의 `text.format`에 JSON Schema를 지정해 사실·가능성·확인 사항·한계를 분리한다. JSON 형식 검증은 설명 내용의 정확성을 보장하지 않는다. [구조화 출력 문서](https://developers.openai.com/api/docs/guides/structured-outputs)

`OPENAI_API_KEY`와 API 사용 가능한 계정이 필요하다. 모델 접근 권한·과금·실제 응답 시간은 아직 확인하지 않았다. 키가 없으면 다른 기능은 정상 실행하고 분석 API만 503을 반환한다. 자동으로 다른 모델로 바꾸거나 예시 분석을 실제 응답으로 반환하지 않는다.

## 버전과 환경

- Python은 3.12 기준. 프로젝트 가상환경을 사용한다.
- 기존 Python 의존성 범위는 [requirements](../backend/requirements.txt)에 있다. Pydantic을 직접 사용하는 코드가 추가되면 직접 의존성도 명시한다. 실제로 검증한 버전은 PR에 기록한다.
- Tetragon은 환경 담당자가 호환되는 안정 버전을 하나 선택해 이미지 태그와 Linux 커널 버전을 기록한다. `latest`를 검증 기준으로 쓰지 않는다. 아직 실행 환경에서 동작한 버전은 없다.
- [Tetragon 공식 설치 문서](https://tetragon.io/docs/installation/container/)는 Linux에서의 컨테이너 실행과 권한·BTF 구성을 안내한다. macOS의 Docker Desktop에서 동일하게 작동한다는 보장은 별도 확인한다.

## 다른 선택이 나은 조건

| 대안 | 바꾸는 것이 나은 조건 |
|---|---|
| React + TypeScript + Vite | 여러 페이지·복잡한 화면 상태가 생기거나 팀원이 이미 템플릿을 갖고 있어 더 빨리 구현할 때 |
| SQLite | 서버 재시작 후에도 이벤트와 분석 결과를 유지해야 할 때 |
| PostgreSQL | 다중 사용자·장기 보관·여러 백엔드 인스턴스를 운영할 때 |
| SSE/WebSocket | 폴링의 지연·누락 한계를 해결할 실시간 전달 요구가 생길 때 |
| Falco | 정책 대응을 빼고 기본 탐지 규칙에 따른 경고 수집에 집중할 때 |

이번에는 위 대안을 함께 설치하지 않는다. 선택이 바뀌면 [결정 기록](decisions.md), 실행 문서와 관련 계약을 함께 수정한다.
