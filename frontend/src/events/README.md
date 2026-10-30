# 이벤트 조회 화면

공통 [프론트 실행·검증 기록](../../README.md)과 [HTTP 계약](../../../docs/saas-parallel-development.md)을 따른다.

- `Filters.tsx`: 필터 입력과 적용을 구분한다. 최대 31일 검증, 로컬 시각 → UTC 변환. 분석 진행 중 선택을 잠근다.
- `useDashboard.ts`: 2초 폴링. 대시보드·20건 목록·인스턴스를 함께 조회하며 필터 변경/해제 시 취소 및 active 검사로 이전 응답을 무시한다. 실패해도 마지막 성공 데이터·적용 범위·성공 시각은 보존한다.
- `Charts.tsx`: 전체 범위의 total/attention/bySource 카드와 timeline/byType 차트. 스냅샷용은 고정 크기, 애니메이션 없음.
- `EventTable.tsx`, `Detail.tsx`: 수신/발생 시각 구분, 서버 페이지와 원본 상세. 원본은 별도 modal의 텍스트이며 캡처·AI 밖이다.

2026-10-31 독립 sample mock + Chrome에서 로딩, 전체 137건/목록 20건 분리, 다음 페이지, 필터 4종 조합, live 빈 상태, 31일 초과, 느린 이전 응답 무시, 503 화면 보존과 10초 최근성, 신규 sample 폴링 갱신을 확인했다. 실제 Tetragon 수신·PostgreSQL·SaaS 모듈 통합은 미검증이다. 경고를 공격 확정으로, reportedAction을 차단 성공으로 표시하지 않는다.
