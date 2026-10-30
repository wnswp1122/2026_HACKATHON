# 고정 대시보드 스냅샷

**후속 기준: `d960d3f` — [Tetragon 5개 화면 계획](https://github.com/wnswp1122/2026_HACKATHON/blob/d960d3feeed6b1693be47e1a1e7cd48c0b911dac/docs/tetragon-screen-plan.md), [PR #4](https://github.com/wnswp1122/2026_HACKATHON/pull/4).** 이전 로컬 docs와 충돌하면 이 계획을 따른다. LiteSOC는 **AI 기반 서버 보안 모니터링·분석 플랫폼**이다.

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

## d960d3f 후속 구현: 고정 관찰 리플레이

`src.snapshots.router`는 기존 Snapshot API와 함께 `replays.py`의 router를 include한다. 앱은 기존 snapshots router 하나만 조립하면 된다. 저장 테이블은 core의 `replays(replay_id,created_at,payload)`를 사용한다. DDL·공통 앱은 이 작업에서 변경하지 않는다.

- `POST /api/replays`: 기간 공통 필터 + optional processExecId/policyName의 본문을 받고 201 Replay를 반환한다. QueryFilters 검증을 events와 공유한다.
- `GET /api/replays/{replayId}`: 저장 payload를 그대로 반환한다. 없는 ID는 404, 잘못된 UUID는 422다.
- 같은 REPEATABLE READ 연결에서 전체 total/undatedCount를 읽고, occurredAt 있는 이벤트를 `(occurredAt,eventId)` 오름차순으로 최대 2,000개 읽어 저장한다. 선택 집합은 receivedAt `[from,to)` 그대로다. 날짜 없는 이벤트의 수신 시각을 발생 시각으로 대체하지 않는다.
- Replay는 replayId/createdAt/filters/timeBasis="occurredAt"/events/total/undatedCount/eventLimit=2000/truncated를 저장한다. truncated는 날짜 있는 이벤트가 2,000개를 초과하는 경우만 true다.
- events는 file/network/parentExecId를 포함한 공개 Event이며 rawEvent·임의 추가 필드·명령 인자는 제외한다. 프로세스 경로·IP·파일 경로를 가질 수 있으므로 **Replay 자체를 Snapshot/AI 입력이나 전체 화면 캡처로 전달하면 안 된다.**

안전 Snapshot의 입력·8개 요약 키는 늘리지 않았다. Snapshot에 processExecId/policyName을 보내면 422이며, 프론트가 기존 허용 필터만 선택하고 분석에서 제외된 필터를 안내해야 한다. 이미 저장한 Snapshot은 다시 계산하거나 nullable 필드를 추가해 바꾸지 않는다.

```sh
curl -i http://127.0.0.1:18002/api/replays \
  -H 'Content-Type: application/json' \
  -d '{"from":"2026-10-30T10:00:00Z","to":"2026-10-30T11:00:00Z","instanceId":"plan-small","source":"sample"}'
# 반환된 replayId로 고정 payload를 다시 조회한다.
curl http://127.0.0.1:18002/api/replays/<replayId>
```

### 후속 실제 PostgreSQL·HTTP 결과

위 초기 검증과 별도로 새 계획 DDL·ignored harness를 사용해 수동 실행했다. 모두 직접 생성한 sample이며, 전체 수집 통합은 미검증이다.

| 시나리오 | 실제 결과 |
|---|---|
| receivedAt 범위와 occurredAt 정렬 | 전체 7건 중 날짜 있는 5개 재생, 날짜 없는 2개 별도 계수. 범위 전 occurredAt도 receivedAt이 범위 안이면 포함. 동률 UUID 오름차순 |
| 2,001개 dated + 1개 undated | total=2002, undatedCount=1, events=2000, truncated=true |
| 정확히 2,000개 dated + 1개 undated | total=2001, events=2000, truncated=false |
| 날짜 없는 이벤트만/빈 범위 | events 빈 배열, 정확한 total/undatedCount, truncated=false |
| 생성 후 새 이벤트 | 라이브 집계만 증가. 기존 Replay·새 Snapshot·초기 Snapshot 모두 값 동일 |
| count와 rows 조회 사이 동시 commit | 실제 psycopg cursor의 count fetch 직후 임시 관측 장치로 정지, 별도 연결로 가장 이른 occurredAt 이벤트 commit. Replay는 total=8과 기존 이벤트만 유지, 라이브 total=9. SHOW로 repeatable read 확인 |
| INSERT 실패 | 임시 DB trigger가 실패한 POST는 503, Replay 행 수 증가 없음, DB 예외 표식 비노출. trigger/function 제거 |
| Snapshot 안전성 | 공개 Event의 file/network/parentExecId가 있어도 Snapshot.events 키는 기존 8개, 새 필터 본문은 422. 초기 저장 Snapshot 값 그대로 |
| 앱·DB 재시작 | 새 Replay와 Snapshot 및 과거 Snapshot JSON 값 동일. 당시 Replay 7개·Snapshot 6개 보존 |

관측 장치는 실제 SQL 결과를 바꾸지 않는 ignored harness 전용 cursor다. 제품 DB 대체 구현이나 자동 테스트·CI를 추가하지 않았다. core의 실제 app/db/settings를 조립한 실행, 프론트 재생 UI·상세 이동·안전 캡처, AI 연결, 실제 Tetragon 이벤트 전송은 남은 통합 확인이다.
