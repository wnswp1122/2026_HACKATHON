# 기술 스택과 경계

선정 기준이며 설치·기능 검증 결과는 [개발 환경](local-development.md) 및 각 PR에서 확인한다.

| 영역 | 선택 |
|---|---|
| 게시판 | Python 3.12, FastAPI/Uvicorn, SQLite. CRUD API만 |
| 관찰·대응 | 별도 로컬 Linux VM의 Tetragon + eBPF |
| 전송 | Python 3.12 + HTTPX, JSONL→HTTP JSON |
| SaaS | Python 3.12 + FastAPI/Pydantic, 단일 서버의 모듈 분리 |
| SaaS 저장 | PostgreSQL. 원본·정규화·스냅샷·분석 결과 |
| 프론트 | React + TypeScript + Vite + Recharts, 2초 폴링 |
| 캡처 | html-to-image, 고정된 스냅샷 화면 |
| AI | Gemini generateContent API, JSON 요약과 이미지 입력, 구조화 응답 |

AI 모델은 서버의 `GEMINI_MODEL`로 명시한다. 설정 예시는 이미지 입력·구조화 출력을 지원하는 `gemini-2.5-flash`이며, 실제 계정 접근·무료 한도·분석 품질은 운영할 프로젝트에서 확인한다. [구조화 출력](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [요금·무료 한도 안내](https://ai.google.dev/gemini-api/docs/pricing)

전송/게시판 개발환경은 SaaS 코드나 Node 환경에 의존시키지 않는다. Tetragon 버전·BTF·Linux 커널 호환성은 [공식 설치 문서](https://tetragon.io/docs/installation/container/)와 실제 실행으로 확인하고 버전을 고정한다.

메시지 브로커·영속 전송 큐·마이크로서비스·Kubernetes·외부 알림은 이번 기본 구성에 넣지 않는다.
