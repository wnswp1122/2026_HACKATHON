# Tetragon 기반 보안 모니터링 SaaS MVP

사용자 서버의 게시판 활동을 Tetragon으로 관찰하고 정책 대응 결과를 확인한다. 이벤트를 SaaS에 보내 대시보드에서 조회하고, 선택한 시점의 데이터와 대시보드 캡처를 함께 AI로 분석한다.

**현재 이 브랜치는 개발 기준과 환경을 준비하는 단계다. 기능 구현·실제 정책 대응·SaaS 통합 완료를 의미하지 않는다.**

## 담당과 시작 문서

| 담당 | 개발 범위 | 시작 문서 |
|---|---|---|
| 사용자 | 게시판 API·SQLite, Tetragon·eBPF, 전송기 | [클라이언트 개발 지침](docs/client-development.md) |
| SaaS 담당 팀원 | 수신·인증·정규화·PostgreSQL·집계·스냅샷·AI | [데이터/API 계약](docs/api-contract.md), [백엔드](backend/README.md) |
| 프론트 담당 팀원 | React 대시보드·기간 선택·캡처·분석 화면 | [프론트](frontend/README.md) |

1. [개발 가이드](docs/development-guide.md): 역할과 병렬 작업 순서.
2. [데이터/API 계약](docs/api-contract.md): 사용자 서버 → SaaS의 단일 계약.
3. [개발 환경](docs/local-development.md): 환경변수·준비·검증 기록 위치.
4. [수동 확인](docs/manual-verification.md): 컴포넌트·실제 수집·팀 통합 구분.
5. [기술 스택](docs/tech-stack.md), [설계](docs/runtime-security-design.md), [결정](docs/decisions.md).
6. [GitHub 협업 규칙](docs/github-collaboration.md): 검증 후 푸시, 기능별 PR.

게시판은 프론트 없는 간단한 CRUD API다. SaaS는 FastAPI 단일 서버 안에서 모듈을 나누고 PostgreSQL에 저장한다. 대시보드는 React·TypeScript·Vite·Recharts를 사용한다. 로그인·결제·운영 배포·CPU/메모리/HTTP 성능 수집은 이번 범위에서 제외한다.

실제 키·토큰·DB·원본 런타임 데이터는 커밋하지 않는다. Tetragon은 별도 Linux VM에서 검증하며 Docker Desktop의 호환성을 가정하지 않는다.
