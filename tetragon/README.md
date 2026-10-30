# Tetragon 시연 런타임

**전용 Lima VM에서 기본 exec/exit, 고정 파일 읽기 관찰, 별도 probe의 SIGKILL 종료와 정책 해제 후 복구를 실측했다.** 게시판은 이 워크트리의 health/SQLite 프레임워크 이미지이며 CRUD·전송기·SaaS·프론트 통합은 미검증이다. 파일 읽기 완전 차단이나 운영 보안을 보장하지 않는다.

기준 커밋은 `1e94262`. `tetragon/`만 수정했다. `demo/`는 읽어서 빌드했고 수정하지 않았다. `hack-board-dev`, 공유 VM 생명주기와 기본 Docker context는 변경하지 않았다.

## 구성과 범위

- `probe.py`: `/tmp/hack-demo/protected.txt`만 읽고 정확히 `demo-only` 9바이트인지 확인한다. 정상 `READ_OK`/0, 읽기 오류 `READ_ERROR`/1, 내용 불일치 /2. HTTP 요청으로 실행하지 않는다.
- `runtime.py`: **Linux VM 내부**에서 준비·기동·정책 교체·조회·해제·probe·health·센서 종료를 수행한다. 컨테이너와 DB 볼륨의 소유 label을 확인하며 기존 컨테이너를 자동 삭제하지 않는다.
- `policies/observe.yaml`, `enforce.yaml`: 현재 `hack-demo`의 mount namespace를 치환해서 적용하는 템플릿. 두 정책은 교체 적용한다.
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
limactl copy tetragon/runtime.py tetragon/probe.py tetragon/requirements.lock "2026-hack-client:$TETRAGON_VM_HOME/2026-hack-runtime/tetragon/src/"
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

# 자기 정책 두 이름만 해제
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

기존 자기 정책을 해제한 뒤 하나를 add하고 JSON 목록의 `TP_STATE_ENABLED`를 확인한다. 실패 시 `status`와 진단 로그를 확인한다. 이전 정책으로 자동 롤백하지 않는다. 컨테이너 재생성/재시작 후에는 정책도 해제·재적용한다. namespace 번호는 재사용될 수 있어 오래된 렌더링 파일을 재사용하면 안 된다.

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

**별도 미검증:** 게시판 CRUD/DB 기능 회귀, 다른 namespace의 동일 binary/파일 음성 대조, 대량·장기 수집/회전·유실, 전송기 live/follow, 실제 SaaS 수신/정규화·대시보드·AI 통합. `outcome`은 자동으로 succeeded/blocked로 정규화하지 않는다. 저장한 시연 원본을 replay하면 봉투 `source=sample`이며 과거 실측을 현재 live로 전달하지 않는다.

완료 시점: `hack-demo`/`hack-tetragon` 실행 중, 자기 정책 모두 해제, 보호파일/probe·실시간 JSONL 유지, health 정상. VM과 `hack-board-dev`는 유지했다. 푸시·PR·머지는 수행하지 않았다.
