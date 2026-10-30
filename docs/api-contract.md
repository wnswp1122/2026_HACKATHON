# 이벤트·AI API 구현 계약 v1

상태: **이번 개발에 사용할 구현 기준이며, 아직 API가 구현되거나 실행 검증된 것은 아니다.** 전송·백엔드·화면은 이 계약을 공통으로 사용한다. Tetragon 원본 필드 매핑은 실제 이벤트 확보 후 보완하되 외부 API를 각자 바꾸지 않는다.

## 공통 규칙

- 기준 주소: `http://127.0.0.1:8000`. JSON은 UTF-8, 속성명은 camelCase.
- 시간: 응답 시각은 UTC ISO 8601 문자열. 원본의 시각이 없거나 해석 불가하면 `null`. `receivedAt`으로 발생 시각을 대체하지 않는다.
- 원본에 없는 값은 `null`, 빈 목록은 `[]`. 정해진 객체 구조는 유지한다.
- ID는 백엔드 UUID 문자열. 아래 `event-001` 등은 문서 예시이며 실제 UUID가 아니다.
- 로컬 시연용 단일 인스턴스. 사용자 인증·다중 고객 기능은 범위 밖이다. 서버를 인터넷에 노출하지 않는다.
- 브라우저는 백엔드가 제공하는 `/`에서 화면을 열고 `/api/...`를 상대 주소로 호출한다. 별도 CORS 서버를 만들지 않는다.

## 1. 실행 상태

`GET /api/health` → `200`

```json
{"status":"ok","serverSessionId":"session-001","aiConfigured":false}
```

`serverSessionId`는 백엔드 시작 때 생성하며 재시작하면 바뀐다. `aiConfigured`는 설정의 존재 여부이며 AI 호출 성공 여부가 아니다. 이 API로 Tetragon 연결 상태를 판단하지 않는다.

## 2. 원본 이벤트 수신

`POST /api/events` → 저장 성공 시 `201`, 본문은 아래의 상세 이벤트 객체.

요청 예시: 공식 필드 형태를 참고한 **직접 작성한 최소 예시**다. 실측 자료가 아니다.

```json
{
  "instanceId": "demo-client-1",
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

- `instanceId`: 1~100자 문자열, 전송 모듈의 설정에서 제공한다. 사용자 인증 수단은 아니다.
- `source`: `live` 또는 `sample`. 예제나 재생 파일은 `sample`, 현재 Tetragon 출력을 직접 전달할 때만 `live`.
- `rawEvent`: 비어 있지 않은 JSON 객체. 한 요청에 이벤트 하나. 진단 로그 문자열이나 배열은 받지 않는다.
- 심각도·경고 여부는 요청에서 받지 않는다. 백엔드가 분류한다.
- 수신할 때마다 새 ID를 만든다. 초기에는 중복 제거가 없으므로 전송기는 응답이 불명확한 요청을 자동 재시도하지 않는다.

### 상세 이벤트 객체

```json
{
  "id": "event-001",
  "instanceId": "demo-client-1",
  "source": "sample",
  "receivedAt": "2026-10-31T03:30:13Z",
  "occurredAt": "2026-10-31T03:30:12Z",
  "eventType": "PROCESS_EXEC",
  "nodeName": "demo-linux",
  "policyName": null,
  "process": {
    "execId": "sample-exec-1",
    "pid": 1234,
    "uid": 1000,
    "binary": "/usr/bin/cat",
    "parentBinary": "/bin/sh"
  },
  "target": null,
  "status": "observed",
  "reason": null,
  "reportedAction": null,
  "outcome": "unknown",
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

| 속성 | 허용값·설명 |
|---|---|
| `eventType` | `PROCESS_EXEC`, `PROCESS_EXIT`, `FILE_ACCESS`, `NETWORK`, `OTHER` |
| `process` | 객체는 유지하고 없는 개별 필드는 `null` |
| `target` | 확인된 경우 `{"kind":"file","value":"/tmp/hack-demo/protected.txt"}` 또는 `kind: "network"`의 주소·포트 문자열. 그 외 `null` |
| `status` | `observed` 또는 `attention` |
| `reason` | `attention`이면 적용한 판정 근거를 설명하는 문자열, 그 외 `null` |
| `reportedAction` | 원본 이벤트에 실린 동작 문자열, 없으면 `null`. 정책 파일에 적혀 있다는 이유로 채우지 않는다 |
| `outcome` | v1에서는 항상 `unknown`. 외부 관찰 결과를 자동 결합하는 기능은 없다 |
| `source` | 실제 수집과 예시 입력을 화면에서 구분하는 기준 |

`reportedAction`이 있어도 `outcome`을 성공으로 바꾸지 않는다. 프로세스 종료 또는 작업 거부의 실제 증거는 [수동 확인](manual-verification.md) 결과로 별도 기록한다. 시연 명령의 파일 인자만 보고 `target`을 파일 접근으로 채우지 않는다. 실행과 접근은 별도 이벤트다.

### 원본 필드 변환 책임

변환은 **백엔드에서 한 번만** 한다. 전송기와 프론트엔드는 Tetragon 원본을 별도로 해석하지 않는다.

| 원본 | 변환 |
|---|---|
| `rawEvent.time`, `rawEvent.node_name` | `occurredAt`, `nodeName` |
| `process_exec.process`, `process_exec.parent` | `PROCESS_EXEC` 및 프로세스 정보 |
| `process_exit.process`, `process_exit.parent` | `PROCESS_EXIT` 및 프로세스 정보 |
| 검증된 정책 이벤트 본문의 `policy_name`, `action`, `process`, `parent` | 정책명·보고된 동작·프로세스. 실제 출력의 위치와 형태를 검증한 경우만 변환 |
| 검증된 파일·네트워크 정책의 인자 | `FILE_ACCESS` / `NETWORK` 및 대상. 해당 정책의 실제 예시와 매핑을 백엔드 문서에 기록 |
| 그 외 | `OTHER`. 원본은 보존하고 모르는 구조 때문에 서버가 종료되지 않게 한다 |

`process_kprobe`라는 이유만으로 파일 접근으로 분류하지 않는다. 훅·정책에 따라 내용이 다르다. enum의 숫자 표현은 버전별 스키마 확인 전 임의로 이름에 대응시키지 않는다.

### 경고 분류 v1

`ALERT_POLICY_NAMES`에 등록된 정책명이 원본에서 정확히 확인되면 `attention`, 이유는 `시연 경고 대상으로 등록한 정책 <이름>과 일치했습니다.`로 정한다. 그 외 `observed`. AI는 이 상태를 변경하지 않는다. 목록이 비어 있으면 모두 `observed`다.

예시 정책명 `hack-demo-observe`, `hack-demo-enforce`는 시연 담당자가 해당 이름으로 정책을 만들 때 사용할 제안이다. 실제 이름을 환경변수에 넣고, 만들어지지 않은 정책을 적용됐다고 표시하지 않는다.

## 3. 목록 조회

`GET /api/events?limit=100` → `200`

```json
{
  "serverSessionId": "session-001",
  "items": [],
  "retainedCount": 0
}
```

- `limit`: 기본 100, 1~100. 잘못된 값은 422.
- `items`: 수신 순서 최신 우선. 상세 객체에서 `rawEvent`만 제외한 객체 배열.
- `retainedCount`: 현재 메모리에 보관 중인 전체 건수. 누적 탐지 건수나 공격 수가 아니다.
- 메모리는 최근 1,000건만 보관하고 가장 오래된 항목부터 제거한다. 재시작 시 비워진다.
- 서버 필터·페이지 이동은 v1 범위 밖. 화면의 유형·경고 필터는 현재 가져온 목록에 적용하고 `최근 100건`이라고 표시한다.
- 폴링 사이에 100건을 초과하면 일부 화면 알림을 놓칠 수 있다. 이 설계는 저빈도 시연용이며 완전한 전달을 보장하지 않는다.

## 4. 상세 조회

`GET /api/events/{id}` → `200` 상세 객체. 없는 ID나 보관 범위에서 제거된 ID는 `404 EVENT_NOT_FOUND`.

## 5. AI 분석

`POST /api/events/{id}/analysis`

```json
{
  "serverContext": "시연용 웹 서버이며 이 파일은 정상 요청 처리 중 읽지 않습니다."
}
```

`serverContext`는 0~2,000자, 기본 빈 문자열. 이벤트는 ID로 서버에서 조회한다. 브라우저가 원본 이벤트를 다시 보내지 않는다.

성공 `200`:

```json
{
  "eventId": "event-001",
  "generatedAt": "2026-10-31T03:31:00Z",
  "provider": "openai",
  "model": "gpt-5-mini",
  "facts": ["보고된 프로세스 경로는 /usr/bin/cat입니다."],
  "hypotheses": ["관리자가 실행한 정상 확인 작업일 수 있습니다."],
  "checks": ["해당 시각의 관리자 작업 여부를 확인하세요."],
  "limitations": ["실행 이벤트만으로 파일을 실제로 읽었는지는 확인할 수 없습니다."]
}
```

이는 형식 예시다. 외부 AI가 실제 응답하지 않았다면 이 예시를 성공 응답으로 반환하지 않는다.

- OpenAI Responses API 호출은 분석 모듈 내부 한 곳에 둔다. OPENAI_MODEL 기본값은 gpt-5-mini이며 OPENAI_API_KEY가 없어도 나머지 모듈은 실행한다.
- AI 전달 필드: `eventType`, `occurredAt`, `instanceId`, `policyName`, `process.binary`, `process.parentBinary`, `target`, `status`, `reason`, `reportedAction`, `outcome`, `source`, `serverContext`.
- `rawEvent`, 명령 인자, 환경변수, 비밀키는 보내지 않는다. 경로·주소·서버 설명도 외부 전송된다는 안내를 화면에 둔다.
- 구조화 응답을 검증해 네 목록이 모두 문자열 배열인지 확인한다. 시간·ID·provider/model은 서버가 채운다.
- 전체 AI 요청 제한 시간은 30초. 자동 재호출·영속 캐시·백그라운드 작업은 만들지 않는다.

## 6. 오류

```json
{"error":{"code":"EVENT_NOT_FOUND","message":"이벤트를 찾을 수 없습니다."}}
```

| HTTP | code | 경우 |
|---|---|---|
| 400 | `INVALID_JSON` | JSON 해석 실패 |
| 422 | `VALIDATION_ERROR` | 필수값·타입·길이·limit 위반 |
| 404 | `EVENT_NOT_FOUND` | 이벤트 없음 |
| 503 | `AI_NOT_CONFIGURED` | OpenAI 키·모델 설정 누락 |
| 504 | `AI_TIMEOUT` | AI 응답 제한 시간 초과 |
| 502 | `AI_UPSTREAM_ERROR` | 제공자 오류 또는 응답 형식 불일치 |

FastAPI의 기본 검증 오류도 공통 형태로 변환한다. 오류 메시지에 키나 제공자 응답 전체를 포함하지 않는다. 예외 상세는 필요할 때 로컬에서 비밀값을 제외해 확인한다.
