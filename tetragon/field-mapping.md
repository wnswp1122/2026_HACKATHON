# v1.8.0 실측 원본 필드 매핑

기준 계약: `d960d3f` [5개 화면 계획](https://github.com/wnswp1122/2026_HACKATHON/blob/d960d3feeed6b1693be47e1a1e7cd48c0b911dac/docs/tetragon-screen-plan.md). 기존 v1 rawEvent 봉투는 바꾸지 않는다. 이번 실제 원본은 [screen-plan/events.jsonl](evidence/screen-plan/events.jsonl), 실행 결과는 [runtime-results.json](evidence/screen-plan/runtime-results.json)에 있다. core 담당에게 아래 mapping을 전달했다.

[원본](evidence/final-events.jsonl)의 필드/값을 확인한 매핑이다. SaaS 코드는 수정하지 않았다. 아래 `TYPE`은 실제 존재하는 `process_exec`, `process_exit`, `process_kprobe` 중 하나다. 위치가 없으면 null로 남기고 알려지지 않은 이벤트는 OTHER로 보존한다.

| 계약 의미 | 실제 원본 위치·판정 |
|---|---|
| occurredAt | 최상위 `time` (UTC RFC3339, 나노초 정밀도) |
| nodeName | `node_name`; 이번 `7e883e18785c`는 Tetragon 컨테이너 hostname이며 VM 이름으로 바꾸지 않음 |
| execId / pid / uid / binary | `TYPE.process.exec_id` / `.pid` / `.uid` / `.binary` |
| parentBinary | `TYPE.parent.binary`; Docker exec 부모는 runc 또는 containerd-shim으로 실측, HTTP 서버 자식으로 가정하지 않음 |
| parentExecId | `TYPE.parent.exec_id` 문자열 또는 null. 트리 키는 instanceId+execId이며 PID/binary로 합치지 않음 |
| PROCESS_EXEC | `process_exec` 존재 |
| PROCESS_EXIT | `process_exit` 존재; 연결은 `process_exit.process.exec_id` |
| 종료 신호(원본 조사) | `process_exit.signal = "SIGKILL"`; 정상 종료 원본에는 signal과 status가 없었음. 앱의 exit 0은 별도 셸 결과에서 확인 |
| FILE_ACCESS | `process_kprobe.policy_name`이 `hack-demo-observe` 또는 `hack-demo-enforce`이고 `function_name=security_file_permission`, `args[0].file_arg.path`, `args[1].int_arg=4`를 확인한 경우. 모든 kprobe를 파일로 분류하지 않음 |
| target | 위 알려진 정책의 `process_kprobe.args[0].file_arg.path`, 이번 `/tmp/hack-demo/protected.txt` |
| policyName | `process_kprobe.policy_name` |
| reportedAction | `process_kprobe.action`: `KPROBE_ACTION_POST` 또는 `KPROBE_ACTION_SIGKILL` 문자열 그대로 |
| outcome | 계약대로 `unknown`; raw action 또는 exit만으로 succeeded/blocked를 채우지 않음 |
| status / reason | SaaS의 등록된 경고 정책명과 정확히 비교. 경고 등록 구현 미검증이며 모든 kprobe에 attention을 붙이지 않음 |
| instanceId / source / receivedAt | 원본에서 만들지 않음. 봉투와 SaaS 수신 시각을 사용 |

`process_kprobe.return_action=KPROBE_ACTION_POST`도 나왔지만 정책은 return probe를 사용하지 않는다. 이것을 파일 읽기 반환값·성공·차단 결과로 해석하지 않는다. `file_arg.permission="-r--r--r--"`는 파일 mode 표현이며 읽기 성공 증거가 아니다.

`TYPE.process.docker`는 Docker ID 접두어로 관찰됐고 Kubernetes pod 메타데이터는 없다. `TYPE.process.ns.mnt.inum=4026532395`는 시연 컨테이너 namespace와 대조했다. `process.pid`/`tid`는 VM PID이며 probe stdout PID와 직접 같다고 비교하지 않는다. namespace 번호·PID·exec_id·node_name을 고정 설정으로 복사하지 않는다.

관찰 PID 9341의 exec→파일 이벤트→정상 exit, 대응 PID 9720의 exec→`SIGKILL` action→실제 `SIGKILL` exit는 각기 같은 `exec_id`로 연결된다. 정책 해제 후 PID 9934, 센서 재시작 후 PID 10364에는 exec/exit만 있다. 별도 셸 출력/137/정상 복구는 [README](README.md)와 [실행 기록](evidence/lifecycle-results.json)을 함께 본다. 동일 실행에서 같은 파일 이벤트가 두 번 나왔으므로 이벤트 건수를 공격 횟수로 제시하지 않는다.

JSONL은 rawEvent 그 자체이며 HTTP 봉투가 아니다. 원본 예시 파일을 재생할 때는 `source=sample`, 실시간 파일의 새 줄을 follow할 때만 `source=live`다. 이 매핑은 공통 계약을 바꾸지 않으며 SaaS 정규화·경고 등록·실제 전달 검증은 다음 통합 작업이다.

## 새 공개 file 객체

FILE_ACCESS의 기존 allowlist(정확한 두 파일 정책명 + `security_file_permission` + arg0 file 객체 + arg1 int=4)에서만 `{path: args[0].file_arg.path, operation: "read"}`를 만든다. path는 문자열임을 확인한다. 미지의 정책/훅/인자 구조면 OTHER이며 file=null이다. target은 이 확인된 file의 표시용 요약이고 역파싱 원천이 아니다.

## 실제 네트워크 매핑

공식 [v1.8.0 network 예제](https://github.com/cilium/tetragon/blob/v1.8.0/examples/quickstart/network_egress_cluster.yaml)의 `tcp_connect` arg0=`sock`를 사용하고, 조건을 별도 net-probe·hack-demo Mnt·loopback 목적지/두 포트로 좁혔다. `network.yaml`은 `Post`만 사용한다.

NETWORK 판정은 다음을 모두 확인한 경우에만 한다.

- `process_kprobe.policy_name == "hack-demo-network"`.
- `process_kprobe.function_name == "tcp_connect"`.
- `process_kprobe.args` 배열의 첫 항목에 `sock_arg` 객체가 있음.
- `sock_arg.family == "AF_INET"`, `type == "SOCK_STREAM"`, `protocol == "IPPROTO_TCP"`가 문자열로 정확히 일치함.

| 새 공개 network 필드 | 실제 원본 위치 / 변환 |
|---|---|
| sourceIp | `process_kprobe.args[0].sock_arg.saddr`: 유효 IP 문자열, 이번 `127.0.0.1`; 없거나 유효하지 않으면 null |
| sourcePort | `.sock_arg.sport`: bool이 아닌 0~65535 정수. 이번 성공 53834/거부 50106; 매 실행 바뀜. 미확인 null |
| destinationIp | `.sock_arg.daddr`: 유효 IP 문자열, 이번 `127.0.0.1`; 미확인 null |
| destinationPort | `.sock_arg.dport`: bool이 아닌 0~65535 정수, 이번 `8080` 또는 `18080`; 미확인 null |
| protocol | 정확히 확인한 `IPPROTO_TCP` → 공개 문자열 `TCP`; 미지의 enum/숫자를 추측하지 않음 |
| operation | 이 알려진 훅은 `connect`. accept/HTTP/송수신 바이트로 바꾸지 않음 |
| reportedAction | `process_kprobe.action == "KPROBE_ACTION_POST"`; 파일 정책의 Sigkill과 분리 |
| outcome | `unknown` 유지 |

성공 시도: UTC `19:39:45.458511165Z`, VM PID 16819, sport 53834 → dport8080, 별도 셸 `CONNECT_OK`/0. 거부 시도: `19:39:45.706371881Z`, PID16860, sport50106 → dport18080, 셸 `CONNECT_ERROR errno=111`/1. **둘 다** 같은 `tcp_connect`/`KPROBE_ACTION_POST`/`TCP_SYN_SENT`가 나왔으므로 raw 이벤트만으로 연결 성공을 구별할 수 없다. SaaS outcome을 셸 검증 결과로 채우는 기능은 구현하지 않았다.

원본 `sock_arg.cookie`(큰 정수의 문자열 표현), `state=TCP_SYN_SENT`는 보존하되 연결/사용자 식별자나 성공 상태로 정규화하지 않는다. source/destination은 관찰한 소켓 끝점이며 공격자/피해자 역할이 아니다. loopback에는 위치를 부여하지 않는다.

일반 Python의 같은 포트 연결, net-probe의 다른 포트18181, 정책 disabled/해제 중 net-probe에는 exec/exit만 있고 네트워크 kprobe가 없음을 원본에서 대조했다. 기존 파일 enforce 중에는 원래 파일 probe만 SIGKILL, 다른 net-probe는 정상이며 네트워크 Post를 유지했다.

미관찰/미지원: AF_INET6·UDP·accept·DNS·원래 사용자 IP·NAT 이전 주소·HTTP 성공·전송량·공격/유출 판정. 이 구조를 임의로 추정해 매핑하지 않는다. 다른 namespace 동일 binary의 음성 대조, 외부 목적지·성능·유실·중복 특성은 검증하지 않았다. 실제 파일/네트워크/부모 매핑은 공개 Event의 nullable 확장에만 적용하며 Snapshot/AI allowlist를 늘리지 않는다.
