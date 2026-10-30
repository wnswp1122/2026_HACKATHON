# 실제 서버 이벤트로 사용하기

준비된 Linux의 Tetragon JSONL과 주기적 상태 보고를 SaaS로 보낸다. `scripts/live.py`는 이벤트·상태 전송기를 함께 실행하고, 한쪽이 종료되면 함께 종료해 실패를 알린다. SaaS·Tetragon·정책·상태 생산자를 자동 설치하거나 재시작하지 않는다.

## 준비

1. [Tetragon](../tetragon/README.md)과 [상태 생산자](../tetragon/status.md)를 실행한다. 실제 관찰할 프로세스가 정책 대상인지 확인한다. 전용 probe용 `observe`/`network`만으로는 일반 게시판 CRUD를 관찰하지 않는다. 준비된 `hack-demo` 게시판에는 [서비스 관찰 정책](../tetragon/README.md#실제-게시판-서비스-관찰)을 별도로 적용한다. 임의 애플리케이션을 자동으로 관찰하는 설정은 아니다.
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

## 실제 게시판으로 확인한 범위

기존 Lima VM의 Tetragon 1.8.0과 실행 중인 `hack-demo` FastAPI 게시판을 사용했다. 전용 probe 대신 일반 `/usr/local/bin/python3.12 -m uvicorn` 서버에 HTTP 요청을 보내고, 별도 PostgreSQL schema·API·영속 전송기를 통해 실제 생성된 원본을 `source=live`로 저장했다. 아래 세 회차 모두 생성 201 → 조회 200 → 수정 200 → 삭제 204 → 삭제 후 조회 404를 확인했으며, 검증에서 만든 글만 삭제했다.

| 조건 | 확인한 결과 |
|---|---|
| 정상 수집 | 게시판 CRUD에서 생성된 파일 관찰 원본 92건(읽기 29·쓰기 63)을 수신 |
| 전송기 중단 | 전송기를 완전히 종료한 동안 CRUD를 실행하고 같은 `SPOOL_DIR`로 재시작. 해당 원본 92건 복구 |
| 수신 API 중단 | 검증 API를 종료한 동안 CRUD 실행. 이벤트 전송기의 4회 재시도 소진과 동반 종료를 확인한 뒤, 같은 DB schema의 API와 같은 spool을 재시작해 해당 원본 92건 복구 |
| 원본·DB 대조 | 세 회차 파일 관찰 원본 총 276건을 JSON 전체 값으로 비교해 각각 DB에 정확히 1건 존재함을 확인. 이 검증 구간에서 누락·중복 없음 |
| 일반 TCP 연결 | 게시판 컨테이너에서 일반 Python의 HTTP 요청으로 `/health` 200 확인. `service-network` IPv4 TCP 연결 시도 1건 수신. 게시판 API 자체의 외부 서비스 연동 기능을 검증한 것은 아님 |
| API·화면 | 최종 live 280건: 파일 277건(읽기 88·쓰기 189), 실행·네트워크·종료 각 1건. 추가 파일 1건은 `/health` 조회에서 발생. sample은 0건이며 replay 생성 후 같은 ID 조회 결과 일치. 브라우저의 live 280건과 원본 상세 정책·DB 경로 확인. API 중단 시 HTTP 502·이전 데이터 경고, 복구 후 정상 조회 확인 |

별도 임시 컨테이너에서 같은 DB 경로에 읽기·쓰기를 실행했을 때 서비스 관찰 이벤트는 0건이었고, 정책 Post 카운터도 파일 277·네트워크 1로 유지됐다. `service-off` 후에는 원래의 probe 두 정책만 남았으며 기존 게시판·상태 수집기는 유지했다.

읽기·쓰기는 `security_file_permission`의 권한 검사 관찰이며 DB 작업 성공 횟수나 바이트 수가 아니다. CRUD 성공은 HTTP 응답으로 별도 확인했다. TCP 관찰도 연결 성공을 뜻하지 않아 `outcome=unknown`을 유지한다. 센서 목록은 실제 미지원 상태인 `SENSOR_STATUS_UNSUPPORTED`/`unknown`으로 남는다.

이는 지정 게시판의 DB 파일과 IPv4 TCP를 대상으로 한 로컬 실행·장애 복구 검증이다. 임의 애플리케이션, IPv6 정규화(현재 OTHER), 장기 수집·파일 회전·강제 종료/VM 단절의 무손실 복구는 검증하지 않았다. 실제 AI 제공자 설정이 없어 AI 분석 성공도 확인하지 않았다. live 이벤트 분석 요청은 `503 AI_NOT_CONFIGURED`를 반환했고 sample 분석으로 대체하지 않았다.

## 이전 전용 probe 검증

다음 기록은 전용 probe의 수신·복구 검증이며, 위의 일반 게시판 CRUD 검증과 구분한다.

전용 PostgreSQL schema와 API, 기존 Linux VM의 새 파일·네트워크 probe로 live 11건(FILE_ACCESS/NETWORK/PROCESS_EXEC/PROCESS_EXIT)을 수신했다. 별도 센서 보고와 dashboard 집계, replay 생성·동일 ID 복원을 확인했다. 같은 입력 중복 실행은 실패했고, 수정 후 원격 Ctrl+C 종료에서 두 전송기가 남지 않는 것을 확인했다. 실제 제공자 AI 성공·장기 운영·강제 종료/VM 단절 시 복구는 이번 검증 범위가 아니다.

영속 전송 모드를 연결한 추가 검증에서 file probe를 수신한 뒤 전송기를 종료하고 network probe를 발생시켰다. 같은 저장 디렉터리로 재시작한 후 해당 발생 시각과 호스트 프로세스 식별자의 NETWORK 이벤트가 한 건 저장됐음을 확인했다. 최종 live 22건(파일4·네트워크2·실행8·종료8)이며 sample 가중치는 사용하지 않았다. SIGHUP 종료에서도 자식 전송기 잔존이 없었다. 이는 통신 성공·공격 차단·장기 무손실 보장과 별개의 수신/복구 검증이다.
