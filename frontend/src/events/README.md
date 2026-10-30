# 조회·텔레메트리 공통 모듈

기준은 **d960d3f**의 [5화면 후속 계약](https://github.com/wnswp1122/2026_HACKATHON/blob/d960d3f/docs/tetragon-screen-plan.md)이다. [실행과 실제 검증](../../README.md)을 먼저 읽는다. 이전 로컬 docs만 현재 계약으로 사용하지 않는다.

`Filters.tsx`는 서버·기간·유형·상태·live/sample과 processExecId/policyName 정확 일치를 다룬다. 준비 점검 모드에는 서버·출처만 표시한다. 최대 31일·빈 추가 필터를 검증한다. `useDashboard.ts`는 2초 폴링·요청 취소·이전 응답 무시·마지막 성공 화면/범위 보존을 담당한다. 리플레이와 준비 화면에서는 이 이벤트 폴링을 중지한다. `Charts.tsx`는 기존 집계와 안전 스냅샷의 차트를 재사용한다.

원본 상세는 현재 화면의 `?event=UUID` 오른쪽 사이드바이며 원본 문자열은 실행하지 않는다. receivedAt/occurredAt·sample/live·정책 일치/공격 확정·보고 동작/실제 결과를 구분한다.

화면별 배치는 `../screens/`에서 담당한다. `useResource.ts`는 신규 조회의 폴링·경합과 성공 시각/필터를 보존한다. NetworkGlobe는 설정 좌표와 미확인 IP를 분리하고 과거 `network=null`도 미확인으로 다룬다. RelationshipGraph는 API의 불투명 ID와 parent/observed만 사용한다. 서버 대시보드의 수치를 위험 점수나 health로 해석하지 않는다. 실행 검증과 독립 PostgreSQL data 조회 연결의 경계는 상위 README에 기록한다.
