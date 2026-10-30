# 클라이언트 이벤트 전송기 개발 지침

사용자 담당. JSONL 원본을 [데이터 계약](../docs/api-contract.md)에 맞춰 SaaS에 전송한다. 현재 구현 전이다.

## 소유 범위

main.py, requirements.txt, 필요한 설정 예시·검증 자료를 event-forwarder/ 안에 작성한다. SaaS 수신 서버·프론트·공통 문서는 구현하거나 변경하지 않는다.

## 구현 기준

- 환경: EVENTS_URL, INSTANCE_ID, INGEST_TOKEN, TETRAGON_LOG_PATH. 실제 토큰을 출력·커밋하지 않는다.
- --follow 또는 --replay PATH 중 하나만 받는다. 계약의 줄 처리·sample/live·회전 종료 규칙을 그대로 따른다.
- UUID messageId, schemaVersion=1 봉투를 만들고 원본 JSON 값을 변환하지 않는다.
- 인증 헤더, 200/201 ACK 확인, 동일 ID 재시도와 종료/실패 처리는 계약 한 곳을 기준으로 구현한다.
- HTTPX Client 하나로 순차 전송한다. 무제한 큐·동시 전송·영속 spool은 만들지 않는다.
- 성공·중복 ACK·잘못된 입력·최종 전송 실패 개수를 구분해 출력한다. 원본 전체와 토큰은 로그에서 제외한다.

## 독립 검증

[예시 원본](../docs/fixtures/sample-events.jsonl)을 replay한다. 실제 SaaS가 없으면 임시 HTTP 수신기로 요청 봉투·인증 헤더·재시도 ID 일치·200/201·4xx·5xx·timeout·불명확 ACK를 직접 확인한다. 이를 SaaS 실제 연동으로 기록하지 않는다.

follow는 시작 전 줄 제외, 미완결 줄 보관, 새 완결 줄 전송, 회전/축소 종료를 확인한다. 네트워크 실패·재시작 시 무손실 전달을 보장하지 않는 한계를 README에 유지한다. [클라이언트 지침](../docs/client-development.md)을 따른다.
