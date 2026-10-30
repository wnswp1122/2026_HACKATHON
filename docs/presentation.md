# 한 명령 발표 시나리오

현재 준비된 Mac에서 저장소 루트의 다음 명령을 실행한다.

```sh
./scripts/presentation.py
```

발표 전용 SaaS(18020)와 프론트(5180)를 시작하고 브라우저를 연다. 3초 간격으로 8개 이벤트를 실제 수신 API에 보내 PostgreSQL 저장과 집계 결과를 확인한다. 화면의 2초 갱신 주기에 따라 지구본 연결이 순서대로 나타난다. 실행한 터미널을 유지하고, 종료할 때 Ctrl+C를 누른다. 기본 포트가 사용 중이면 빈 포트로 새 발표 화면을 연다. 각 실행은 사용한 터미널에서 종료한다. 다른 포트를 사용하려면 `--api-port 18012 --web-port 5175`를 붙인다.

## 발표 순서

| 단계 | 화면에서 확인 |
|---|---|
| 서버·자식 프로세스 실행 | 이벤트 수 증가, 프로세스 관계 |
| 보호 파일 접근 | 텔레메트리 탐색기의 FILE_ACCESS |
| 서울 → 도쿄·프랑크푸르트·샌프란시스코 | 지구본 점과 3개 연결 |
| 정책 일치·SIGKILL 동작 기록 | 정책 일치 1건, 이벤트 상세의 대응 기록 |
| 자식 프로세스 종료 | 총 8건, NETWORK 3건, 시간순 관찰 활동 |
| AI 분석 | 고정된 이벤트 요약·집계와 PNG를 함께 분석하고 사실·가설·확인 사항·한계 표시 |

모든 이벤트와 준비 점검 상태는 `source=sample`이다. IP는 문서용 주소이며 도시 좌표는 발표를 위해 지정한 가상 관계다. 실제 IP 지리 위치나 공격·차단 성공을 입증하지 않는다. 실행 중 상태를 30초마다 갱신하며 종료 후에는 오래된 상태로 표시된다. 실제 Tetragon·게시판·전송기는 실행하지 않는다.

화면의 기본 필터는 이번 실행의 서버 ID와 sample이다. 다른 화면으로 이동해도 선택을 유지한다. 리플레이는 화면에서 조회 범위로 생성한다. AI 키·모델이 있으면 데이터 주입 후 AI 패널을 연다. **스냅샷 생성 · AI 분석** 버튼을 누르면 현재 조회 범위의 안전 요약·집계를 고정하고, 해당 고정 영역을 PNG로 캡처·업로드한 뒤 실제 OpenAI에 요청한다. 성공 결과는 DB에 저장되며 같은 스냅샷은 재사용한다. 지구본·IP·파일 경로·관계 그래프는 현재 AI 입력에 포함되지 않는다.

실행기는 `backend/.local/core.env`의 `OPENAI_API_KEY`, `OPENAI_MODEL`만 읽으며 같은 이름의 실행 환경변수가 우선한다. 파일을 셸 코드로 실행하지 않는다. 키는 서버에서만 사용하고 Git·브라우저에 넣지 않는다. 설정 변경 후 실행기를 다시 시작해야 한다. AI 요청은 버튼을 눌렀을 때만 발생하며 브라우저 새로고침은 저장 결과를 복원한다. 모델 호출 비용이 발생할 수 있다.

발표 흐름: 지구본의 연결 증가 확인 → 텔레메트리·관계 확인 → **AI 분석** → **스냅샷 생성 · AI 분석** → 사실·가설·확인 사항·한계를 설명한다. 설정 미비·제공자 오류는 실패로 표시하며 가짜 응답으로 대체하지 않는다.

## 준비와 재실행

현재 컴퓨터에는 의존성과 Git 제외 로컬 DB 설정을 준비했다. 팀원의 새 환경에서는 PostgreSQL과 공통 스키마를 먼저 준비한 뒤 다음을 실행한다. [백엔드 준비](../backend/README.md)를 따른다.

```sh
python3.12 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.lock
(cd frontend && npm ci)
# scripts/presentation.env.example를 참고해 DATABASE_URL 설정
export DATABASE_URL='본인 로컬 PostgreSQL 연결 주소'
./scripts/presentation.py
```

`DATABASE_URL` 환경변수를 우선하며, 없으면 Git 제외 `.local/presentation/config.json`의 `databaseUrl`을 읽는다. 자동 DB 생성·마이그레이션·기존 데이터 삭제는 하지 않는다. 현재 Mac의 DB는 Lima VM과 15434 포트 터널이 실행 중이어야 한다. 서버 시작 실패 시 `.local/presentation/<실행 ID>/backend.log`, `frontend.log`를 확인한다.

매 실행마다 새로운 서버 ID로 구분하므로 과거 발표 데이터가 이번 집계에 섞이지 않는다. 데이터는 보존되며 반복 실행하면 DB에 누적된다. 명시적으로 지정한 포트가 사용 중이면 실패한다. 기존 프로세스는 종료하지 않는다. Ctrl+C는 이번 실행기가 시작한 두 서버만 종료한다.

```sh
./scripts/presentation.py --interval 1  # 빠른 시연
./scripts/presentation.py --no-open    # 브라우저 자동 열기 생략
./scripts/presentation.py --interval 0 --no-open --exit-after # 주입·집계 확인 후 종료
```

실행별 `result.json`에 단계별 수신 응답과 집계·위치 응답을 보관한다. `latest.json`에는 마지막 성공 실행의 화면 주소가 남는다. 종료 후 해당 주소는 더 이상 실행 중임을 의미하지 않는다.

## 실제 AI 연결 확인 결과

키 인증과 설정 모델 접근은 확인했고, 브라우저의 스냅샷 생성·PNG 업로드도 성공했다. 실제 분석 요청은 제공자가 HTTP 429 `credit_balance_exhausted` / `insufficient_quota`로 거절했다. 따라서 실제 AI 분석 성공과 결과 복원은 아직 검증되지 않았다. 크레딧·프로젝트 사용 한도 해결 후 저장한 스냅샷으로 다시 요청한다. 이 경우 UI는 `AI_QUOTA_EXHAUSTED`로 안내한다.

북한(KP)·중국(CN)·러시아(RU)의 가상 위험 연결 6건을 포함한다. 문서용 IP(203.0.113.101~103)에 가상 좌표를 지정하며 실제 국가별 IP 평판 정보가 아니다. 위험 판정은 국가가 아니라 `sample-risk-network` 규칙 일치로 정한다. 기본 시나리오는 전체 14건·위험 7건·네트워크 9건이다.

최근 24시간 대용량 샘플은 백엔드 환경변수를 적용한 상태에서 `backend/.venv/bin/python scripts/seed_sample_history.py`로 추가한다. `DATABASE_URL`과 `DASHBOARD_LOCATIONS_FILE`이 필요하다. 기존 데이터는 유지하고 매 실행마다 새 sample 기록을 추가하므로 필요할 때 한 번 실행한다. 화면에서 예시 데이터(sample)·전체 인스턴스·최근 24시간을 선택한다. 위험 집중 구간과 3개 서버의 정상/위험 활동을 함께 생성한다.
