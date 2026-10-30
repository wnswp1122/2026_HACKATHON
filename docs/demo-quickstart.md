# 기존 스크립트 간편 실행

준비된 Linux VM의 `runtime.py`를 Mac에서 바로 실행한다. Python 3와 Lima가 필요하며 서버·수집기·전송기는 먼저 준비돼 있어야 한다. 서버 설치·기동·데이터 초기화는 하지 않는다.

저장소 루트에서 실행한다. 현재 Mac 경로는 `/Users/junje/Projects/2026_hack`다.

```sh
./scripts/demo.py              # 기본: health + 정책 상태
./scripts/demo.py observe      # 파일·네트워크 관찰 정책 적용
./scripts/demo.py file         # 파일 읽기: READ_OK / 0
./scripts/demo.py network      # 연결 성공: CONNECT_OK / 0
./scripts/demo.py network-fail # 연결 실패: CONNECT_ERROR / 1을 기대 결과로 확인
./scripts/demo.py enforce      # 대응 probe → observe 복구 → 정상 읽기 재확인
./scripts/demo.py restore      # 파일 정책을 observe로 복구
```

`network-fail`의 내부 probe 종료 코드 1이 `CONNECT_ERROR`와 함께 확인되면 간편 실행기는 0으로 끝난다. 단순한 환경 오류의 종료 코드 1은 성공으로 취급하지 않는다. `enforce`는 기존 observe가 enabled이고 enforce가 없는 환경에서만 실행하며 probe137/READ_OK 없음과 복구 후 READ_OK/0을 확인한다. network 정책은 변경하지 않는다. 기존 enforce가 있으면 `status`로 확인하고 명시적으로 `restore`한다.

**완료 출력은 개별 probe의 기대 결과만 뜻한다.** 이벤트 전송·SaaS 저장·화면 표시·실제 SIGKILL 원본 대조를 자동 검증하지 않는다. 대시보드에서 source=`live`, 해당 instanceId(현재 환경은 `integration-live`), 최근 1시간으로 확인한다. 현재 프론트 주소는 `http://127.0.0.1:5173/overview`다.

## 실행 위치 변경

```sh
./scripts/demo.py file --vm 2026-hack-client
./scripts/demo.py status --runtime-dir /home/사용자/2026-hack-runtime/tetragon/src
./scripts/demo.py enforce --dry-run

# Linux에 저장소를 가지고 있다면 Lima 없이 실행
python3 scripts/demo.py status --local --runtime-dir /실제/경로/tetragon
```

Mac에서는 실행기 코드만 표준 입력으로 VM에 전달한다. VM의 소스·환경변수·DB를 덮어쓰지 않으며, VM에 준비된 runtime.py와 정책 파일을 사용한다. 기존 runtime.py의 컨테이너 소유권·대상 namespace 제한을 재사용한다. 해당 파일이 없거나 VM/컨테이너가 중지돼 있으면 오류로 종료한다. 환경 준비는 [Tetragon 안내](../tetragon/README.md)를 따른다.

## 중단과 복구

`enforce`는 정상·예외·Ctrl+C/SIGTERM에서 observe 복구를 시도한다. 단, 프로세스 강제 종료·VM 단절·Docker 장애에서는 복구를 보장할 수 없다. 재접속 후 다음을 실행한다.

```sh
./scripts/demo.py status
./scripts/demo.py restore
./scripts/demo.py file
```

같은 실행기끼리는 파일 잠금으로 정책 변경을 직렬화한다. 다른 터미널에서 runtime.py를 직접 실행하는 작업까지 잠그지는 않는다. 시연 중 다른 도구로 정책을 바꾸지 않는다. 임의로 `off`하면 network까지 해제된다.

## 별도 수집·전송 스크립트

이 실행기는 새 이벤트를 만드는 조작만 쉽게 한다. 현재 켜져 있는 이벤트/상태 전송기를 중복 기동하지 않는다. 수집기·전송기의 독립 실행이나 sample 재생은 설정과 비밀 토큰이 필요하므로 [전송기 안내](../event-forwarder/README.md), [상태 수집 안내](../tetragon/status.md)를 따른다. 전송기는 파일 회전 시 종료하며 영속 큐가 없다.

전체 경계를 판정하는 도구는 [통합 시나리오 실행기 계획](scenario-verification-plan.md)에 정의돼 있으며 아직 미구현이다.

## 이번 구현에서 확인한 범위

현재 `2026-hack-client`에서 status, file, network, network-fail, enforce를 직접 실행했다. READ_OK/0, CONNECT_OK/0, CONNECT_ERROR/1, 대응 probe137과 observe 복구 후 READ_OK/0을 확인했다. 최종 observe/network는 enabled, enforce는 제거됐으며 게시판 health는 정상이다. 없는 runtime 경로는 비영 종료로 실패했다. 별도의 모의 호출로 정책 적용 오류·KeyboardInterrupt에서도 observe 복구를 시도하는 것을 확인했다. 실제 SSH 단절·강제 종료·Docker 장애에서의 복구와 이 실행기의 SaaS/화면 자동 검증은 확인한 범위가 아니다.
