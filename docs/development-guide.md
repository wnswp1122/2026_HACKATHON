# 개발 시작과 팀 분담

현재 목표는 로컬 SaaS 구조의 MVP다. 과거 메모리 저장·기본 HTML·단일 이벤트 AI 분석·약 5시간 기준은 아래 합의로 대체한다. 문서는 구현 완료 증거가 아니다.

## 담당

- 사용자: 프론트 없는 게시판 API와 SQLite, Tetragon/eBPF, SaaS 전송기.
- SaaS 담당 팀원: FastAPI 단일 서버의 수신·정규화·PostgreSQL·조회·집계·시점 스냅샷·AI 요청/지침.
- 프론트 담당 팀원: React/TypeScript/Vite/Recharts 대시보드, 기간 선택·캡처·분석 표시.

공통 수신 기준은 [데이터/API 계약](api-contract.md) 한 곳에서 관리한다. 프론트에 Tetragon 원본 해석을 중복 구현하지 않는다. SaaS의 조회·분석 API는 SaaS/프론트 담당끼리 구체화한다.

## 실행 순서

1. 데이터 계약·담당 지침을 Markdown으로 반영하고 검증 후 기능 브랜치에 푸시한다.
2. Python 3.12 개발 환경, 별도 Linux VM과 Docker, 의존성·설정·수동 확인 절차를 준비한다. 실제 확인한 결과와 미확인 범위를 기록하고 재현 가능한 파일을 푸시한다.
3. 위 커밋에서 Orca 워크트리 3개를 만든다: demo-board, tetragon-runtime, event-forwarder.
4. [클라이언트 지침](client-development.md)을 각 에이전트에 전달하고 병렬 구현을 시작한다. SaaS·프론트 구현은 실행하지 않는다.
5. 게시판 CRUD, 실제 Tetragon 원본, 전송 수신을 연결한다. 이후 팀원의 SaaS와 통합한다.

## 독립 개발을 위한 자료

- SaaS 팀원은 [sample JSONL](fixtures/sample-events.jsonl)로 수신·중복·저장·정규화를 구현할 수 있다.
- 전송기는 임시 HTTP 수신기로 계약을 검증할 수 있다. 실제 SaaS 통합 여부는 별도다.
- Tetragon 담당은 커널·이미지 버전, 정책명, 원본 JSON, 필드 매핑, 정책 전후 결과를 공유한다.
- 프론트는 SaaS 팀원과 합의한 정규화/집계 응답으로 개발한다. AI는 같은 snapshotId의 고정 데이터·캡처를 함께 사용한다.

가입·결제·운영 배포·다중 고객 권한·자원/HTTP 성능 수집·AI 자동 대응은 이번 필수 범위가 아니다. [수동 확인](manual-verification.md)과 [협업 규칙](github-collaboration.md)을 따른다.
