# 수집·정책 상태 생산자

LiteSOC의 **AI 기반 서버 보안 모니터링·분석 플랫폼** 중 사용자 서버 상태 생산자다. 기준은 `d960d3f` [5개 화면 계약](https://github.com/wnswp1122/2026_HACKATHON/blob/d960d3feeed6b1693be47e1a1e7cd48c0b911dac/docs/tetragon-screen-plan.md). HTTP 전송은 전송기 소유이며 이 코드는 토큰·SaaS 설정을 읽지 않는다.

## 경로와 형태

- VM `~/2026-hack-runtime/tetragon/status.json`, 이번 절대 경로 `/home/junje.guest/2026-hack-runtime/tetragon/status.json`, mode644.
- 내용은 **observedAt/collector/tetragon만** 있는 JSON 객체 한 개다. source/instanceId/schemaVersion/messageId는 전송기가 붙인다. 배열/JSONL/일반 보안 이벤트가 아니다.
- 같은 디렉터리에 임시 파일을 쓰고 flush/fsync한 뒤 `os.replace`한다. 독자는 교체 전/후 완성 파일을 읽는다. 상위 디렉터리를 read-only mount해야 한다. 파일 하나만 bind mount하면 inode 교체를 못 볼 수 있다.
- observedAt은 해당 조회가 끝난 UTC 시각이다. 수집 시작은 monotonic clock 기준30초 주기이며 조회 소요 시간에 따라 완료 시각 간격은 달라진다. 30초는 MVP 선택이다. HTTP 전송 시각으로 덮어쓰지 않는다.
- `status-collector.log`는 안전한 상태/코드만 출력하는 진단 파일, `events.jsonl`은 Tetragon 원본이다. 서로 섞지 않는다.

실제 상태 예시는 [status-enabled.json](evidence/screen-plan/status-enabled.json), [상태 실패 기록](evidence/screen-plan/status-operations.json)에 있다. 이 저장 파일을 replay하면 `source=sample`이며 과거 측정을 현재 live로 보내지 않는다.

## 실제 관리 조회와 제한

소유 label을 확인한 `hack-tetragon` 안에서 아래 CLI를 사용한다. TCP 포트를 열지 않는다.

```sh
docker exec hack-tetragon tetra --server-address unix:///var/run/tetragon/tetragon.sock --timeout 1s --retries 0 version --server
docker exec hack-tetragon tetra --server-address unix:///var/run/tetragon/tetragon.sock --timeout 1s --retries 0 status
docker exec hack-tetragon tetra --server-address unix:///var/run/tetragon/tetragon.sock --timeout 1s --retries 0 tracingpolicy list -o json
docker exec hack-tetragon tetra --server-address unix:///var/run/tetragon/tetragon.sock --timeout 1s --retries 0 sensors list
```

서버 버전 `v1.8.0`, `Health Status: running`, JSON 정책 목록을 실제 확인했다. `tetra version` 단독은 CLI 버전만 출력하므로 서버 버전 근거로 쓰지 않는다. [공식 v1.8.0 버전 CLI](https://github.com/cilium/tetragon/blob/v1.8.0/cmd/tetra/version/version.go), [GetHealth 구현](https://github.com/cilium/tetragon/blob/v1.8.0/pkg/health/health.go)을 확인했다.

**v1.8.0 서버의 ListSensors RPC는 항상 deprecated 오류를 반환한다.** 직접 실행 및 [공식 서버 구현](https://github.com/cilium/tetragon/blob/v1.8.0/pkg/server/server.go)에서 확인했다. 정책 목록의 sensor 이름이나 게시판 health/이벤트 수를 개별 센서 상태로 바꾸지 않는다. 따라서 정상 관리 조회에서도 `collector={state:"unknown",errorCode:"SENSOR_STATUS_UNSUPPORTED"}`, `sensors=[]`이며, `reachable=true`, 실제 version/policies는 남긴다. 이 보고는 유효하지만 ready 증거가 아니다. 이 버전에서 개별 센서 enabled/disabled 실측은 미지원이다.

| 필드/상태 | 직접 사용한 근거 |
|---|---|
| reachable | 서버 version 조회 성공 → true; 자기 컨테이너 중단/관리 socket 도달 실패 → false; Docker 조회 실패·소유 불일치·collector 종료 → null |
| version | `version --server`의 `Server version: v1.8.0` → `1.8.0`; 실패 시 null |
| policies.name | `tracingpolicy list -o json`의 `policies[].name`, 그대로 |
| policies.state | `TP_STATE_ENABLED`→enabled, `TP_STATE_DISABLED`→disabled, `TP_STATE_LOAD_ERROR`/`TP_STATE_ERROR`→error, 나머지→unknown |
| policies.error | 실제 정책 error 존재/오류 state이면 안전한 `POLICY_LOAD_ERROR`; 원문 오류는 파일에 복사하지 않음 |
| sensors | 실제 목록 API 미지원이면 []와 위 명시적 unknown 사유. 지원되지 않은 기본 센서 이름/상태를 만들지 않음 |
| 목록 한도 | sensors100/policies200 초과는 잘라낸 목록과 `collector.state=error/errorCode=STATUS_LIMIT_EXCEEDED`. 정상 목록으로 포장하지 않음 |

이름100자, 오류/코드300자 이하를 지킨다. 비정상 이름/응답은 collector 오류다. raw status 응답·Docker 설정·환경변수·토큰을 전송하지 않는다. 전송기가 마지막 정상 파일을 새 상태처럼 재전송해서는 안 된다.

## 오류와 중단의 구별

| 안전한 errorCode | 의미 |
|---|---|
| SENSOR_STATUS_UNSUPPORTED | 관리 API 도달 가능하지만 센서 목록 API 미지원; collector unknown |
| TETRAGON_STOPPED | 소유 컨테이너가 실제 중단됨; collector error/reachable false |
| TETRAGON_UNREACHABLE | 실행 중인 소유 컨테이너의 관리 API 조회 실패; error/reachable false |
| HEALTH_QUERY_FAILED / POLICY_QUERY_FAILED / SENSOR_QUERY_FAILED | 버전 조회는 성공했으나 해당 조회 실패. error; 확인된 도달성과 다른 성공 필드는 같은 조회 사이클의 근거만 유지 |
| COLLECTOR_STOPPED | 수집기 자체의 SIGTERM/SIGINT 정상 종료에서 마지막 중단 보고. reachable/version은 null, 목록은 [] |
| STATUS_COMMAND_FAILED / TETRAGON_CONTAINER_UNAVAILABLE / RESOURCE_NOT_OWNED | Docker 실행 실패·확인 불가·소유 불일치. 다른 컨테이너를 조회/정지해서 대체하지 않음 |
| STATUS_INVALID_* / STATUS_LIMIT_EXCEEDED | 지원 구조/값/한도를 벗어남; 정상으로 추측하지 않음 |

정책 로드 오류는 `policies[].state=error`로 별도 표시한다. collector가 센서 미지원 unknown이어도 이 정책 오류를 누락하지 않는다. empty 정책 목록과 조회 실패를 구분한다. report 자체는 매 사이클 새로 만들며 이전 성공의 version/목록을 재사용하지 않는다.

writer 파일 오류는 stderr `STATUS_WRITE_FAILED`와 exit1이다. 새 정상 observedAt을 만들지 못하므로 마지막 파일은 그대로 오래되며 SaaS가 stale을 표시해야 한다. 갑작스런 SIGKILL/VM 장애에서는 최종 중단 보고를 보장할 수 없고 기존 observedAt이 오래된다. stale90초/미래30초 판정은 SaaS 책임이며 수집기가 시각을 보정해 숨기지 않는다.

## 실행·종료

README의 새 소스 복사 후 VM 내부에서 실행한다. 독립 lock은 이 폴더 requirements.lock(외부 패키지 없음)으로 설치한다.

```sh
cd ~/2026-hack-runtime/tetragon/src
.venv/bin/python sensor_status.py --once
cat ../status.json
# foreground: 30초마다 실조회. Ctrl+C는 COLLECTOR_STOPPED를 원자적으로 기록한다.
.venv/bin/python sensor_status.py
```

같은 출력 경로의 lock을 잡은 수집기가 있으면 `COLLECTOR_ALREADY_RUNNING`/exit1이며 기존 수집기와 파일을 보존한다. `--once`도 이 lock을 지킨다. collector error 보고의 `--once` 종료 코드는1, unknown/ok는0이다. 이는 수집/기록 CLI 결과이며 서버의 보안 정상 판정이 아니다.

현재 검증 후 남긴 수집기는 `status-collector.pid`에 PID, `status-collector.log`에 안전한 진단을 남기고 실행 중이다. 임의 PID를 종료하지 말고 아래처럼 자기 UID·정확한 스크립트 경로를 확인한다.

```sh
python3 - <<'PY'
import os, signal
from pathlib import Path
root = Path.home() / '2026-hack-runtime/tetragon'
pid = int((root / 'status-collector.pid').read_text())
process = Path(f'/proc/{pid}')
expected = str(root / 'src/sensor_status.py').encode()
if process.stat().st_uid != os.getuid() or expected not in (process / 'cmdline').read_bytes().split(b'\0'):
    raise SystemExit('COLLECTOR_PID_NOT_OWNED')
os.kill(pid, signal.SIGTERM)
PY
```

`runtime.py stop`은 정책과 Tetragon만 종료한다. 상태 수집기를 계속 두면 센서 중단을 새 보고로 알릴 수 있다. 상태 수집기를 종료하는 것과 센서를 종료하는 것을 혼동하지 않는다. 운영 서비스 자동 설치나 VM 시작/중지 관리는 추가하지 않았다.

## 실제 검증과 미확인

- version/health/정책 성공, 센서 목록 미지원, 정책 disabled, 존재하지 않는 좁은 훅의 `TP_STATE_LOAD_ERROR`, 관리 socket 임시 경로 변경 후 도달 실패·복구, 자기 센서 stop/start와 HTTP health 유지, 정책0개 보고를 확인했다. 오류 시연 정책은 삭제했고 socket은 finally에서 복구했다.
- 주기 writer의 완결 JSON 연속 읽기, observedAt 변경, 중복 writer 거부, SIGTERM 최종 중단 보고·재기동을 확인했다. 실제 완료 간격·읽기 횟수는 [주기 증거](evidence/screen-plan/periodic-evidence.json)에 있다. 첫 측정은 완료 간격31.93/30.19초로, 임의31.5초 검사 상한을 넘었고 종료 보고를 기록했다([첫 원본 기록](evidence/screen-plan/periodic-first.json)). 완료 간격을 무조건 정확히30초라고 보고하지 않는다.
- 미확인: 실제100/200 초과 구성, 정책/센서 API의 모든 오류 조합, 개별 센서 상태, 강제 종료/파일시스템 장애의 모든 조건, 장기 실행·호스트 시계 변경·파일 회전, 제품 SaaS 저장/화면 조회. 해당 코드 분기와 계약을 실측 완료로 확대하지 않는다.
