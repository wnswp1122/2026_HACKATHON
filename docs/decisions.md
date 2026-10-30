# 현재 개발 결정

## 2026-10-31 사용자 확인

- SaaS 구조의 로컬 MVP를 구현한다. 기존 약 5시간은 확장 범위의 완료 보장으로 사용하지 않는다.
- 사용자는 게시판 서버·Tetragon·전송기를 맡는다. SaaS 백엔드와 프론트는 각각 다른 팀원이 맡는다.
- 게시판은 프론트 없는 간단한 CRUD API + SQLite다. 메모장·health-only 서버 계획을 대체한다.
- Tetragon은 별도 로컬 Linux VM에서 실제 관찰·정책 대응을 검증한다.
- SaaS는 단일 FastAPI 서버의 모듈 분리 + PostgreSQL이다. 메모리 최근 1,000건 설계는 폐기한다.
- 프론트는 React·TypeScript·Vite·Recharts다. 기본 HTML 정적 화면 설계를 대체한다.
- 수집은 보안 이벤트 중심이다. 게시판 글/DB, CPU·메모리·HTTP 성능은 보내지 않는다.
- AI는 사용자가 시간 범위를 선택해 고정한 데이터와 대시보드 캡처를 함께 분석한다. 캡처는 SaaS 프론트가 만든다.
- AI의 정책 자동 수정·배포·명령 실행은 제외한다. 실제 대응 결과는 이벤트 action과 분리한다.

## 데이터 계약과 작업 순서

[데이터/API 계약](api-contract.md)을 사용자 서버→SaaS의 단일 기준으로 사용한다. schemaVersion/messageId/instanceId/source/rawEvent, 토큰 인증, DB 저장 후 ACK, 메시지 중복 처리를 포함한다. 제한 재시도는 영속 큐나 무손실 전달이 아니다.

사용자 요청 순서: 문서·데이터 관련 Markdown 지침 반영 및 푸시 → 개발환경과 프레임워크 초기 구성 준비·검증·재현 설정 푸시 → Orca에서 사용자 담당 작업 3개 실행. [클라이언트 개발 지침](client-development.md)을 따른다.

기능별 PR과 로컬 검증 후 푸시를 사용한다. 자동 머지는 요청하지 않았다. 다른 팀원의 SaaS·프론트를 대신 구현하지 않는다.

## 검증 상태

환경 검증은 [개발 환경](local-development.md), 기능 결과는 각 담당 README와 PR에 기록한다. 코드·실제 Tetragon 정책·실제 SaaS 수신·AI 호출 완료는 문서 존재만으로 주장하지 않는다.

## 프레임워크 초기 구성 추가 요청

Orca 기능 개발 전에 게시판 FastAPI 앱·SQLite 연결·Dockerfile, 전송기 HTTPX 환경·설정 검증·진입점을 준비한다. 설치한 가상환경/VM 자체는 Git에 넣지 않고 의존성 lock, VM 설정, 실행 방법을 푸시한다. CRUD·정책·실제 전송은 이후 각 작업에서 구현한다.

## 개발 기반 검증 결과

2026-10-31 FastAPI health/SQLite, HTTPX 설정 검증, 두 Docker 이미지 실행, 전용 Linux VM/Docker/BTF 및 Tetragon 기본 exec export를 확인했다. 세부 버전·명령·검증 범위는 [개발 환경](local-development.md)에 있다. 실제 정책 대응·전송·CRUD는 후속 Orca 작업이다.
