# 고정 대시보드 스냅샷

dashboard-data 소유 모듈이다. [공통 HTTP/SQL 계약](../../../docs/saas-parallel-development.md)을 유지한다. `src.snapshots.router`가 `/api` 접두사를 가진 `router`를 export하며 core가 접두사 없이 include한다.

## 동작·연결 지점

- `POST /api/snapshots`: 공통 필터 객체를 검증하고 201 Snapshot을 반환한다. 기간·enum·instanceId 검증은 `src.events.filters.EventFilters`를 재사용한다. page/pageSize 등 정의하지 않은 입력은 422다.
- `GET /api/snapshots/{snapshotId}`: DB payload를 다시 집계하지 않고 그대로 반환한다. 없는 UUID는 404 NOT_FOUND, 잘못된 UUID는 422다.
- `db.get_connection()`과 공통 snapshots 테이블은 core 소유다. events 모듈과 같은 psycopg 3 `dict_row` 연결·commit/rollback/close 계약이 필요하다. [설치·앱 연결·독립 기동](../events/README.md)은 events README를 따른다.
- 이미지 업로드와 AI는 `src.analysis.router` 소유다. 이 모듈은 snapshot_id/created_at/payload만 INSERT하고 image_png/image_sha256/analyses는 수정하지 않는다.

첫 조회 전에 REPEATABLE READ를 지정하고, 전체 집계·최신 100개 안전 요약·payload INSERT를 같은 연결과 트랜잭션에서 수행한다. 저장이 commit된 다음 응답한다. 별도 연결이 중간에 새 이벤트를 commit해도 집계와 요약은 같은 DB 시점을 본다. 저장한 payload는 이후 GET에서 바뀌지 않는다.

Snapshot은 snapshotId/createdAt/filters/dashboard/events/eventLimit/eventsTruncated를 저장한다. 시간 필터는 UTC로 정규화하고 값이 없는 선택 필터는 생략한다. eventLimit=100, eventsTruncated=`total > events.length`다. 빈 범위도 0 집계와 빈 요약으로 저장한다.

요약 필드는 eventId/instanceId/source/receivedAt/occurredAt/eventType/status/outcome 8개뿐이다. SQL 단계에서 이 필드만 읽으며 rawEvent, 명령 인자, 환경변수, process·프로세스 경로, target, reason, 정책명은 payload에 넣지 않는다. 공개 Event의 세부 정보를 분석 입력으로 복사하지 않는다. 사용자 지정 필터인 instanceId는 계약에 따라 포함되므로 인스턴스 ID 자체에 비밀값을 사용하면 안 된다.

## 수동 요청

독립 harness는 실제 PostgreSQL과 HTTP 18002를 사용한다. core 통합 후에는 8000으로 바꾼다.

```sh
curl -i http://127.0.0.1:18002/api/snapshots \
  -H 'Content-Type: application/json' \
  -d '{"from":"2026-10-31T00:00:17.250000Z","to":"2026-10-31T00:04:22.250001Z","source":"sample"}'
# 응답 snapshotId를 다음 요청에 사용한다.
curl -i http://127.0.0.1:18002/api/snapshots/<snapshotId>
```

스냅샷의 생성 성공은 PNG 캡처·AI 분석·시각적 일치 확인을 뜻하지 않는다. 이 모듈은 이벤트 수신이나 프로세스 대응 결과를 판단하지 않는다.

## 2026-10-31 실제 PostgreSQL·HTTP 검증

[events README의 동일 환경](../events/README.md)에서 공통 문서 DDL과 synthetic 데이터를 사용했다. 수신기·정규화·실제 이벤트·AI·프론트 통합을 거치지 않은 독립 검증이다.

| 시나리오 | 실제 결과 |
|---|---|
| 빈 DB/없는 인스턴스 범위 생성 | 201, 0 집계·빈 요약·eventsTruncated=false |
| 범위 내 239건 생성 | dashboard.total=239, 최신 events=100, eventLimit=100, eventsTruncated=true |
| 유형/source 결합 필터 | 집계와 요약 24건, eventsTruncated=false |
| 비밀값 제외 | 원본/환경변수/임의 arguments/process 경로/target/reason에 넣은 synthetic 표식이 응답과 저장된 payload에 없음. 요약 키가 허용한 8개와 정확히 일치 |
| 저장 내용 | POST 응답과 GET 및 SQL payload가 같은 JSON 값. image_png/image_sha256은 null |
| 생성 후 별도 연결로 이벤트 1건 추가 | 라이브 total=240, 원래 239건 스냅샷은 모든 값 동일 |
| 집계와 요약 사이 동시 commit | HTTP 생성 요청의 집계 직후 임시 관측 장치로 멈추고 별도 DB 연결에서 최신 이벤트를 commit. 트랜잭션 격리를 SHOW로 확인. 스냅샷 total=240, 요약에 새 ID 없음, 라이브 total=241 |
| 강제 INSERT 실패 | 전용 DB에 임시 실패 trigger를 설정한 POST가 503. 성공 스냅샷 수 증가 없음·예외의 synthetic 비밀 표식 비노출. 확인 후 trigger/function 제거 |
| 앱 재시작·DB 컨테이너 stop/start | 원래 239건 스냅샷 전체 값 동일. 총 5개 스냅샷·243개 이벤트·3개 인스턴스 보존 |
| 없는 UUID/잘못된 UUID·본문 | 각각 404/422, 공통 error 객체 |

동시성 관측·강제 실패 도구는 ignored `.local`에만 있다. 제품 router나 SQL 읽기를 가짜 DB로 바꾸지 않았고, REPEATABLE READ를 실제 PostgreSQL에서 확인했다. 읽기와 INSERT 중 하나가 실패하면 context manager가 rollback하며 성공 응답을 내보내지 않는다.

남은 통합 확인은 core 앱의 모듈 조립·실제 DB 연결·공통 오류 핸들러, analysis의 동일 snapshotId 이미지/분석 연결, 프론트의 고정 영역 렌더링·캡처다. PNG 내용과 데이터의 시각적 일치·유료 AI 호출·실제 Tetragon 흐름은 확인하지 않았다.
