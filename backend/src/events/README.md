# SaaS 이벤트 처리 지침

dashboard-data 작업 소유. 수신·정규화는 별도의 saas-core 작업이 backend/src/ingest/에서 구현한다. [병렬 개발 기준](../../../docs/saas-parallel-development.md)을 따른다. [데이터 계약](../../../docs/api-contract.md)이 수신 형식·응답·정규화 의미의 단일 기준이다.

원본 파싱은 SaaS에서 한 번만 수행한다. 실측되지 않은 정책 인자는 추측하지 않고 OTHER로 보존한다. PostgreSQL에 원본·정규화 정보와 유일한 (instanceId, messageId)를 저장한다. 원본은 상세 조회에만 포함한다.

조회는 인스턴스·receivedAt 범위·유형·상태·source로 필터하고 페이지 처리한다. 집계는 최근 페이지가 아니라 선택 범위 전체다. 발생 시각은 별도 유지한다. 재시작 후 데이터가 유지되어야 한다.

Tetragon 담당에게 커널/이미지 버전, 정책명, 원본 예시, policy/action/target의 위치를 받아 매핑을 확정한다. 전송기·프론트에 원본 해석을 복제하지 않는다. 실제 대응 결과는 원본 action과 구분한다.
