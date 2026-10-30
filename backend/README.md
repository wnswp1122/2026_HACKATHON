# SaaS 백엔드 담당 지침

사용자 요청으로 SaaS도 Orca에서 개발한다. [병렬 개발 기준](../docs/saas-parallel-development.md)에 따라 core·data·AI 작업의 파일 소유 범위를 나눈다. 현재 기준 브랜치에는 의존성 파일과 문서만 있으며 기능 완료를 뜻하지 않는다.

## 책임

FastAPI 단일 서버 안에서 수신, 정규화, 저장, 조회/집계, 스냅샷, AI를 모듈로 나눈다. PostgreSQL로 영속 저장한다. 사용자 서버→SaaS는 [데이터/API 계약](../docs/api-contract.md)을 따른다.

수신은 토큰/인스턴스 검증, messageId 중복 제거, 원본·정규화 트랜잭션 저장 후 ACK를 구현한다. SaaS는 Tetragon 정책 배포·서버 명령 실행을 하지 않는다.

정규화 목록/상세·서버 필터·집계·스냅샷·이미지 업로드·분석 API는 병렬 개발 기준을 따른다. 과거 메모리 1,000건, HTML 정적 화면, 단일 이벤트 AI 경로는 현재 요구가 아니다.

[이벤트 지침](src/events/README.md), [분석 지침](src/analysis/README.md), [수동 확인](../docs/manual-verification.md)을 따른다. 실제 수신 URL과 토큰 전달 방법을 사용자 서버 담당에게 제공한다.
