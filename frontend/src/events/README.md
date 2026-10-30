# 이벤트 화면

[대시보드 지침](../../README.md)을 따른다. React에서 SaaS의 정규화된 목록/상세/집계 API를 사용한다. Tetragon 원본 해석은 하지 않는다.

필터는 서버에 전달하며 집계는 선택 범위 전체다. sample/live, receivedAt/occurredAt, attention/공격 확정, reportedAction/실제 결과를 구분한다. API 실패에도 기존 데이터를 보존한다. 정확한 조회 계약은 SaaS 담당과 합의한다.
