# Tetragon 설치·관찰·대응 담당

## 목표

로컬 Linux에서 [게시판 환경](../demo/README.md)의 시연 파일 읽기를 관찰하고, 정책에 맞는 probe 프로세스의 종료를 재현한다. **공통 환경 준비에서 Tetragon v1.8.0의 기본 exec 이벤트와 JSONL 생성을 확인했다. 사용자 정의 정책·파일 관찰·대응은 아직 미구현이다.** [환경 검증 기록](../docs/local-development.md)을 재사용한다.

## 준비 순서

1. 별도 로컬 Linux VM의 Docker와 Linux 커널/아키텍처를 확인한다. macOS 자체 커널에 설치하지 않는다.
2. [공식 컨테이너 설치](https://tetragon.io/docs/installation/container/)를 읽고 BTF·권한·마운트 요구를 확인한다. 선택한 안정 이미지 버전과 실제 커널 버전을 README에 기록한다.
3. 정책 없이 프로세스 실행 이벤트가 나오는지 확인한다.
4. JSON export 파일을 Linux VM의 `~/2026-hack-runtime/tetragon/events.jsonl`에서 읽을 수 있게 연결한다. 파일 생성/권한/각 줄 JSON 여부를 확인한다. Tetragon 진단 로그를 이벤트 파일로 혼합하지 않는다.
5. 이벤트가 준비되면 전송 담당자에게 호스트 경로를 전달한다. 전송기를 시작한 뒤 새 시연 활동을 발생시킨다.

Docker Desktop의 지원을 가정하지 않는다. BTF나 훅이 지원되지 않으면 오류와 환경을 기록하고 로컬 Linux VM 대안을 검토한다. sample 파일 재생은 앱 개발에만 사용하며 실제 eBPF 관찰을 대신하지 않는다.

## 정책 구현

- 관찰 정책명 제안: `hack-demo-observe`. 대응 정책명 제안: `hack-demo-enforce`.
- 대상: 시연 컨테이너의 probe가 `/tmp/hack-demo/protected.txt`에 접근하는 경우.
- 실제로 지원되는 파일 접근 훅과 인자 타입을 공식 문서·설치 버전·실측 이벤트에서 확인한다. 임의의 함수 이름이나 인자 번호로 YAML을 확정하지 않는다.
- 보호 파일 경로 조건을 필수로 두고, 가능한 경우 시연 프로세스/컨테이너로 범위를 좁힌다. 실행 환경이 Kubernetes가 아닌데 Pod selector가 동작한다고 가정하지 않는다.
- 관찰 정책에서는 이벤트만 생성. 대응 정책은 지원되는 조건에서 Sigkill 등으로 probe 프로세스를 종료하고 이벤트를 내보내도록 준비한다.
- 두 정책을 동시에 중복 로드하지 않는다. 적용 방법을 하나로 통일하고 이전 정책을 해제한 뒤 다음 정책을 적용한다. 성공·실패를 실제 목록과 이벤트로 확인한다.
- exact-path 예제의 우회 가능성이 있으므로 일반적인 파일 보호나 운영 보안 보장을 주장하지 않는다.

Tetragon의 지원 대응에는 반환값 변경과 신호 전달이 있다. Sigkill은 작업 거부와 같지 않다. 이번 기본 완료 목표는 **프로세스 종료의 재현**이며, 작업 자체를 거부하도록 확장하려면 반환값 변경이 지원되는 지점과 독립적인 작업 결과를 추가 검증한다. [대응 의미](https://tetragon.io/docs/concepts/enforcement/), [정책 대응 예제](https://tetragon.io/docs/getting-started/enforcement/)

## 다른 담당자에게 전달할 것

| 항목 | 기록 내용 |
|---|---|
| 실행 환경 | Linux 커널, CPU 아키텍처, Docker 환경, Tetragon 버전 |
| 재현 | 컨테이너 준비·정책 적용/조회/해제·probe 실행 명령 |
| 이벤트 | exec, 관심 파일 이벤트, 대응 이벤트와 가능하면 종료 이벤트 원본 |
| 매핑 | 정책명·action·프로세스·대상 파일이 원본 어디에 있는지 |
| 결과 | 정책 전후 종료 상태와 출력, 서버 health, 해제 후 정상 복구 |

event.action과 실제 대응 결과는 별도 정보다. 프로세스 종료나 비정상 exit만으로 정책이 원인이라고 단정하지 말고 정책 전후 비교·대상 일치·시각/프로세스 식별 정보를 함께 확인한다. 일반 호스트 PID나 무관한 프로세스를 종료하는 정책은 적용하지 않는다.

## 완료 조건

관찰 전후·대응 적용·해제의 반복이 가능하고, 원본 이벤트와 실제 프로세스 종료 증거가 있다. 정책 검증을 완료하면 README에 사용한 정확한 명령을 추가한다. 기본 센서의 환경 검증과 별도로 이 정책 완료 조건을 확인해야 한다.

## 이번 담당 경계

사용자는 Tetragon·게시판·전송기를 서로 다른 Orca 워크트리로 개발한다. 이 작업은 tetragon/만 수정하며 probe.py와 보호 파일 준비도 소유한다. 게시판 컨테이너 hack-demo에 read-only mount 또는 docker exec로 probe를 실행하고 demo/는 수정하지 않는다. 보호 파일은 /tmp/hack-demo/protected.txt, 내용 demo-only다. 게시판 HTTP/DB 프로세스는 대응 대상이 아니다.

전송 규격은 [데이터 계약](../docs/api-contract.md), 작업 범위는 [클라이언트 지침](../docs/client-development.md)을 따른다. SaaS·프론트는 다른 팀원 담당이다. VM 설정은 공통 개발환경을 재사용하고 전역 Docker context를 변경하지 않는다.
