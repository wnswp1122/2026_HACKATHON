# 사용자 서버 → SaaS 데이터/API 계약 v1

2026-10-31 개발 기준. **계약은 구현·실측 완료의 증거가 아니다.** 사용자 서버 담당은 이 문서대로 전송하고, SaaS 담당은 수신기를 구현한다. 프론트용 조회·스냅샷·AI API는 [SaaS 병렬 개발 기준](saas-parallel-development.md)에 정의한다. 아래 수신 계약을 각 담당이 임의 변경하지 않는다.

## 1. 책임과 전송 범위

- 사용자 서버: 게시판 CRUD와 SQLite, Tetragon 관찰·정책 대응, 원본 JSONL 전송.
- SaaS: 인증·중복 제거·원본 보존·정규화·경고 판정·PostgreSQL 저장·조회/집계·AI.
- 프론트: 정규화된 조회 결과 표시, 시점 선택, 스냅샷 화면 캡처.
- 게시판 글/SQLite DB 자체, CPU·메모리 지표, HTTP 요청 로그는 전송하지 않는다.
- 대시보드 캡처는 SaaS 프론트가 생성한다. 사용자 서버가 이미지를 보내지 않는다.

## 2. 요청 봉투

`POST /api/events`, `Content-Type: application/json`, `Authorization: Bearer <INGEST_TOKEN>`.
전송 목적지는 `EVENTS_URL`로 주입한다. 로컬/사설 개발망 전용이며 외부 운영 노출은 범위 밖이다.

```json
{
  "schemaVersion": "1",
  "messageId": "7f9559cc-6aa5-4d80-a08f-6c26ad72959f",
  "instanceId": "board-server-01",
  "source": "sample",
  "rawEvent": {
    "time": "2026-10-31T03:30:12Z",
    "node_name": "demo-linux",
    "process_exec": {
      "process": {
        "exec_id": "sample-exec-1",
        "pid": 1234,
        "uid": 1000,
        "binary": "/usr/bin/cat",
        "arguments": "/tmp/hack-demo/protected.txt"
      },
      "parent": {"binary": "/bin/sh"}
    }
  }
}
```

위 JSON은 **직접 작성한 sample이며 실측 데이터가 아니다.**

| 필드 | 필수·의미 |
|---|---|
| `schemaVersion` | 필수 문자열, v1은 `"1"` |
| `messageId` | 필수 UUID 문자열. 전송기가 이벤트마다 생성, 재시도 시 유지 |
| `instanceId` | 필수 1~100자 문자열. 사전 설정한 관찰 대상 ID, 재시작 후 유지 |
| `source` | 필수 `live` 또는 `sample`. 현재 출력만 live, 재생은 항상 sample |
| `rawEvent` | 필수 비어 있지 않은 JSON 객체. 원본 필드/값을 변환하지 않음 |

JSON 키 순서·공백·문자 인코딩 표현까지 바이트 단위 보존할 필요는 없다. 데이터 값은 보존한다. 봉투의 정의되지 않은 필드는 422로 거부하며, rawEvent 내부 필드는 열린 구조로 유지한다. 한 요청에 이벤트 하나만 받는다.

토큰은 본문·URL·Git에 넣지 않는다. 수신기는 토큰에 허용된 instanceId인지 확인한다. instanceId 자체는 인증 수단이 아니다. 원본은 서버에서만 보관하며 전송기 진단 로그에 전체 원본이나 토큰을 복사하지 않는다. 실제 공유용 이벤트 예시는 비밀정보 없는 시연 환경에서 만든다.

## 3. 응답과 중복

DB에 원본과 정규화 결과를 함께 저장한 뒤 `201`을 반환한다.

```json
{
  "eventId": "be1c986d-6d1b-4da7-bfa2-46b4d6aa8e55",
  "messageId": "7f9559cc-6aa5-4d80-a08f-6c26ad72959f",
  "duplicate": false
}
```

- `(instanceId, messageId)`는 유일하다. 동시 재수신도 DB 유일 제약으로 보호한다.
- 같은 ID·내용의 재수신은 새 이벤트를 저장하지 않고 같은 eventId, `duplicate: true`, `200`을 반환한다.
- 내용 비교는 schemaVersion/source/rawEvent의 JSON 값 기준이다. 객체 키 순서는 무시하고 배열 순서는 유지한다.
- 같은 ID에 다른 내용은 `409 MESSAGE_CONFLICT`. 저장 실패에 성공 응답을 반환하지 않는다.
- 전송기는 200/201과 응답 필드·요청 messageId 일치를 확인해야 성공으로 센다. 깨진 성공 응답은 결과 불명확 오류로 취급한다.

```json
{"error":{"code":"VALIDATION_ERROR","message":"요청 형식을 확인하세요."}}
```

| HTTP | code | 의미 |
|---|---|---|
| 400 | `INVALID_JSON` | JSON 해석 실패 |
| 401 | `UNAUTHORIZED` | 토큰 누락·유효하지 않음 |
| 403 | `INSTANCE_FORBIDDEN` | 토큰이 허용하지 않는 인스턴스 |
| 409 | `MESSAGE_CONFLICT` | 같은 메시지 ID의 내용 충돌 |
| 422 | `VALIDATION_ERROR` | 필수값·타입·버전·형식 위반 |
| 429 | `RATE_LIMITED` | 수신 속도 제한 |
| 503 | `STORAGE_UNAVAILABLE` | 저장 불가 |

기타 5xx도 일시 실패로 처리한다. 오류에 비밀값·원본 전체·DB 예외를 노출하지 않는다.

## 4. 전송 동작과 한계

- JSONL 한 줄의 객체를 rawEvent로 넣는다. 전송기는 정규화·경고 판정·AI 호출을 하지 않는다.
- `--follow`: 현재 끝부터 새 완결 줄만 처리, live. 미완결 줄은 다음 쓰기까지 보관한다.
- `--replay PATH`: 처음부터 끝까지 한 번 처리, sample. 마지막 줄의 개행이 없어도 처리한다.
- 빈 줄은 건너뛰고 잘못된 JSON·배열·빈 객체는 오류 건수를 기록한 뒤 다음 줄을 처리한다.
- HTTP 타임아웃은 시도당 5초. 네트워크 오류·429·5xx·불명확한 성공 응답은 최초 시도 뒤 최대 3회 재시도한다. 대기는 1/2/4초이며 유효한 Retry-After 초 값은 최대 30초 범위로 반영한다.
- 재시도에는 같은 봉투와 messageId를 사용한다. 400/401/403/409/422 등 다른 4xx는 재시도하지 않는다. 401/403은 설정 오류로 종료해 파일 전체를 실패시키며 소비하지 않는다.
- HTTP 리다이렉트는 따라가지 않으며 실패로 보고한다. 토큰을 다른 목적지로 전달하지 않는다.
- 최종 실패를 기록하고 다음 이벤트로 진행한다. replay는 최종 실패나 잘못된 입력이 있으면 0이 아닌 종료 코드다.
- follow의 파일 교체·축소를 감지하면 이유와 함께 종료한다. 자동 회전 복구·영속 큐·체크포인트는 이번 범위 밖이다.
- 재시작·수동 재생은 새 메시지 ID를 생성한다. 메시지 중복 방지는 모든 실제 이벤트의 중복 제거/무손실 보장이 아니다.

## 5. 원본에서 얻는 데이터와 정규화

**이 절은 SaaS에서 사용할 의미 기준이다. Tetragon 정책별 필드 위치는 실제 원본을 확보한 뒤 매핑 표로 확정한다.**

| 정규화 정보 | 근거·규칙 |
|---|---|
| `occurredAt` | 원본 time을 UTC ISO 8601로 해석. 없거나 해석 실패하면 null |
| `receivedAt` | SaaS가 수신할 때 기록. occurredAt을 덮어쓰지 않음 |
| `instanceId`, `source` | 봉투에서 가져옴 |
| `nodeName` | 확인된 원본 노드명 |
| `process` | 확인된 execId/pid/uid/binary/parentBinary. 없는 필드는 null |
| `eventType` | PROCESS_EXEC, PROCESS_EXIT, FILE_ACCESS, NETWORK, OTHER |
| `target` | 실제 관찰 인자의 파일 경로 또는 네트워크 주소·포트. 미확인 시 null |
| `policyName`, `reportedAction` | 실제 원본에 보고된 정책명·대응 동작. 미확인 시 null |
| `status`, `reason` | 등록한 경고 정책명과 정확히 일치하면 attention과 근거, 그 외 observed |
| `outcome` | 실제 결과 결합 기능이 없으므로 unknown |
| `rawEvent` | 원본은 저장·상세 조사용. 목록·AI에는 전체 원본을 넣지 않음 |

process_exec/process_exit의 process/parent부터 매핑한다. process_kprobe라는 이유만으로 파일 이벤트로 분류하지 않는다. 명령 인자의 파일명은 접근 성공 증거가 아니다. 알려지지 않은 구조는 OTHER로 원본을 보존한다. 실측되지 않은 enum 숫자를 임의로 해석하지 않는다.

프로세스 종료·파일 접근·네트워크는 해당 이벤트/정책을 실제 검증한 범위에서만 지원했다고 표시한다. 정책 action이나 SIGKILL 보고를 파일 읽기 차단 성공으로 바꾸지 않는다. 정책 전·후·해제 후의 실제 작업 결과는 Tetragon 담당이 별도로 기록한다.

## 6. SaaS·프론트 연결 기준

- PostgreSQL에 인스턴스, 이벤트, 스냅샷, 분석 결과를 영속 저장한다. 재시작 시 초기화되는 메모리 최근 1,000건 설계는 폐기한다.
- 대시보드 시간 필터·집계는 receivedAt 기준, occurredAt은 별도 표시한다. 필터는 인스턴스·시간·유형·경고·live/sample이다.
- 집계는 선택 범위 전체, 목록은 페이지로 조회한다. 최근 목록 수를 전체 공격 수로 표시하지 않는다.
- 최근 수신 시각은 수집기 정상 상태 보장이 아니다. heartbeat는 필수 계약에서 제외한다.
- 사용자가 시점을 선택하면 SaaS가 일관된 조회로 스냅샷을 저장하고 ID를 발급한다. 프론트는 그 고정 데이터로 화면을 렌더링·캡처한다.
- SaaS는 같은 snapshotId의 데이터와 이미지를 함께 AI에 전달한다. 이미지 누락·캡처 실패 시 텍스트만으로 몰래 분석하지 않는다.
- AI 허용 입력은 이벤트 요약·집계·시간 범위·출처·서버 설명·캡처다. rawEvent 전체, 명령 인자, 환경변수, 비밀값은 제외하고 캡처 영역에서도 숨긴다.
- AI 출력은 사실·가능한 해석·확인 사항·한계를 구분한다. 공격·유출·차단 성공을 추정으로 확정하거나 서버 명령/정책을 자동 실행하지 않는다.

조회·스냅샷·이미지 업로드·AI API의 경로/응답은 [SaaS 병렬 개발 기준](saas-parallel-development.md)을 따른다. 과거 `POST /api/events/{id}/analysis` 단일 이벤트 분석은 현재 구현 계약이 아니다.

## 7. 공유 자료

[예시 원본 JSONL](fixtures/sample-events.jsonl)은 전송기 replay 및 SaaS 수신 개발용이며 실측 자료가 아니다. 실제 이벤트는 Tetragon 담당이 버전·정책·필드 매핑·검증 결과와 함께 별도로 제공한다. rawEvent 원본 파일과 HTTP 봉투 예시를 혼동하지 않는다.
