# LiteSOC · Tetragon 사용자 서버 런타임

제품 소개는 **AI 기반 서버 보안 모니터링·분석 플랫폼**, 시각 브랜드는 **LiteSOC**다.

**현재 단일 기준은 `d960d3f`의 [Tetragon 5개 화면 계획](https://github.com/wnswp1122/2026_HACKATHON/blob/d960d3feeed6b1693be47e1a1e7cd48c0b911dac/docs/tetragon-screen-plan.md), [PR #4](https://github.com/wnswp1122/2026_HACKATHON/pull/4)다.** 이 브랜치의 오래된 공통 docs만 읽고 후속 계약을 판단하지 않는다. 기존 v1 이벤트 봉투와 AI 안전 Snapshot 계약은 유지한다.

전용 VM에서 exec/file/network/exit, 기존 probe SIGKILL·해제 후 복구, 관리 조회·정책 비활성/오류·센서 중단과 상태 파일을 실측했다. 성공/거부 연결 모두 이벤트가 생기므로 연결 성공/전송량/공격으로 표현하지 않는다. **개별 센서 목록은 v1.8.0 관리 API에서 미지원**이며 준비 정상으로 포장하지 않는다.

`tetragon/`만 수정한다. 현재 사용자 승인에 따라 `demo-board`의 코드를 읽어 자기 `hack-demo` 이미지만 갱신했고, 볼륨/probe를 보존했다. `hack-board-dev`, 다른 DB/컨테이너, VM 생명주기와 Docker context는 변경하지 않았다. 다른 브랜치를 merge/cherry-pick하지 않았다.

## 5개 화면 후속 구현과 현재 전달 사항

| 제공 항목 | 구현·실측·연결 |
|---|---|
| 네트워크 | `hack-demo-network`, `tcp_connect` arg0=`sock`, 별도 net-probe + 현재 hack-demo Mnt + `127.0.0.1:8080/18080`, Post만 사용. `CONNECT_OK`/0과 `ECONNREFUSED`/1 모두 실제 원본 확보 |
| 파일/SIGKILL | 기존 `hack-demo-observe`/`hack-demo-enforce` 조건 유지. 대응 중 별도 net-probe 정상·health 정상, 기존 파일 probe만137. 해제 후 정상 복구 |
| 정규화 연결 | [필드 매핑](field-mapping.md)의 policy/hook/인자 타입을 core에 전달. `parentExecId`는 실제 `parent.exec_id`; 파일 `operation=read`, 네트워크 `operation=connect`, `protocol=TCP`; 미관찰 필드는 null, outcome은 unknown |
| 상태 파일 | VM `~/2026-hack-runtime/tetragon/status.json`, 30초 시작 주기, 새 observedAt, 임시파일→원자적 교체. 이벤트/진단과 분리. [상태 계약·실행·제약](status.md) |
| 미지원 센서 목록 | `tetra sensors list` → 실제 `ListSensors is deprecated`. `collector.state=unknown/errorCode=SENSOR_STATUS_UNSUPPORTED`, `sensors=[]`, 실제 reachable/version/policies를 유지. 빈 센서를 ready로 보지 않음 |
| 상태 실패 | 실제 `TP_STATE_DISABLED`, `TP_STATE_LOAD_ERROR`, 관리 socket 조회 실패, 자기 Tetragon 중단, collector SIGTERM 종료를 각각 기록. raw CLI 오류/설정/환경변수는 전송하지 않음 |
| 같은 대상 CRUD | `demo-board` `fd05cd4`의 깨끗한 demo 소스를 읽어 `hack-demo:tetragon-runtime` 빌드. 이미지 `sha256:3a783171c3a0fbe422681254ac1897ba84782adccfbed86444247a17dbace094`; 같은 DB 볼륨·read-only probe 유지 |

같은 대상 CRUD는 게시판 담당이 2026-10-30 UTC 19:40:44.425–19:40:45.010에 검증했다. 관찰 두 정책의 enabled/monitor_only를 전후 조회했고 HTTP 20요청(생성201, 조회/수정200, 오류422, 삭제204, 삭제 후404), 생성ID1만 정리·0건→0건을 기록했다. 직접 읽은 증거는 [demo-board f18c9f8의 same-target-crud.json](https://github.com/wnswp1122/2026_HACKATHON/blob/f18c9f813550e75bc311ea8999a4a100d327ab1f/demo/evidence/same-target-crud.json), [Draft PR #8](https://github.com/wnswp1122/2026_HACKATHON/pull/8)이다. 게시판 담당의 HTTP 검증과 이 작업의 커널 원본 검증은 구분한다. 이 이미지 갱신은 소스 통합이 아니다.

이번 원본과 실행 기록은 [evidence/screen-plan](evidence/screen-plan/README.md)에 있다. `network`와 `network-off`는 파일 정책을 유지한 채 자기 네트워크 정책만 적용/해제한다. 파일 observe/enforce만 상호 교체한다. `off`는 자기 세 정책을 해제한다. 잘못된 정책 시연용 `hack-demo-status-error`는 삭제했다.

현재 운영 시연 상태는 **observe/network 두 Post 정책 활성, enforce 해제, 자기 상태 수집기 실행**이다. 상태 수집기 PID와 로그는 VM `tetragon/status-collector.pid`, `status-collector.log`에 있다. 종료 절차와 stale 경계는 [status.md](status.md)를 따른다.

실제 SaaS→5화면·AI 통합은 미검증이다. IPv6/UDP/accept/전송량·외부 통신 위치는 실측하지 않았다. 여기서 관찰한 loopback IP에 위치를 만들거나 GeoIP를 호출하지 않는다. 센서 목록 한계 때문에 준비 상태가 ready라고 주장할 수 없다. CI/자동 테스트를 추가하지 않았고 아래 기록은 실제 기동·수동 확인이다.

## 최초 구현 재현과 이전 실측 기록

아래 환경·4단계 표는 `1e94262`에서 시작해 `5f7b473`으로 남긴 최초 실행 기록이다. 당시 health-only/정책 해제 상태와 이번 후속 상태를 혼동하지 않는다. 설치 명령은 새 probe/status 파일도 복사하도록 갱신했다.

## 구성과 범위

- `probe.py`: `/tmp/hack-demo/protected.txt`만 읽고 정확히 `demo-only` 9바이트인지 확인한다. 정상 `READ_OK`/0, 읽기 오류 `READ_ERROR`/1, 내용 불일치 /2. HTTP 요청으로 실행하지 않는다.
- `runtime.py`: **Linux VM 내부**에서 준비·기동·정책 교체·조회·해제·probe·health·센서 종료를 수행한다. 컨테이너와 DB 볼륨의 소유 label을 확인하며 기존 컨테이너를 자동 삭제하지 않는다.
- `policies/observe.yaml`, `enforce.yaml`, `network.yaml`: 현재 `hack-demo`의 mount namespace를 치환해서 적용하는 템플릿. 파일 두 정책은 교체하고 네트워크 관찰은 독립 적용한다.
- `requirements.lock`: 표준 라이브러리만 사용한다. 서버 의존성을 복사하지 않는다.
- `evidence/`: 비밀정보 없는 시연에서 선택한 실제 원본 줄과 실행 결과. 전체 호스트 이벤트는 Git에 넣지 않았다.

단일 selector 안에서 아래 조건을 **모두** 만족해야 한다.

1. binary = `/usr/local/bin/hack-demo-probe` (일반 서버 Python과 다른 실제 실행파일 복사본).
2. Mnt namespace = 소유 컨테이너 `hack-demo`의 현재 namespace.
3. `security_file_permission`의 arg0(`struct file *`) 경로 = `/tmp/hack-demo/protected.txt`.
4. arg1(`int mask`) = `4` (`MAY_READ`).

관찰은 `Post`, 대응은 `Sigkill`이다. 명령 인자의 파일명으로 접근을 추정하지 않는다. Pod selector, HTTP 서버/호스트 관리 프로세스에 대한 대응, 임의 명령 실행 API는 없다. 별도 실행파일도 Python이므로 이 경로를 다른 용도로 재사용하지 않는다.

## 확인한 환경

2026-10-31 KST 실행. 원본은 UTC `2026-10-30T18:26–18:28Z`다. 호스트 실행 기록과 VM 시계에는 약 2초 차이가 있어 시각 비교만으로 인과를 판정하지 않는다.

| 항목 | 실제 값 |
|---|---|
| VM | 기존 `2026-hack-client`, Ubuntu 24.04.5 LTS, aarch64, rootful Docker 29.1.3 |
| 커널 | `6.8.0-142-generic`, `/sys/kernel/btf/vmlinux` 읽기 가능 |
| Tetragon | v1.8.0, `quay.io/cilium/tetragon@sha256:5ed9088a1582131d71b06c98e0d549a37a71ae63ab13aabefc7a47553c822a9d` |
| 버전 확인 | `docker exec hack-tetragon tetra version` → `CLI version: v1.8.0`; 동일 이미지의 센서 로드·정책 enabled 실측 |
| Python | Mac 3.12.2 독립 `.venv`, VM 3.12.3, 시연 컨테이너 3.12.16 |
| 시연 이미지 | 이 워크트리 `demo/Dockerfile` → `hack-demo:tetragon-runtime`; Python base digest는 해당 Dockerfile 고정값 |
| 권한 | Tetragon만 `--pid=host --cgroupns=host --privileged`; BTF read-only mount |
| 관리 연결 | 컨테이너 내부 `unix:///var/run/tetragon/tetragon.sock`; TCP 관리 포트 미게시 |
| 보호 파일 | `hack-demo:/tmp/hack-demo/protected.txt`, 정확히 `demo-only`(개행 없음), mode `444` |
| probe | Python 실행파일을 `/usr/local/bin/hack-demo-probe`로 복사; 코드 read-only mount, UID 10001 |
| DB 볼륨 | 시연 전용 `hack-tetragon-board-data:/data`; 게시판 담당 볼륨과 분리 |

공식 [컨테이너 설치](https://tetragon.io/docs/installation/container/), [selector의 AND 조건·namespace·binary·Sigkill](https://tetragon.io/docs/concepts/tracing-policy/selectors/), **v1.8.0 고정** [관찰 예제](https://github.com/cilium/tetragon/blob/v1.8.0/examples/quickstart/file_monitoring.yaml)와 [대응 예제](https://github.com/cilium/tetragon/blob/v1.8.0/examples/quickstart/file_monitoring_enforce.yaml)를 확인했다. 예제의 `security_file_permission`, arg0=file, arg1=int/4를 좁은 시연에 사용했다. 커널 `/proc/kallsyms`에 훅이 존재하며 실제 정책 로드·이벤트·종료까지 확인했다. Override·LSM·mmap 등 다른 훅/대응은 미검증이다.

## 재현: Mac에서 준비

기존 실행 VM을 그대로 사용한다. VM 생성/삭제/중지, `dev/lima.yaml` 수정, Docker context 변경 명령은 실행하지 않는다. 아래는 저장소 루트 기준이다.

```sh
python3.12 -m venv tetragon/.venv
tetragon/.venv/bin/python -m pip install -r tetragon/requirements.lock
tetragon/.venv/bin/python -m pip check
limactl list
limactl shell 2026-hack-client uname -r
limactl shell 2026-hack-client test -r /sys/kernel/btf/vmlinux
docker --host "unix://$HOME/.lima/2026-hack-client/sock/docker.sock" build -t hack-demo:tetragon-runtime demo

# VM 홈을 조회하며 호스트 홈 mount는 사용하지 않는다.
TETRAGON_VM_HOME=$(limactl shell 2026-hack-client printenv HOME)
limactl shell 2026-hack-client mkdir -p "$TETRAGON_VM_HOME/2026-hack-runtime/tetragon/src"
limactl copy tetragon/runtime.py tetragon/probe.py tetragon/network_probe.py tetragon/sensor_status.py tetragon/requirements.lock "2026-hack-client:$TETRAGON_VM_HOME/2026-hack-runtime/tetragon/src/"
limactl copy -r tetragon/policies "2026-hack-client:$TETRAGON_VM_HOME/2026-hack-runtime/tetragon/src/"
limactl shell 2026-hack-client
```

이후 VM 셸 안에서 실행한다. VM에서도 담당 폴더 lock으로 독립 `.venv`를 준비한다.

```sh
cd ~/2026-hack-runtime/tetragon/src
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
.venv/bin/python -m pip check
# 초기 준비만. 이미 컨테이너가 있으면 덮어쓰지 않고 오류를 반환한다.
.venv/bin/python runtime.py prepare
.venv/bin/python runtime.py health
.venv/bin/python runtime.py start
.venv/bin/python runtime.py status
.venv/bin/python runtime.py probe
```

`prepare`는 보호 파일·read-only probe mount를 준비하고 health 준비를 기다린다. `start`도 정책 CLI 준비를 기다린다. **현재 검증 환경은 이미 준비되어 있으므로 `health`/`status`부터 확인**한다. 재준비가 필요하면 소유 label과 DB 보존 필요를 먼저 확인한다. 자동 삭제·초기화는 하지 않는다. Mac에서도 `curl --fail http://127.0.0.1:8081/health`를 확인했다.

## 적용·조회·해제·종료

### 게시판과 SaaS DB를 같은 VM에서 검증할 때

기본 export는 호스트 전체 프로세스 이벤트를 포함한다. SaaS PostgreSQL을 같은 VM에 두면 이벤트 저장용 DB 접속의 프로세스 종료가 다시 수집되어 수신량이 늘어나는 순환이 생길 수 있다. 이 로컬 통합 구성에서만 `TETRAGON_EXPORT_DEMO_ONLY=1 .venv/bin/python runtime.py start`로 **게시판 컨테이너 전용 export**를 선택한다. `hack-demo`의 실제 ID 앞 31자를 Tetragon v1.8.0의 `container_id` 정규식 allowlist로 전달하며, 게시판의 실행·종료·정책 이벤트만 JSONL에 기록한다. 원본의 필드나 시각은 바꾸지 않는다.

미설정 또는 `0`은 기존 전체 export이고, 다른 값은 오류다. 고객 서버 전체 관찰을 이 옵션으로 대체하면 안 된다. 컨테이너 이름 기반 정책이 아니므로 `hack-demo`를 재생성하면 ID도 바뀐다. `start`는 요청한 필터와 기존 컨테이너 옵션이 다르면 재생성을 안내하고 실패한다. 옵션 변경 시 소유 label 확인 → `runtime.py stop` → 중지된 `hack-tetragon`만 제거 → 동일 환경변수로 `start` → `observe`/`network` 재적용 순서로 진행한다. 게시판·DB 볼륨·이벤트 디렉터리는 삭제하지 않는다. 이후 재시작에도 같은 환경변수를 지정한다.

근거: [v1.8.0 Filter.container_id 정의](https://github.com/cilium/tetragon/blob/v1.8.0/api/v1/tetragon/events.proto), [JSON export filtering](https://tetragon.io/docs/concepts/events/#export-filtering). 이 필터는 JSON export 범위만 제한하며, gRPC 스트림이나 커널 정책 적용 범위를 바꾸지 않는다. 전송기의 파일 회전 시 종료·재시작 시 EOF부터 읽는 제한도 그대로다.

통합 실행에서 기본 전체 export는 PostgreSQL 프로세스 종료를 반복 수집했고 전송기는 2,818건 ACK 뒤 10MB 파일 회전으로 종료했다. 게시판 전용 옵션 적용 후 실제 file probe·성공/거부 network probe·health를 실행하자 SaaS에 실행 4건, 종료 4건, 파일 접근 2건, 네트워크 2건이 `live`로 저장됐다. 8초 뒤 재조회도 12건으로 유지되고 PostgreSQL 이벤트는 없었다. 두 네트워크 결과 모두 `outcome=unknown`, 센서 상태는 `SENSOR_STATUS_UNSUPPORTED`를 유지했다. 잘못된 옵션과 기존 설정 불일치는 종료 코드 1, 동일 옵션의 컨테이너 재시작과 정책 재적용은 성공했다. 이 확인은 공유 VM 통합 범위이며 장기 수집·회전 복구·무손실 전송 검증은 아니다.

VM의 위 `src` 폴더에서 실행한다.

```sh
.venv/bin/python runtime.py off
.venv/bin/python runtime.py probe
.venv/bin/python runtime.py observe
.venv/bin/python runtime.py status
.venv/bin/python runtime.py probe
.venv/bin/python runtime.py health

# observe 해제 후 enforce 적용
.venv/bin/python runtime.py enforce
.venv/bin/python runtime.py probe
# 바로 위는 시연 성공 시에도 종료 코드 137. 즉시 확인한다.
echo $?
.venv/bin/python runtime.py health

# 자기 정책 세 이름만 해제
.venv/bin/python runtime.py off
.venv/bin/python runtime.py status
.venv/bin/python runtime.py probe

# 선택: 자기 센서만 종료하고 재기동. demo/VM은 유지
.venv/bin/python runtime.py stop
.venv/bin/python runtime.py health
.venv/bin/python runtime.py start
.venv/bin/python runtime.py status
```

적용은 `runtime.py`로 통일한다. `docker exec hack-demo readlink /proc/self/ns/mnt`로 현재 namespace를 조회하며 호스트 namespace는 거부한다. 렌더링 파일은 VM `~/2026-hack-runtime/tetragon/policies/`에 있고 컨테이너 `/policies/`에 read-only mount한다. 내부에서 `tetra --server-address unix:///var/run/tetragon/tetragon.sock tracingpolicy add/list/delete`를 사용한다. YAML 템플릿을 직접 add하지 않는다.

파일 정책은 기존 파일 두 이름을 해제한 뒤 하나를 add하고 JSON 목록의 `TP_STATE_ENABLED`를 확인한다. 네트워크 정책은 자기 네트워크 이름만 교체한다. 실패 시 `status`와 진단 로그를 확인한다. 이전 정책으로 자동 롤백하지 않는다. 컨테이너 재생성/재시작 후에는 정책도 해제·재적용한다. namespace 번호는 재사용될 수 있어 오래된 렌더링 파일을 재사용하면 안 된다.

센서 재기동 후 빈 정책 목록을 확인했다. 정책 자동 복원은 설정하지 않았다. 컨테이너/볼륨 삭제가 필요하면 이 작업의 `io.2026-hack.owner=2026-hack-tetragon-runtime` label과 필요 데이터를 먼저 확인해 해당 자원만 처리한다. 공유 VM 중지나 전체 Docker/BPF 정리는 하지 않는다.

## JSONL과 진단 로그

- **실시간 원본:** VM `~/2026-hack-runtime/tetragon/events.jsonl`. 이번 절대 경로는 `/home/junje.guest/2026-hack-runtime/tetragon/events.jsonl`. 컨테이너 `/var/log/tetragon/events.jsonl`에 연결한다.
- mode `644`; 완결 줄의 JSON 객체 파싱을 확인했다. 기본 exec/exit와 정책 kprobe가 함께 들어 있다. 기본 exec 수집은 VM의 다른 프로세스도 포함하므로 전체 파일을 공유·커밋하지 않는다. 환경변수 수집은 켜지 않았다.
- **진단:** `docker logs hack-tetragon`. 별도 저장은 `docker logs hack-tetragon > ~/2026-hack-runtime/tetragon/diagnostics.log 2>&1`. events.jsonl에 append하지 않는다.
- 전송기 `TETRAGON_LOG_PATH`는 **VM에서 보이는** 위 절대 경로로 설정한다. Mac에 자동 공유되지 않는다. 전송기 실행·SaaS 도착은 미검증이다.
- 크기 회전은 Tetragon 기본값(10MB)이다. 전송기 계약상 회전 감지 시 종료하므로 장기 무손실 수집을 보장하지 않는다.

```sh
python3 - <<'PY'
import json
from pathlib import Path
p = Path.home() / '2026-hack-runtime/tetragon/events.jsonl'
with p.open() as source:
    count = 0
    for line in source:
        if not line.endswith('\n'):
            break  # 실행 중 미완결 마지막 줄은 다음 쓰기를 기다린다.
        assert isinstance(json.loads(line), dict)
        count += 1
print('complete_json_lines', count, 'mode', oct(p.stat().st_mode & 0o777))
PY
```

## 실측 결과

최초 4단계 비교는 [manual-results.json](evidence/manual-results.json), 해당 원본 12줄은 [demo-events.jsonl](evidence/demo-events.jsonl)이다. 실패·재생성·최종 재검증은 [lifecycle-results.json](evidence/lifecycle-results.json), 최종 원본 12줄은 [final-events.jsonl](evidence/final-events.jsonl)에 있다. 원본 줄은 값 변경 없이 해당 프로세스만 선택했다. 시각·ID·부모 프로세스 인자는 비밀정보 없는 격리 시연의 실측값이며 문서의 가상 예시가 아니다.

| 최초 비교 | VM UTC 시작 | VM PID / 컨테이너 PID | 실제 출력·결과 | 파일 정책 이벤트 | health |
|---|---|---|---|---|---|
| 정책 없음 | 18:26:12.506 | 5863 / 36 | `READ_OK bytes=9`, exit 0 | 없음 | 200/ok |
| observe | 18:26:13.920 | 6200 / 54 | `READ_OK bytes=9`, exit 0 | `hack-demo-observe`, `KPROBE_ACTION_POST` | 200/ok |
| enforce | 18:26:15.516 | 6575 / 72 | `PROBE_START`만 출력, exit 137 | `hack-demo-enforce`, `KPROBE_ACTION_SIGKILL`; 같은 exec_id의 exit `SIGKILL` | 200/ok |
| 해제 후 | 18:26:16.568 | 6848 / 96 | `READ_OK bytes=9`, exit 0 | 없음 | 200/ok |

최초 컨테이너는 `61e8e04ea0a9…`. 최종 컨테이너 `032eae43c78e…`에서도 observe VM PID 9341(18:28:52.252Z) → enforce PID 9720(18:28:53.913Z) → off PID 9934(18:28:54.727Z) → 센서 재기동 후 PID 10364(18:28:57.500Z)를 각각 정상/137/정상/정상으로 확인했다. mount namespace는 `4026532395`였고 재생성 시 같은 번호가 재사용됐다.

probe stdout PID는 컨테이너 PID, 원본 `process.pid`는 VM PID다. raw exec/kprobe/exit는 `exec_id`로 연결한다. 셸 결과와는 실행 순서·VM 출력 시각·binary·고정 인자를 함께 대조했다. 각 관찰/대응 실행에서 동일 파일 훅 이벤트가 2개씩 나왔다. 서로 다른 공격이나 읽기 성공 2건으로 세지 않는다.

추가 수동 확인:

- enforce 중 일반 `python -I -c "print(open('/tmp/hack-demo/protected.txt').read())"`는 `demo-only`, exit 0. 같은 probe 실행파일로 다른 파일 `/opt/hack-demo-probe/probe.py`를 읽으면 `NON_TARGET_READ_OK`, exit 0. 비대상 binary/파일은 종료되지 않았다.
- 보호 파일을 잠시 다른 이름으로 옮긴 후 probe는 `READ_ERROR errno=2`, exit 1. `finally`에서 복구하고 후속 대응·해제 후 읽기를 확인했다.
- 중복 `prepare`/`start`는 exit 1로 기존 컨테이너를 보존했다.
- 자기 컨테이너 재생성, 자기 SQLite 볼륨 재사용, 정책 재적용, 센서 stop/start 후 빈 정책 목록과 정상 복구를 확인했다. 최초 시연용 빈 DB 볼륨만 소유 label 적용 과정에서 재생성했다. 게시판 담당 데이터에는 접근하지 않았다.
- 초기 호스트 namespace 조회 권한 거부는 컨테이너 내부 readlink로 수정했다. Docker `no such volume` 대소문자 처리 오류와 기동 직후 health connection refused를 재현해 수정했다. 최종 코드의 health/정책 CLI 준비 대기도 재검증했다. 초기 실패를 lifecycle 결과에 남겼다.
- Mac/VM 독립 `.venv` 설치와 pip check, Python 구문 검사, `git diff --check`를 수행했다. 자동 테스트·CI는 추가하지 않았다.

## 전달 경계와 남은 확인

SaaS 팀은 [실측 필드 매핑](field-mapping.md)을 사용한다. 공통 계약 v1의 열린 rawEvent 구조로 전송할 수 있어 **공통 계약 변경은 필요하지 않다.** 두 정책명의 정규화/경고 등록은 SaaS 담당 구현·검증이 필요하다.

`Sigkill` 보고·137·실제 `SIGKILL` 종료를 확인했지만 커널 내부에서 읽기가 어느 범위까지 진행됐는지 측정하지 않았다. `READ_OK` 미출력은 바이트 접근 완전 차단 증거가 아니다. exact-path 정책은 hardlink·다른 namespace·다른 binary·mmap·이미 열린 FD 등의 모든 경로를 포괄하지 않는다. 이 우회/차단 효과는 미검증이다.

**최초 작업에서 미검증이었던 범위:** 게시판 CRUD/DB 기능 회귀, 다른 namespace의 동일 binary/파일 음성 대조, 대량·장기 수집/회전·유실, 전송기 live/follow, 실제 SaaS 수신/정규화·대시보드·AI 통합. 같은 대상 CRUD의 이번 후속 증거는 위 표에 별도로 연결했다. `outcome`은 자동으로 succeeded/blocked로 정규화하지 않는다. 저장한 시연 원본을 replay하면 봉투 `source=sample`이며 과거 실측을 현재 live로 전달하지 않는다.

최초 `5f7b473` 완료 당시에는 자기 정책 모두 해제, 컨테이너·실시간 JSONL 유지, health 정상이었으며 푸시/PR을 하지 않았다. **이번 요청은 feature branch push와 Draft PR을 승인했으며 master 머지는 승인하지 않았다.** 현재 상태는 위 후속 전달 사항을 따른다.
