# LiteSOC 사용자 서버 전송기

**AI 기반 서버 보안 모니터링·분석 플랫폼** LiteSOC의 이벤트·상태 전송기다. JSONL 객체 한 줄을 [v1 수신 계약](../docs/api-contract.md)의 봉투로 전송한다. 원본 정규화·정책 판정·AI 호출은 하지 않는다.

이번 작업의 단일 기준은 **`d960d3f`** ([새 5화면 계획 원격 원문](https://github.com/wnswp1122/2026_HACKATHON/blob/d960d3feeed6b1693be47e1a1e7cd48c0b911dac/docs/tetragon-screen-plan.md), [계약 PR #4](https://github.com/wnswp1122/2026_HACKATHON/pull/4))이다. 이 브랜치에 없는 새 계획을 예전 `docs/` 사본으로 대체하지 않는다. 상태 전송은 이 후속 계약을 따르며 기존 이벤트 v1·AI 안전 Snapshot은 변경하지 않는다.

`--check-config`, `--follow`, `--replay PATH`, `--status-follow PATH`, `--status-replay PATH` 중 **정확히 하나**를 선택한다.

## 실행

저장소 루트, Python 3.12 기준이다. 가상환경은 이 폴더의 lock으로 독립 생성한다.

```sh
python3.12 -m venv event-forwarder/.venv
event-forwarder/.venv/bin/python -m pip install -r event-forwarder/requirements.lock
event-forwarder/.venv/bin/python -m pip check
```

[.env.example](.env.example)을 참고해 **기존 파일을 덮어쓰지 않고** 로컬 `event-forwarder/.env`를 작성한다. 이벤트와 `--check-config`에는 `EVENTS_URL`, `INSTANCE_ID`, `INGEST_TOKEN`, `TETRAGON_LOG_PATH`가 필요하다. 상태 모드에는 `STATUS_URL`, `INSTANCE_ID`, `INGEST_TOKEN`만 필요하며 이벤트 URL/파일 설정과 독립이다. `STATUS_URL`을 이벤트 URL에서 조합하지 않는다. `TETRAGON_LOG_PATH`는 실행 호스트의 절대 경로이며, replay와 상태 모드는 CLI로 받은 경로를 읽는다. `.env`는 자동 로딩하지 않는다.

직접 작성한 신뢰할 수 있는 설정만 로드한다. 토큰을 명령 인자·URL·출력에 넣지 않는다.

```sh
chmod 600 event-forwarder/.env
set -a
. event-forwarder/.env
set +a

# 요청 구성만 검사한다. HTTP 전송·인증·파일 읽기 성공을 보장하지 않는다.
event-forwarder/.venv/bin/python event-forwarder/main.py --check-config

# 수신기가 준비된 뒤 실행한다. 항상 sample, 끝 개행이 없어도 처리한다.
event-forwarder/.venv/bin/python event-forwarder/main.py --replay docs/fixtures/sample-events.jsonl

# TETRAGON_LOG_PATH의 현재 끝부터 새 완결 줄만 live로 보낸다.
event-forwarder/.venv/bin/python event-forwarder/main.py --follow
```

follow는 Ctrl+C로 종료한다. 시작 전 미완결 줄의 나머지도 보내지 않으며, 시작 후 쓰인 미완결 줄은 개행까지 보관한다. 빈 줄은 건너뛰고 깨진 JSON·비객체·빈 객체·잘못된 UTF-8은 오류로 집계한 뒤 다음 줄로 진행한다. JSON 숫자와 문자열을 재직렬화하지 않고 원문 객체를 봉투에 넣어 원본 값을 보존한다.

## 동작과 종료

- `inputs.py`: replay의 한 번 읽기, follow의 부분 줄 보관과 0.2초 간격 파일 상태 확인을 담당한다. inode/device 교체·크기 축소·경로 삭제 시 이유와 함께 종료한다.
- `status_input.py`: 상태 JSON의 허용 필드/형식을 확인하고 원자적 파일 교체와 새 관측을 읽는다. 준비 상태·stale·정책 의미는 판정하지 않는다.
- `forwarder.py`: UUID 메시지 봉투, Bearer 헤더, 이벤트/상태 ACK 확인·제한 재시도를 담당한다. 프로세스별 HTTPX Client 하나로 순차 전송하며 redirect와 환경변수 proxy 자동 사용은 비활성이다.
- `main.py`: 모드 선택·설정·입력 오류 처리·최종 집계를 담당한다. 설정은 `settings.py`에서 검증하며 토큰의 repr을 숨긴다. 제어문자·공백이 있는 토큰은 설정 오류다.

ACK는 201/`duplicate: false` 또는 200/`duplicate: true`이고, `eventId`가 UUID 문자열이며 요청 `messageId`와 일치해야 한다. 깨진 JSON·필드 누락/잘못된 타입·ID 불일치는 성공으로 세지 않는다.

HTTPX timeout은 5초다. 네트워크 오류·429·5xx·불명확 ACK는 **최초 1회 + 최대 3회** 시도한다. 같은 직렬화 봉투·messageId로 1/2/4초 뒤 재시도하며, 유효한 `Retry-After` 정수 초가 더 크면 최대 30초까지 기다린다. 다른 4xx와 redirect는 재시도하지 않는다. 401/403은 전체 작업 실패로 즉시 종료하며 남은 줄은 처리하지 않는다. 원본 파일은 수정하지 않는다.

진단은 stderr에 사유·줄 번호·HTTP 상태·재시도 대기만 출력한다. 원본·응답 본문·토큰·URL·예외 전문은 출력하지 않는다. 전송 종료 시 stdout에 집계 JSON 한 줄을 출력한다.

| 집계 | 의미 |
|---|---|
| `accepted` | 유효한 신규 ACK 수 |
| `duplicates` | 유효한 중복 ACK 수. accepted와 별도 집계 |
| `invalid_input` | 건너뛴 잘못된 입력 줄 수 |
| `failed` | 재시도 소진 또는 재시도 없는 전송 실패 이벤트 수 |
| `requests`, `retries` | 실제 요청 시도 수, 그중 재시도 수 |
| `status`, `source` | 종료 사유, live/sample |

| 종료 코드 | 의미 |
|---|---|
| 0 | 설정 검사 성공 또는 replay의 모든 유효 이벤트 ACK 성공 |
| 1 | replay 종료 시 잘못된 입력 또는 최종 전송 실패가 있음 |
| 2 | 잘못된 CLI/설정, 입력 파일 오류·교체·삭제·축소, 401/403 |
| 130 | Ctrl+C/SIGINT. 대기 중이던 부분 줄·전송 중 요청의 전달은 보장하지 않음 |

인증 오류의 `failed`는 시도한 이벤트만 센다. 아직 읽지 않은 파일 전체 건수를 실패 개수로 추정하지 않는다. HTTP 최종 실패 후에는 다음 이벤트로 진행하지만 작업 종료 코드는 실패를 유지한다.

## Docker

```sh
docker --host "unix://$HOME/.lima/2026-hack-client/sock/docker.sock" build -t hack-event-forwarder:local event-forwarder
```

이미지에는 다섯 Python 모듈을 포함하며 `app` 사용자로 실행한다. 토큰은 런타임 환경으로 전달하고, VM의 입력 디렉터리를 read-only mount한다. 원자적 교체를 보려면 상태 파일 하나가 아닌 **상위 디렉터리**를 mount한다. 호스트의 `.env`는 이미지에 포함하지 않는다. VM localhost와 Mac localhost는 다르므로 수신 주소를 실행 위치에 맞춘다. 공유 VM 중지나 기본 Docker context 변경은 필요하지 않다.

## 독립 상태 전송

상태 파일은 JSONL이 아닌 **단일 JSON 객체**이며 루트는 `observedAt`, `collector`, `tetragon` 세 필드만 허용한다. 전송기가 `schemaVersion/messageId/instanceId/source`를 붙여 명시된 `STATUS_URL`로 보낸다. 일반 `rawEvent`나 상태 조회 원문·환경변수는 넣지 않는다. 이름은 1~100자, error/errorCode는 null 또는 최대 300자, sensors 최대 100개·policies 최대 200개를 검증한다. observedAt은 timezone을 포함한 ISO 8601 문자열이며 원래 표기를 유지한다. 상태 enum·필수 필드·bool/null 타입도 새 계획대로 확인한다.

```sh
# 별도 터미널/프로세스에서 실행한다. 이벤트 follow와 한 프로세스로 묶지 않는다.
event-forwarder/.venv/bin/python event-forwarder/main.py --status-follow /absolute/path/to/sensor-status.json

# 보관 파일/합성 입력은 한 번 읽어 sample로 전송한다.
event-forwarder/.venv/bin/python event-forwarder/main.py --status-replay /absolute/path/to/sample-status.json
```

- status-follow는 시작 시 현재 유효 파일을 한 번 보내고 이후 0.5초 간격으로 읽는다. 이벤트가 없어도 새 observedAt 보고를 전송한다. 생산자가 30초마다 실제 조회 후 임시 파일→원자적 교체해야 하며 전송기가 관측 시각을 만들지 않는다.
- 내용이 같으면 재전송하지 않는다. 공백/키 순서가 달라지거나 파일이 교체돼도 직전 보고와 같은 observedAt이면 새 ID를 만들지 않고 `status_same_observation`을 기록한다. 같은 시각의 `Z`/`+00:00` 표기도 동일 관측이다. 값이 달라진 보고도 생산자가 새 observedAt을 발급해야 한다.
- 읽기 실패는 `status_file_error`, 잘못된 JSON/형식은 `invalid_status`로 진단하고 다음 파일 변경을 기다린다. 같은 파일 오류는 반복 출력하지 않으며 마지막 정상 상태를 새 보고로 복사하지 않는다. status-follow는 파일 삭제/교체/복구를 허용하고, event-follow의 회전 종료 동작은 유지한다.
- 상태 ACK는 `reportId` UUID, 요청 messageId 일치, 201/false 또는 200/true가 필요하다. `eventId` ACK로 대신 성공시키지 않는다. 인증·재시도·실패 집계는 이벤트와 같다. 최종 실패한 같은 관측을 계속 새 ID로 재시도하지 않으며 이후 다른 관측은 처리한다.
- 오래된 시각·미래 시각·시계 보정으로 뒤로 간 **다른** observedAt도 원값으로 보낸다. stale/CLOCK_SKEW·최신 보고 선택은 SaaS 책임이며 전송 성공을 센서 정상으로 판정하지 않는다. collector error, reachable=null, 빈 목록도 계약에 맞으면 그대로 전송한다.
- 상태 요약에는 `kind: sensor_status`가 추가된다. `invalid_input`은 잘못된 상태 파일/읽기 실패 횟수이며 같은 관측 건너뛰기는 포함하지 않는다. 상태 replay의 잘못된 JSON은 exit 1, 읽기 실패는 exit 2다. 상태 follow는 오류 후 복구를 기다리고 Ctrl+C 때 exit 130으로 집계한다.

보관하는 것은 실행 중 직전 파일과 직전 관측뿐이다. 재시작 시 현재 파일을 새 ID로 한 번 보낼 수 있지만 observedAt은 바꾸지 않는다. 영속 중복 제거/큐/누락된 중간 보고 복구는 없다.

## 기존 이벤트 수동 검증 기록 — dad8ab5, 2026-10-31

아래는 문서 예시를 실행 결과로 간주한 기록이 아니라, 이번 워크트리에서 실제 프로세스를 기동하고 수신 요청·stdout/stderr·종료 코드를 확인한 결과다. 자동 테스트/CI는 추가하지 않았다.

환경: macOS ARM64/Darwin 25.6.0, Python 3.12.2, 독립 `.venv`, HTTPX 0.28.1. lock 설치와 `pip check` 성공. 임시 Python 표준 라이브러리 `ThreadingHTTPServer`를 `127.0.0.1:18765/api/events`에 띄우고 응답 상태·ACK·지연을 바꾸었다. 토큰은 로컬에서 임의 생성해 환경변수와 헤더로만 전달했다. 수신기는 제품 SaaS가 아니며 DB 저장·인증 정책을 구현하지 않았다.

실행 진입점은 `event-forwarder/.venv/bin/python event-forwarder/main.py`였다. 기본 입력은 `--replay docs/fixtures/sample-events.jsonl`과 그 복사본이다. 오류·수치·부분 줄 입력은 이번 확인을 위해 별도로 만든 합성 데이터다. 임시 수신기와 시나리오 파일은 검증 후 정리했으며 제품 코드에 포함하지 않았다.

| 직접 실행한 조건/조작 | 관찰한 결과 |
|---|---|
| `--check-config`, 모드 조합 오류 | 정상 설정 exit 0, HTTP 요청 0건. `--check-config --replay ...`는 exit 2, 요청 0건 |
| sample 1줄 + 201 ACK | accepted 1, exit 0. v1의 다섯 필드, UUID, instanceId, source=sample, JSON Content-Type, Bearer 헤더 일치 확인. 수신 rawEvent가 fixture와 같음 |
| 200 중복 ACK | accepted 0 / duplicates 1, exit 0. 실제 DB 중복 제거 검증은 아님 |
| 빈 줄·깨진 JSON·배열·빈 객체·null·NaN·깨진 UTF-8 사이 정상 줄, 마지막 개행 제거 | 빈 줄 제외, invalid_input 6 / accepted 3, exit 1. `1e999`는 유효 JSON으로 전달하고 뒤의 두 fixture도 수신 |
| 큰 정수·긴 소수·`1e999`·한글 | 수신 rawEvent 부분의 원문 SHA256이 입력과 일치, accepted 1, exit 0 |
| 요청 ID 불일치·깨진 JSON ACK·잘못된 eventId·정수 duplicate·201/true | 각각 4요청/3재시도 후 failed 1, exit 1. 모든 시도에서 ID와 본문 SHA256 동일 |
| 503 후 201, 429/Retry-After=2 후 201 | 각각 2요청으로 복구, 대기 약 1.01초/2.01초, exit 0 |
| 429/Retry-After=999 후 201 | 실제 대기 약 30.01초로 상한 확인, exit 0 |
| 계속 500·503·429 | 각각 4요청 후 failed 1, exit 1. 요청 간격 약 1/2/4초 |
| 첫 이벤트만 계속 500, 다음 이벤트 201 | 요청 상태 `[500,500,500,500,201]`, failed 1 / accepted 1, exit 1 |
| 400·404·409·422, 정상 입력 2줄 | 각각 재시도 0 / failed 2 / 요청 2, exit 1 |
| 401·403, 정상 입력 2줄 | 각각 첫 요청에서 failed 1 / 요청 1, exit 2. 두 번째 줄 요청 없음 |
| 302 Location이 다른 로컬 포트 | 재시도 없이 302 실패 집계. redirect 목적지 요청 없음 |
| 응답을 5.6초 지연한 뒤 재시도에 200 중복 ACK | 약 5초 timeout + 1초 대기 후 같은 ID/본문으로 복구. duplicates 1, exit 0 |
| 모든 응답을 5.6초 지연, 연결 거부 포트 | 각각 4요청 시도/3재시도 후 failed 1, exit 1. 지연 시나리오 전체 약 27.14초 |
| follow: 기존 완결 줄과 미완결 줄 이후 시작 | 기존 부분 줄을 완성해도 요청 0. 새 UTF-8 문자를 바이트 중간에서 나눠 쓰고 JSON을 완성해도 개행 전 0, 개행 후 1건 |
| follow: 빈 줄·깨진 줄·pending 상태에서 rename/새 파일 생성 | accepted 1 / invalid_input 1 이후 input_replaced, exit 2. 새 파일 내용 전송 없음 |
| follow: 새 줄 ACK 후 파일을 0바이트로 축소 | accepted 1 이후 input_truncated, exit 2 |
| follow: 경로 삭제, 재시작 후 새 줄·SIGINT | 삭제는 input_removed/exit 2. 재시작은 기존 줄을 제외하고 새 줄 1건만 수신, SIGINT 집계 후 exit 130 |
| 재시도 대기 중 SIGINT | 요청 1 / 실제 retries 0으로 집계하고 exit 130. 예약된 재시도를 실행 횟수로 세지 않음 |
| 설정 누락·잘못된 URL·제어문자 토큰·101자 instanceId | 모두 값 노출 없이 exit 2 |
| 토큰·원본 비노출, 잘못된 proxy 환경변수 | 생성 토큰을 각 실행 stdout/stderr에서 대조해 미검출. 깨진 줄의 원문도 출력되지 않음. 도달 불가 HTTP_PROXY/HTTPS_PROXY를 설정해도 정상 수신 |

### Linux VM의 실제 입력 확인

공유 VM `2026-hack-client`의 kernel 6.8.0-142-generic / Docker Engine 29.1.3에서 이번 Dockerfile을 빌드했다. `~/2026-hack-runtime/tetragon/events.jsonl`이 존재해 sample과 별도로 확인했다.

- 전용 소켓을 `--host`로 지정했다. 기본 context는 `desktop-linux`를 유지했다.
- 일회성 수신기 `hack-forwarder-manual-receiver`만 VM loopback:18765에 띄웠다. 실제 SaaS가 아니다.
- `hack-forwarder-manual-live`를 `app` 사용자, JSONL 디렉터리 read-only mount, `--follow`로 기동했다. `/usr/bin/true` 실행을 포함한 확인 구간에서 새 이벤트 **9건**을 읽어 source=live, 정상 헤더, 201 ACK로 수신했다. accepted 9 / invalid_input 0 / failed 0. SIGINT 후 집계와 exit 130 확인.
- 같은 이미지에서 fixture를 `--replay /tmp/sample.jsonl`로 실행해 sample 1건 ACK, exit 0을 확인했다. `--check-config`도 inputExists=true였다.
- 마지막 집계 수정 후 이미지를 다시 빌드하고 fixture를 503→201로 전송했다. 같은 ID/본문, 요청 2 / retries 1 / accepted 1, exit 0을 확인했다.
- 실제 JSONL 내용은 진단 로그·Git에 복사하지 않았다. 위 9건은 전송 확인이며 개별 정책의 의미·대응 결과 검증이 아니다.

검증용 컨테이너 4개와 호스트 임시 수신기·토큰·시나리오 파일을 정리했다. VM이 Running이고 다른 담당의 hack-demo/hack-board-dev/hack-tetragon이 계속 실행 중임을 다시 확인했다. VM 설정은 변경하지 않았으며 원본 JSONL은 읽기 전용으로 사용했다. 빌드 이미지 `hack-event-forwarder:manual-forwarder`와 독립 `.venv`는 로컬에 남겼다.

## 미확인과 한계

**실제 SaaS 연동은 미확인**이다. 팀원 수신기의 인증·허용 instanceId·DB 저장·유일 제약·실제 중복 제거, 대시보드·AI, Tetragon의 정책 대응 효과는 이 작업의 검증에 포함하지 않았다. 공통 계약 변경은 필요하지 않았다.

영속 큐·체크포인트·자동 회전 복구·전송 병렬화는 없다. 최종 실패한 이벤트는 기록 후 넘어간다. follow 재시작은 현재 끝부터이며 이전 미전송 데이터를 복구하지 않는다. replay/재시작은 새 ID를 생성하므로 모든 실제 이벤트의 중복 제거·무손실 전송을 보장하지 않는다. 0.2초 확인 또는 HTTP 재시도 사이에 파일이 축소된 뒤 이전 크기 이상으로 다시 자라면 축소를 관찰하지 못할 수 있다. 종료 시 미완결 줄과 ACK 불명확 요청의 수신 여부도 보장하지 않는다.

## 5화면 계획 적용 수동 검증 — d960d3f 기준, 2026-10-31 04:39 KST

기존 이벤트 검증 기록과 구분되는 **이번 상태 전송 구현의 실행 결과**다. Python 3.12.2 / 기존 독립 `.venv`와 lock을 사용했으며 `pip check`, 다섯 모듈 구문 검사, `git diff --check`가 통과했다. CI/자동 테스트는 추가하지 않았다.

소유 폴더의 Git 제외 `.local/status-manual/`에 일회성 표준 라이브러리 HTTP 수신기와 합성 상태 파일을 만들고 `127.0.0.1:18775/api/sensor-status`로 보냈다. 상태 파일의 고정 observedAt은 `2026-10-30T18:00:00Z`였다. `main.py --status-replay <합성 JSON>` 또는 `--status-follow <합성 JSON>`를 실제 프로세스로 기동해 수신 기록·ID·본문 SHA256·시각·종료 코드와 stdout/stderr를 확인했다. 수신기는 **제품 SaaS가 아니며**, 합성 파일을 follow해 `source=live`가 붙은 결과도 실제 Tetragon 상태 실측으로 해석하지 않는다.

| 직접 실행한 조건 | 관찰 결과 |
|---|---|
| EVENTS_URL/TETRAGON_LOG_PATH를 제거한 상태 replay | STATUS_URL과 공통 인증만으로 201/accepted 1, exit 0. 본문은 v1 신원 4필드와 observedAt/collector/tetragon 3필드뿐, source=sample, Bearer·Content-Type 정상 |
| 정상/중복 상태 ACK | 201 신규 accepted 1, 200 중복 duplicates 1, 각각 exit 0. 실제 DB 중복 제거 검증은 아님 |
| 요청 ID 불일치·깨진 응답·잘못된 reportId·eventId만 있는 ACK·정수 duplicate | 각각 같은 ID/본문으로 4요청/3재시도 후 failed 1, exit 1. 깨진 응답 본문에 토큰을 넣어도 로그에 노출되지 않음 |
| 503→201, 429/Retry-After=2→201 | 각각 약 1초/2초 대기 후 복구, 요청 2 / retries 1, exit 0 |
| 첫 응답 5.6초 지연→재시도 200 중복 | 약 5초 timeout+1초 대기, 동일 ID/본문으로 duplicates 1, 약 6.14초 뒤 exit 0 |
| 계속 500 또는 429 | 각각 1/2/4초 대기, 요청 4 / retries 3 / failed 1, exit 1 |
| 401·403 | 요청 1 / retries 0 / failed 1, exit 2. 409·422·302는 재시도 없는 failed 1 / exit 1 |
| 파일이 그대로인 follow, 내용 동일 원자적 교체 | 최초 1회 이후 요청 증가 없음. JSON 내용/observedAt/UUID를 주기적으로 새로 만들지 않음 |
| 같은 observedAt의 다른 collector 값, Z→+00:00 표기 변경 | status_same_observation으로 건너뛰고 새 요청/ID 없음 |
| 오래된 observedAt으로 시작, 파일 삭제→기존 정상 상태 복원→깨진 JSON→새 관측 교체 | 과거 시각을 전송 시각으로 덮지 않음. 삭제/잘못된 파일 중 재전송 0, 새 관측에서 복구. 삭제/깨진 파일 각 1회 진단, 전체 accepted 4 / invalid_input 2, SIGINT exit 130 |
| collector=error, reachable=null, 빈 sensors/policies | 유효한 오류 상태를 그대로 ACK 처리. 전송기가 정책 0개·센서 정상으로 해석하지 않음 |
| 과거로 이동한 다른 observedAt, 미래 observedAt | 각각 입력 시각 그대로 수신. SaaS의 stale/clock-skew 판정 실행은 미검증 |
| 상태가 500 재시도 중인 두 프로세스 동시 실행 | 수신 순서에 상태 500→이벤트 201→상태 500 확인. 이벤트 follow accepted 1. 상태는 4회 소진 뒤 failed 1이고, 파일 불변 대기 중 요청 5회째나 새 ID 없음 |
| 알 수 없는 필드/파일 내부 source, naive 시각, 빈/101자 이름, 301자 error, sensors 101개/policies 201개, 숫자 reachable, 잘못된 enum, 필수값 누락 | 각각 invalid_input 1 / 요청 0 / exit 1. 토큰을 가진 추가 필드도 전송되지 않음 |
| 깨진 JSON·UTF-8·배열, 없는 replay 파일 | 형식 오류는 요청 0/exit 1, 파일 읽기 실패는 input_error/exit 2 |
| STATUS_URL 누락·잘못된 scheme·URL credentials, 모드 없음/중복 | 값 노출 없이 exit 2. 임의 endpoint 조합 없음 |
| 이벤트 회귀 | 기존 sample-events.jsonl의 201·200 중복·503 후 복구 모두 exit 0, 이벤트 신원 4필드+rawEvent 유지. --check-config는 네트워크 0건. 병행 event-follow도 새 완결 줄 1건 ACK |
| 토큰 비노출 | 생성 토큰을 실행 stdout/stderr와 HTTP 본문에서 대조해 미검출. 인증 헤더로만 전달. 상태/응답/예외 전문을 진단에 싣지 않음 |

Linux VM의 전용 Docker 소켓을 명시해 `hack-event-forwarder:status-manual`을 빌드했다. 소유 label `owner=event-forwarder`를 붙인 일회성 수신기와 replay 컨테이너에서 **합성 상태**를 503→201로 전송했다. 제품 전송기 사용자 `app`, accepted 1 / requests 2 / retries 1, exit 0, 같은 ID/본문·원래 observedAt·헤더 일치를 확인했다. EVENTS_URL/TETRAGON_LOG_PATH는 컨테이너에 전달하지 않았다.

이후 Tetragon 담당이 제공한 **실제 조회 상태 파일** `/home/junje.guest/2026-hack-runtime/tetragon/status.json`(권한 644)을 별도로 확인했다. 상위 디렉터리를 read-only mount하고 `app` 사용자로 status-follow를 실행해 source=live, observedAt=`2026-10-30T19:41:04.137880Z`, collector.state=unknown/errorCode=SENSOR_STATUS_UNSUPPORTED, reachable=true/version=1.8.0, sensors 0개/policies 2개인 보고를 임시 수신기에 1건 보냈다. accepted 1 / invalid_input 0 / failed 0, 토큰 비노출, SIGINT 집계와 exit 130을 확인했다. 센서 목록 미지원 상태를 ready로 바꾸지 않았으며, 이 결과도 실제 SaaS 저장 성공은 아니다.

검증용 컨테이너 총 네 개는 소유 label 확인 후 삭제했고 호스트 임시 수신기·토큰·합성 파일도 정리했다. 기본 Docker context는 desktop-linux, 공유 VM은 Running을 유지했다. 다른 담당의 컨테이너·정책·수집기는 중단하지 않았다. 빌드 이미지와 독립 `.venv`는 로컬에 유지했다.

### 조정 담당·Tetragon·core 연결 사항

- 이번 기준은 위의 원격 계획 `d960d3f`이며 필요한 추가 공통 필드·정책 매핑 변경은 **없다**. 기존 이벤트 rawEvent는 그대로 전달한다. 파일/네트워크 정규화와 정책명 매핑은 Tetragon/core 책임이다.
- **Tetragon 입력:** 실제 상태 경로는 위 VM의 `tetragon/status.json`이다. root는 observedAt/collector/tetragon, 중첩 필수 필드는 새 계획과 같다. 새 측정마다 새로운 timezone 포함 observedAt, 30초 주기·원자적 교체, 안전한 error/errorCode를 생산자가 보장한다. 조회 오류는 빈 목록만으로 정상처럼 표현하지 않으며 collector 상태/사유를 함께 넣는다. 한도 초과는 생산자가 목록을 100/200개 내로 만들고 collector.state=error/errorCode=STATUS_LIMIT_EXCEEDED로 명시한다. 전송기는 임의 잘라내기·정상 상태 생성·정책 판정을 하지 않는다. Tetragon v1.8.0 ListSensors 미지원은 SENSOR_STATUS_UNSUPPORTED/unknown으로 유효하게 전달한다. 생산자 사유 TETRAGON_STOPPED, TETRAGON_UNREACHABLE, POLICY_QUERY_FAILED, COLLECTOR_STOPPED, STATUS_LIMIT_EXCEEDED를 이름으로 재분류하지 않고 그대로 보존한다.
- **core 입력:** VM에서 접근 가능한 `/api/sensor-status` 전체 URL, 기존 토큰/허용 instanceId, reportId UUID ACK가 필요하다. 토큰은 Git·메시지·명령 인자 대신 런타임 환경으로 연결한다. core의 진행 중 상태 모델/라우터를 읽어 필드·ACK의 정적 일치를 확인했지만 해당 서버 기동·저장은 이번 증거가 아니다.
- 동일 observedAt의 수정 보고는 새 관측으로 보내지 않는다는 점과 시작 시 기존 파일 1회 전송, 다른 과거/미래 시각의 원값 전달 방침을 조정 담당에게 Orca 메시지로 알렸다. 초기 ‘이전 시각도 무조건 무시’ 제안은 정정했다. Tetragon/core에도 연결 사항을 알렸다. 메시지 enqueue는 상대의 확인·합의 완료를 뜻하지 않는다.
- **실제 통합 미검증:** 실제 상태 파일→이 전송기→임시 수신기 1건은 확인했지만 SaaS DB→readiness/5화면의 연결, 30초 운영 주기, SaaS 90초 stale/CLOCK_SKEW·중복 신선도·최신 보고 선택은 확인하지 않았다. SaaS 주소·인증과 생산자 daemon 운영 입력이 준비되면 기존 작업에서 연결 검증할 수 있다. 임시 수신기의 성공을 SaaS 저장 성공으로 보고하지 않는다.
