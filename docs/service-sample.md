# 게시판 운영 sample

```sh
./scripts/presentation.py --scenario service --cycles 200 --interval 0.02
```

발표 전용 대시보드를 열고 실제 SaaS 수신 API와 PostgreSQL에 sample 1,434건을 저장한다. 각 실행은 새 서버 ID와 위치 설정을 사용한다. 기존 데이터는 삭제하지 않는다. 기존 8건 시연은 옵션 없이 그대로 실행한다.

## 시나리오

- 게시판 API와 비동기 작업 워커를 실행한다.
- 200회 운영 주기에서 SQLite 파일 읽기, 검색 색인·작업 큐 연결, 첨부파일 읽기·저장소 연결, 알림 제공자 연결을 관찰한다고 가정한다.
- 5회마다 백업 프로세스의 실행·원본 읽기·종료와 워커의 백업 저장소 연결을 추가한다.
- 20회마다 API 하위 셸 실행 → 환경 파일 접근 → curl 실행·예상 밖 목적지 연결·종료 → 보호 파일 정책 일치·SIGKILL 보고 → 셸 종료를 추가한다.
- 마지막에 워커와 API를 종료한다. 프로세스별 execId와 parentExecId를 유지한다.

200회 기준 이벤트 1,434건, NETWORK 850건, FILE_ACCESS 460건, PROCESS_EXEC 62건, PROCESS_EXIT 62건, 정책 일치 10건이다. 네트워크 건수와 지도에 표시하는 집계 연결 수는 다르다. 목적지는 검색·큐(서울), 첨부 저장소(도쿄), 알림(프랑크푸르트), 백업(샌프란시스코), 예상 밖 목적지(싱가포르)로 구분한다.

이는 해당 기능을 가진 게시판 서비스를 가정한 합성 커널 이벤트다. 실제 게시판 API에 요청하거나 파일·셸·외부 통신·공격을 실행하지 않는다. 파일 관찰 범위를 확대한 센서를 가정하며 실제 설치된 정책의 관찰 범위를 검증한 것이 아니다. 문서용 IP와 수동 도시 좌표를 사용한다. 실제 수신 시각으로 저장하며 기본 간격은 빠른 확인을 위한 압축된 시간이다. 긴 운영 시간의 트래픽 측정 자료가 아니다.

각 이벤트는 파일 읽기·TCP 연결의 관찰을 나타낸다. 게시글 작성 성공, 알림 발송 성공, TLS 협상 성공, 데이터 유출·공격 성공·차단 성공은 입증하지 않는다. SIGKILL과 종료의 연결도 시나리오에서 정한 가정이다. source=sample과 outcome=unknown을 유지한다.

주입 후 집계와 좌표 누락 여부를 검사하고 `.local/presentation/<실행 ID>/result.json`에 수신 응답과 조회 결과를 저장한다. 주입은 한 번으로 끝나고 화면·sample 센서 상태 갱신은 Ctrl+C까지 유지한다. 실행 전제와 AI 설정은 [기존 발표 실행법](presentation.md)을 따른다.

## 기존 sample을 최근 24시간에 분산하기

`backend/.venv/bin/python scripts/distribute_sample_history.py`는 기존 sample을 서버별 순서대로 최근 24시간에 고르게 분산한다. 발생·수신·원본 시각을 함께 맞추고, 발생 시각을 알 수 없던 이벤트는 그대로 둔다. 시각은 시연을 위한 합성 값이며 실제 수신 이력이 아니다. live 이벤트와 저장된 Snapshot·Replay는 변경하지 않는다. 변경 전 데이터는 Git 제외 `.local/sample-history/`에 백업한다. `DATABASE_URL` 또는 기존 로컬 발표 DB 설정을 사용한다.

sample 화면을 새로 열면 기본 조회 기간은 최근 24시간이다. 저장된 조사는 이전 시점의 고정 기록이므로 변경된 시간 분포를 조사하려면 새로 조사를 시작한다.

## 초당 100건 규모의 시연 집계

`backend/.venv/bin/python scripts/distribute_sample_history.py --events-per-second 100`은 원본이 100건 이상인 sample 서버마다 최근 24시간 8,640,000건을 표현하도록 대표 이벤트의 내부 가중치를 저장한다. 실제 원본 수와 live 데이터는 늘리지 않는다. `sampleWeight`는 수신 API가 받아들이는 새 계약이 아니며 로컬 sample 준비 도구가 설정하는 내부 값이다.

`GET /api/dashboard`, `/api/servers`, `/api/network`는 sample만 가중 집계한다. dashboard의 선택적 `simulation={mode:weighted-sample,representativeEvents:N}`은 환산 여부와 조회 범위의 대표 원본 수를 알린다. live와 가중치 없는 sample은 항상 원본 한 건씩 집계한다. 필터와 집계 기간을 먼저 적용한 후 가중치를 합산한다. 이벤트 목록의 total·페이지, 저장 조사·Snapshot·AI 분석은 대표 원본 기준이며 기존 저장 결과를 수정하지 않는다.

추이 그래프는 구간 합계를 구간 초 수로 나눈 `건/초` 평균을 표시한다. 10분간 60,000건은 약 100건/초이며, 24시간 누적과 그래프의 초당 평균은 단위가 다르다. 이는 합성 활동 규모의 표현이며 실제 수집 성능 측정 결과가 아니다.
