# AI 기반 서버 보안 모니터링·분석 플랫폼

사용자 서버의 게시판 활동을 Tetragon으로 관찰하고 정책 대응 결과를 확인한다. 이벤트를 SaaS에 보내 대시보드에서 조회하고, 선택한 시점의 데이터와 대시보드 캡처를 함께 AI로 분석한다.

게시판·Tetragon·전송기·SaaS 수신/조회/AI·프론트의 7개 기능 워크트리를 통합했다. 실제 PostgreSQL과 연결한 5개 화면, 리플레이, 안전 스냅샷·PNG 업로드를 확인했다. 신규 AI 분석은 Gemini API를 사용하며, 실제 제공자 호출은 서버의 `GEMINI_API_KEY`·`GEMINI_MODEL` 설정 후 별도로 확인해야 한다. 상세 범위는 [통합 계획과 검증 기록](worklog/integration-merge.md)을 따른다.

## 담당과 시작 문서

| 담당 | 개발 범위 | 시작 문서 |
|---|---|---|
| 사용자 | 게시판 API·SQLite, Tetragon·eBPF, 전송기 | [클라이언트 개발 지침](docs/client-development.md) |
| 사용자 · SaaS Orca 작업 | 수신·인증·정규화·PostgreSQL·집계·스냅샷·AI | [데이터/API 계약](docs/api-contract.md), [백엔드](backend/README.md) |
| 사용자 · 프론트 Orca 작업 | React 대시보드·기간 선택·캡처·분석 화면 | [프론트](frontend/README.md) |

1. [개발 가이드](docs/development-guide.md): 역할과 병렬 작업 순서.
2. [데이터/API 계약](docs/api-contract.md): 사용자 서버 → SaaS의 단일 계약.
3. [개발 환경](docs/local-development.md): 환경변수·준비·검증 기록 위치.
4. [수동 확인](docs/manual-verification.md): 컴포넌트·실제 수집·팀 통합 구분.
5. [기술 스택](docs/tech-stack.md), [설계](docs/runtime-security-design.md), [결정](docs/decisions.md).
6. [SaaS 병렬 개발 기준](docs/saas-parallel-development.md): 추가 네 작업의 소유 범위·공유 DB·프론트 API.
7. [Tetragon 5개 화면 계획](docs/tetragon-screen-plan.md): 원본 Figma 보존·새 화면·추가 데이터 계약·Orca 후속 작업.
8. [GitHub 협업 규칙](docs/github-collaboration.md): 검증 후 푸시, 기능별 PR.
9. [시나리오 검증 실행기 계획](docs/scenario-verification-plan.md): 샘플 입력·실제 수집·브라우저 시나리오와 성공 기준. 실행기 구현 전 계획이다.

게시판은 프론트 없는 간단한 CRUD API다. SaaS는 FastAPI 단일 서버 안에서 모듈을 나누고 PostgreSQL에 저장한다. 대시보드는 React·TypeScript·Vite·Recharts를 사용한다. 로그인·결제·운영 배포·CPU/메모리/HTTP 성능 수집은 이번 범위에서 제외한다.

실제 키·토큰·DB·원본 런타임 데이터는 커밋하지 않는다. Tetragon은 별도 Linux VM에서 검증하며 Docker Desktop의 호환성을 가정하지 않는다.
