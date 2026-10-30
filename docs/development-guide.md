# 처음 시작하는 팀원과 AI를 위한 개발 가이드

**상태: 구현 지침. 애플리케이션은 아직 없다.** Python 가상환경과 의존성 설치만 이전 작업에서 확인했다. 아래 파일과 실행 명령 중 `구현 후` 표시는 앞으로 만들어야 하는 대상이다. 문서가 있다는 이유로 기능이 완료됐다고 판단하지 않는다.

## 1. 무엇을 완성하나

시연용 서버의 활동을 Tetragon으로 관찰하고, 미리 준비한 정책으로 특정 행동에 대응한다. 이벤트를 로컬 백엔드에 보내 화면에서 보고, 선택한 이벤트를 AI가 설명한다.

| 기능 | 완료 모습 |
|---|---|
| 실제 관찰 | 시연용 명령을 실행하면 Tetragon 원본 JSON이 생성됨 |
| 정책 대응 | 정책 전후의 실제 프로세스 상태 또는 작업 결과가 달라지고 이유를 확인함 |
| 대시보드 | 시각·유형·대상·프로세스·경고 이유를 조회하고 원본을 펼쳐 볼 수 있음 |
| 알림 | 열린 화면에서 새 경고를 배너로 표시함 |
| AI 분석 | 사용자가 선택한 이벤트의 사실·가능성·확인 사항·한계를 반환함 |

AI가 YAML을 고치거나, 서버에 명령을 실행하거나, 공격 여부를 확정하지 않는다. 외부 알림·로그인·고객별 관리·DB·Kubernetes 도입은 이번 필수 범위가 아니다.

## 2. 문서를 읽는 순서

1. 이 문서: 작업 순서와 담당 범위.
2. [전체 설계](runtime-security-design.md): 수집과 대응이 어떻게 분리되는지.
3. [API 계약 v1](api-contract.md): 전송·백엔드·화면의 공통 입력과 출력. 계약은 이 파일 한 곳에서 관리.
4. [개발 환경](local-development.md): 설치, 설정, 구현 후 실행 명령.
5. 담당 폴더 README: 만들 파일과 세부 작업.
6. [수동 확인](manual-verification.md), [GitHub 협업 규칙](github-collaboration.md).

각 문서의 예시는 원본 측정값이 아니다. 실제 이벤트와 예시 입력은 `source: live|sample`로 구분한다. 실제 차단 증거는 별도로 기록한다.

## 3. 이번 구현의 기본 선택

- Python 3.12 + FastAPI/Uvicorn/HTTPX, 단일 백엔드 프로세스.
- 화면은 HTML/CSS/JavaScript. FastAPI가 `/`와 `/static`으로 제공하므로 브라우저와 API가 같은 주소를 쓴다.
- 이벤트 저장은 메모리 최근 1,000건. 재시작 시 초기화. 화면은 최근 100건을 2초 간격으로 조회한다.
- 전송기는 UTF-8 JSON 한 줄이 이벤트 하나인 파일을 읽어 HTTP로 전달한다. gRPC는 이번 기본 경로에서 제외한다.
- 대응 정책은 사람이 Tetragon에 직접 적용한다. 백엔드에는 적용·중지·차단 명령 API를 만들지 않는다.
- AI 분석은 버튼을 누를 때 호출한다. OpenAI Responses API와 gpt-5-mini를 사용한다. 키 미설정은 503으로 반환한다.

이는 역할을 분리해 구현하기 위한 기본값이다. 변경이 필요하면 소비자에게 먼저 공유하고 [결정 기록](decisions.md)과 단일 API 계약을 함께 고친다.

## 4. 구현할 파일과 담당

아래는 **목표 구조**다. 현재는 README와 의존성 파일만 있으며 코드 파일은 아직 없다.

```text
demo/
  server.py                 # 정상 확인 API만 제공
  probe.py                  # 시연 파일 읽기를 별도 프로세스로 수행
  Dockerfile                # 시연 컨테이너
  README.md                 # 실행과 정상/대응 결과 확인

tetragon/
  policies/observe.yaml     # 검증 후 작성할 관찰 정책
  policies/enforce.yaml     # 검증 후 작성할 대응 정책
  README.md                 # 버전·환경·적용·해제·실제 출력 위치

event-forwarder/
  main.py                   # JSONL 읽기·HTTP 전송. 변환은 하지 않음
  README.md

backend/src/
  __init__.py
  main.py                   # 앱·정적 파일·라우터·공통 오류 처리
  settings.py               # 환경변수 읽기
  events/
    __init__.py
    router.py               # 수신·목록·상세 경로
    models.py               # 공통 요청·응답 스키마
    normalize.py            # 원본 변환·정책명 기반 경고 분류
    store.py                # 최근 1,000건 메모리 저장
  analysis/
    __init__.py
    router.py               # ID로 이벤트 조회 후 분석 실행
    service.py              # 전송 필드 선택·프롬프트·제공자 호출·응답 검증

frontend/
  index.html
  styles.css
  src/
    main.js                 # 초기화·공통 API 오류 처리
    events/view.js          # 목록·필터·상세·주기 조회·새 경고 배너
    analysis/view.js        # 분석 버튼·서버 설명·상태·결과
```

파일을 더 나누는 것은 실제 코드가 커졌을 때 결정한다. 별도 repository 인터페이스, 메시지 브로커, 정책 배포 서비스는 만들지 않는다.

## 5. 작업을 병렬로 시작하는 방법

### Tetragon·시연 담당

[시연 서버](../demo/README.md)와 [Tetragon](../tetragon/README.md)을 읽는다. 실제 JSON과 정책 적용 전후 결과를 가장 먼저 공유한다. Linux 환경·버전·정책·원본에서 대상 경로가 담긴 위치를 기록한다. 미검증 정책을 정상 동작한다고 전달하지 않는다.

### 전송·백엔드 담당

[전송기](../event-forwarder/README.md), [백엔드](../backend/README.md), [API 계약](api-contract.md)을 읽는다. 원본은 전송기가 가공하지 않고 백엔드가 변환한다. Tetragon 설치를 기다리지 않고 `source: sample` 입력으로 개발을 시작한다. 실측 원본이 오면 매핑과 실제 전달을 확인한다.

### 화면 담당

[화면](../frontend/README.md)과 API 계약을 읽는다. 최근 목록·상세·빈 상태·연결 실패·AI 실패까지 만든다. UI에서 Tetragon 원본 경로를 해석하지 않는다. 분석 서버가 없으면 503 상태도 정상적으로 보여준다.

### AI 담당 또는 백엔드 담당

[AI 분석](../backend/src/analysis/README.md)을 읽는다. OpenAI Responses API/gpt-5-mini로 입력 필드 선정·구조화 응답·미설정 오류 처리를 구현한다. 키와 모델 접근이 준비되면 실제 호출 1건을 확인한다.

## 6. 약 5시간의 실행 순서

시간은 작업 계획이며 완료 보장이 아니다. 인원이 있으면 담당별로 병렬 진행한다.

| 구간 | 먼저 끝낼 것 | 연결 확인 |
|---|---|---|
| 0~60분 | Linux/Tetragon 기본 이벤트 확인, 백엔드 sample 수신, 화면 틀 | sample 입력으로 목록 표시 |
| 60~120분 | 정책 관찰·대응 검증, 전송기, 목록/상세 | 실제 원본 한 건을 API로 전송 |
| 120~210분 | 정책별 매핑·경고, 화면 통합, AI 연결 | 실제 활동 → 화면 알림 |
| 210~270분 | AI 오류 처리와 시연 반복 | 분석 실패해도 목록 유지 |
| 270~300분 | 수동 확인, README 보완, 검증 후 PR | 실제 대응 증거와 미검증 범위 정리 |

Tetragon이 막혀도 다른 컴포넌트는 sample로 개발한다. 단, 샘플 화면 완성을 실제 탐지·차단 완료로 바꾸지 않는다. 대응 검증이 실패하면 해당 기능은 미완료로 남기고 원인을 기록한다. 범위를 바꿀지는 팀이 결정한다.

## 7. 팀원이 AI에게 전달할 요청 예시

담당별로 아래 요청 중 하나를 전달한다. 파일 작성은 담당 범위에서 진행하고 공통 계약 변경이 필요하면 먼저 공유한다.

### 백엔드

> AGENTS.md, docs/development-guide.md, docs/api-contract.md, docs/local-development.md와 backend의 README들을 읽고 백엔드를 구현해 줘. 최근 1,000건 메모리 저장과 동일 주소의 정적 화면 제공을 사용해. 아직 OpenAI 키가 없으면 503을 반환하고, 문서의 sample 요청으로 수신·목록·상세·오류를 직접 확인해 줘. 계약을 임의로 변경하지 말고 실행 명령과 검증 결과를 README에 남겨 줘.

### 화면

> docs/api-contract.md와 frontend의 README들을 기준으로 별도 빌드가 없는 대시보드를 구현해 줘. 이벤트 목록·필터·상세·새 경고 배너·AI 조사 안내를 만들어 줘. source가 sample인 항목을 표시하고 reportedAction을 차단 성공으로 표현하지 마. API가 없으면 sample임을 표시해 확인하고 실제 연결 여부는 별도로 알려줘.

### Tetragon·시연

> demo/README.md, tetragon/README.md, docs/manual-verification.md를 읽고 격리된 Linux 환경에서 시연 파일 읽기의 관찰과 대응을 준비해 줘. 실제 지원 버전과 훅을 확인하고, 동작하는 정책·적용/해제 명령·원본 이벤트·프로세스 또는 작업 결과를 남겨 줘. 서버 전체나 호스트 관리 프로세스를 대상으로 하는 정책을 적용하지 마. Docker Desktop 지원을 추측하지 말고 실제 결과를 확인해 줘.

### 전송기

> docs/api-contract.md, docs/local-development.md, event-forwarder/README.md를 읽고 JSONL 전송기를 구현해 줘. rawEvent는 그대로 전달하고 변환하지 마. replay 입력은 sample로 구분하고 follow 모드에서 불완전한 줄을 잘라 보내지 마. 성공·실패와 처리 개수를 확인하고 재전송 보장을 하지 않는 한계를 README에 남겨 줘.

## 8. 마무리

[수동 확인표](manual-verification.md)를 실행하고, 결과·명령·환경과 미확인 항목을 기능 PR에 적는다. [협업 규칙](github-collaboration.md)에 따라 이슈 생성 없이 기능별 PR, 단위별 커밋, 로컬 검증 후 푸시, 검증 후 머지를 따른다. 이 문서는 구현 기준이다. 구현 완료 여부는 현재 코드와 각 PR의 실제 검증 기록으로 확인한다.
