# 구현 후 수동 확인

**아직 실행한 결과가 아니다.** 담당자가 구현한 뒤 아래 절차를 수행하고 실제 결과를 기능 PR에 기록한다. 자동 테스트·CI 추가는 필수가 아니다. 실패한 확인을 완료로 표시하지 않는다.

## 1. 앱 연결: 예시 입력

전제: 백엔드를 [실행 방법](local-development.md)대로 포트 8000에서 실행했다. 경고 조건 확인을 위해 ALERT_POLICY_NAMES에 `hack-demo-observe`를 설정한다. 아래 sample은 직접 만든 입력이며 Tetragon을 실행하지 않는다.

```sh
curl -i http://127.0.0.1:8000/api/health
curl -i -H 'Content-Type: application/json' \
  -d '{"instanceId":"demo-client-1","source":"sample","rawEvent":{"time":"2026-10-31T03:30:12Z","node_name":"demo-linux","process_exec":{"process":{"exec_id":"sample-exec-1","pid":1234,"uid":1000,"binary":"/usr/bin/cat","arguments":"/tmp/hack-demo/protected.txt"},"parent":{"binary":"/bin/sh"}}}}' \
  http://127.0.0.1:8000/api/events
curl -i 'http://127.0.0.1:8000/api/events?limit=100'
```

기대: health 200, 수신 201, 목록 200. 새 이벤트는 PROCESS_EXEC/observed, target=null, outcome=unknown, source=sample. 목록에는 rawEvent가 없고 상세에는 있다. 반환된 실제 id를 복사한다.

```sh
# 아래 값을 수신 응답의 실제 ID로 바꾼다.
EVENT_ID='수신한-이벤트-ID'
curl -i "http://127.0.0.1:8000/api/events/$EVENT_ID"
curl -i http://127.0.0.1:8000/api/events/nonexistent
curl -i 'http://127.0.0.1:8000/api/events?limit=0'
curl -i -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:8000/api/events
curl -i -H 'Content-Type: application/json' -d '{' http://127.0.0.1:8000/api/events
```

기대: 상세 200, 없는 ID 404 EVENT_NOT_FOUND, 잘못된 limit/필수값 422 VALIDATION_ERROR, 깨진 JSON 400 INVALID_JSON. 백엔드 재시작 후 기존 ID는 404이고 serverSessionId는 바뀐다.

## 2. 화면 알림: 개발용 정책 이벤트

먼저 화면을 열어 첫 목록 조회를 마친다. 다음 입력은 **알림과 누락 필드를 확인하는 합성 이벤트**다. 실제 Tetragon 동작·파일 접근·차단 증거로 쓰지 않는다.

```sh
curl -i -H 'Content-Type: application/json' \
  -d '{"instanceId":"demo-client-1","source":"sample","rawEvent":{"time":"2026-10-31T03:30:15Z","node_name":"demo-linux","process_kprobe":{"policy_name":"hack-demo-observe","process":{"binary":"/usr/bin/cat","pid":1235}}}}' \
  http://127.0.0.1:8000/api/events
```

기대: 실제 파일 매핑이 없는 최소 입력이므로 eventType=OTHER, target=null. 정책명으로 attention과 이유가 표시되고 원본은 보존된다. 새 경고 배너에는 예시임이 표시된다. reportedAction=null, outcome=unknown.

| 조작 | 기대 |
|---|---|
| 같은 목록을 2회 이상 조회 | 같은 ID 배너가 반복되지 않음 |
| observed 이벤트 추가 | 목록은 갱신되지만 경고 배너 없음 |
| 경고/유형 필터 | 최근 가져온 목록 범위에서만 필터 |
| raw 펼치기 | JSON 텍스트 표시. HTML·스크립트 실행 없음 |
| 백엔드 중단 | 이전 목록 유지, API 오류와 마지막 성공 시각 표시 |
| 백엔드 재시작 | 세션 변화 감지, 기존 선택·분석 결과 초기화 |

## 3. 전송 모듈

전제: 전송기와 API를 구현했다.

1. 임시 JSONL에 sample 원본 객체를 한 줄씩 준비하고 replay한다. envelope가 아닌 rawEvent 내부 객체를 넣는다.
2. 성공 개수와 API 저장 개수가 일치하고 source=sample인지 확인한다.
3. 두 정상 줄 사이에 깨진 JSON을 넣는다. 오류를 기록하되 다음 정상 이벤트도 전송돼야 한다.
4. follow 파일을 만들고 전송기를 시작한다. 시작 전 기록은 보내지 않고 시작 후 완성된 새 줄만 보내는지 확인한다.
5. 백엔드를 중단해 실패를 확인한다. 이 실패는 재전송하지 않으므로 유실 가능성을 PR에 기록한다.
6. 로그 회전/축소 시 전송기가 종료 이유를 알리는지 확인한다. 자동 회전 복구가 있다고 주장하지 않는다.

## 4. 실제 Tetragon과 대응: 반드시 Linux에서 수행

[시연 서버](../demo/README.md)와 [Tetragon](../tetragon/README.md)의 구현·설정이 필요하다. 시연용 파일과 별도 probe 프로세스만 사용한다. 정책 적용/해제 명령은 환경 담당자가 검증해 기록한 것을 사용한다.

| 단계 | 수행 | 확인할 결과 |
|---|---|---|
| 정책 없음 | probe 실행 및 서버 health 조회 | 파일 읽기 성공과 정상 종료. 서버 정상 |
| 관찰 정책 | 정책 로드, probe 실행 | probe 정상 완료 + 해당 파일의 실제 관찰 이벤트 |
| 실제 전송 | live 전송기 시작 후 새 probe 실행 | 원본 정책/대상과 동일한 이벤트가 source=live로 화면에 도착 |
| 대응 정책 | 관찰 정책 해제 후 대응 정책 적용, probe 실행 | 정책 일치 이벤트와 실제 프로세스 종료 증거. 화면은 보고된 action과 결과 미상을 구분 |
| 정상 경로 | 서버 health 및 정책 대상 밖의 단순 작업 | 정상 서버가 유지됨 |
| 정책 해제 | 대응 정책 해제 후 같은 probe 실행 | 다시 정상 완료. 해제가 되었는지 목록/동작으로 확인 |

표의 기대 결과가 나오지 않으면 대응 기능은 미완료다. 종료 코드 하나만으로 정책이 원인이라고 확정하지 않는다. 정책 전후 비교와 프로세스 식별자·시각·원본 이벤트를 함께 기록한다. 외부 kill 명령으로 만든 종료를 Tetragon 대응으로 제시하지 않는다.

**프로세스 종료 시연은 파일 읽기가 전혀 실행되지 않았다는 증명이 아니다.** 작업 자체 거부를 별도 목표로 잡았다면 반환 오류와 파일/네트워크의 실제 작업 결과도 확인해야 한다.

## 5. AI 연결

수신한 실제 ID를 사용한다. 서버 설명에는 시연용 정보만 넣는다.

```sh
curl -i -H 'Content-Type: application/json' \
  -d '{"serverContext":"로컬 시연 서버이며 이 이벤트의 원인은 아직 확인하지 않았습니다."}' \
  "http://127.0.0.1:8000/api/events/$EVENT_ID/analysis"
```

- 키 미설정: 503 AI_NOT_CONFIGURED. 목록 API는 계속 200.
- 실제 키와 접근 가능한 모델 설정: 200, 네 문자열 배열과 eventId/provider/model/generatedAt.
- 2,000자를 초과한 설명: 422.
- 실패·시간 초과: 해당 오류 상태와 화면 재시도. 성공 결과를 만들어내지 않음.
- 네트워크 요청을 확인할 때 키를 출력·기록하지 않는다. rawEvent/명령 인자/환경변수가 AI 입력에 없는지 확인한다.
- 예시 또는 live 여부, reportedAction과 unknown 결과가 해석에서 뒤섞이지 않는지 사람이 읽어 확인한다.

## 6. PR에 남길 실제 결과

```text
환경: OS / Linux 커널 / Tetragon 버전 / Python 버전
실행: 사용한 명령과 화면 조작
입력: sample인지 live인지
결과: 성공한 범위와 실패한 항목
대응 증거: 정책 전후의 probe 출력·상태·이벤트 (민감값 제외)
미확인: 환경 제약·우회 검증·유실 복구 등
```

실제 고객 환경 보안, 모든 공격 탐지, 이벤트 무손실, 운영 성능을 검증한 것으로 확대하지 않는다.
