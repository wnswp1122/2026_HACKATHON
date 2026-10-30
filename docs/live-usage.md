# 실제 서버 이벤트로 사용하기

준비된 Linux의 Tetragon JSONL과 주기적 상태 보고를 SaaS로 보낸다. `scripts/live.py`는 이벤트·상태 전송기를 함께 실행하고, 한쪽이 종료되면 함께 종료해 실패를 알린다. SaaS·Tetragon·정책·상태 생산자를 자동 설치하거나 재시작하지 않는다.

## 준비

1. [Tetragon](../tetragon/README.md)과 [상태 생산자](../tetragon/status.md)를 실행한다. 실제 관찰할 프로세스가 정책 대상인지 확인한다. 현재 예제 정책은 지정한 게시판 시연 대상에 한정된다.
2. [백엔드](../backend/README.md)에 DB 스키마·`INSTANCE_IDS`·수신 토큰을 설정하고 실행한다. Linux 전송기 위치에서 접근 가능한 수신 URL을 사용한다. Mac의 localhost와 VM의 localhost는 다르다.
3. Linux에 저장소의 `event-forwarder/`를 준비하고 README의 가상환경·lock 의존성을 설치한다.
4. [live.env.example](../scripts/live.env.example)을 Linux의 개인 설정 파일로 복사해 실제 경로·URL·토큰을 입력하고 `chmod 600`을 적용한다. 이 파일은 단순 `KEY=VALUE`이며 따옴표·셸 명령·변수 확장을 해석하지 않는다. Git에 넣지 않는다.

## 실행

Mac에서 준비된 Lima VM에 연결한다. 설정 경로는 **VM 안의 경로**다.

```sh
python3 scripts/live.py check --config /home/user/live.env
python3 scripts/live.py run --config /home/user/live.env
# 다른 VM이면 --vm 이름을 추가한다.
```

Linux에 저장소가 있으면 직접 실행한다.

```sh
python3 scripts/live.py check --local --config /home/user/live.env
python3 scripts/live.py run --local --config /home/user/live.env
```

`check`는 설정·전송기 의존성·파일 읽기·최근 90초 이내 상태 보고와 Tetragon 도달 여부를 확인한다. HTTP 인증·허용 서버·이벤트 수신 성공까지 확인하는 명령은 아니다. 센서 목록 미지원 `unknown`도 Tetragon 도달이 확인되면 그대로 보낸다.

`run`은 foreground로 유지한다. Ctrl+C는 이번 실행의 두 전송기만 종료한다. 실행기 하나가 같은 입력 파일을 중복 사용하면 거부한다. 기존에 직접 실행한 `main.py --follow`는 이 실행기 잠금에 참여하지 않으므로 중복 실행하지 않는다. VM 연결이 끊기거나 강제 종료되면 원격 정리가 보장되지 않으며 Linux에서 실행 상태를 확인해야 한다. 기존 Tetragon·상태 생산자·게시판·DB·정책은 그대로 둔다.

## 재시작과 파일 회전

`SPOOL_DIR`를 비어 있지 않은 절대 경로로 설정하면 전송기의 `--follow --spool-dir`를 사용한다. 이 옵션을 지원하는 전송기 버전이 필요하다. 기존 영속 디렉터리는 같은 Linux 사용자 전용이며 권한은 700이어야 한다. 최초 시작은 파일 끝부터, 같은 영속 디렉터리로 재시작하면 저장한 메시지와 위치부터 이어간다. 상태 전송기는 새 관측 보고를 전송하며 별도 영속 큐를 사용하지 않는다.

네트워크 재시도 소진·인증 실패 등으로 전송기가 종료하면 원인을 복구한 뒤 같은 설정으로 다시 실행한다. 회전·축소 등 입력 불일치 오류는 자동으로 무시하지 않는다. 남은 메시지와 원본 파일을 확인한 뒤 전송기 README의 복구 절차를 따른다. 디스크 장애나 읽기 전 삭제된 로그를 포함하는 무손실 전달은 보장하지 않는다.

## 화면과 확인

일반 프론트에서 실제 수집(live)과 해당 서버를 선택한다. 준비 점검에서 보고 시각·정책 상태를 확인하고, 새 실제 활동 후 이벤트 수신 시각·프로세스·유형을 대조한다. 이벤트 없음과 상태 미보고는 서로 다른 상태다. sample 가중 집계는 live에 적용되지 않는다. 실제 IP 위치를 표시하려면 명시적 위치 설정이 필요하며 위치 없는 IP를 가상 좌표로 채우지 않는다.

위험 전후 조사는 선택 기간의 기록을 고정한다. AI는 기존 안전 입력과 Gemini 설정을 사용한다. API/화면 연결 확인은 실제 AI 분석 성공을 뜻하지 않는다.

## 이번 확인

전용 PostgreSQL schema와 API, 기존 Linux VM의 새 파일·네트워크 probe로 live 11건(FILE_ACCESS/NETWORK/PROCESS_EXEC/PROCESS_EXIT)을 수신했다. 별도 센서 보고와 dashboard 집계, replay 생성·동일 ID 복원을 확인했다. 같은 입력 중복 실행은 실패했고, 수정 후 원격 Ctrl+C 종료에서 두 전송기가 남지 않는 것을 확인했다. 실제 제공자 AI 성공·장기 운영·강제 종료/VM 단절 시 복구는 이번 검증 범위가 아니다.
