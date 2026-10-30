# v1.8.0 실측 원본 필드 매핑

[원본](evidence/final-events.jsonl)의 필드/값을 확인한 매핑이다. SaaS 코드는 수정하지 않았다. 아래 `TYPE`은 실제 존재하는 `process_exec`, `process_exit`, `process_kprobe` 중 하나다. 위치가 없으면 null로 남기고 알려지지 않은 이벤트는 OTHER로 보존한다.

| 계약 의미 | 실제 원본 위치·판정 |
|---|---|
| occurredAt | 최상위 `time` (UTC RFC3339, 나노초 정밀도) |
| nodeName | `node_name`; 이번 `7e883e18785c`는 Tetragon 컨테이너 hostname이며 VM 이름으로 바꾸지 않음 |
| execId / pid / uid / binary | `TYPE.process.exec_id` / `.pid` / `.uid` / `.binary` |
| parentBinary | `TYPE.parent.binary`; Docker exec 부모는 runc 또는 containerd-shim으로 실측, HTTP 서버 자식으로 가정하지 않음 |
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
