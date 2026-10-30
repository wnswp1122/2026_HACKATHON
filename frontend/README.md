# LiteSOC · AI 기반 서버 보안 모니터링·분석 플랫폼

React·TypeScript·Vite 기반 프론트다. **현재 후속 계약은 기준 커밋 `d960d3f`의 [Tetragon 5화면 구현 계획](https://github.com/wnswp1122/2026_HACKATHON/blob/d960d3f/docs/tetragon-screen-plan.md)**이며 [선행 PR #4](https://github.com/wnswp1122/2026_HACKATHON/pull/4)를 따른다. 이 워크트리의 오래된 `docs/saas-parallel-development.md`와 충돌하면 새 원격 계획이 우선한다. 공통 docs나 다른 담당 코드는 수정·병합하지 않는다.

다섯 화면의 프론트 구현과 독립 검증을 실제 수집·정규화·PostgreSQL·AI 모듈 전체 통합 완료로 해석하지 않는다. sample/mock과 실제 live를 구분한다.

## 실행

검증 환경은 macOS ARM64, Node 24.20.0, npm 11.19.0이다. Node 22.12 이상이 필요하다. 실제 설치한 버전과 전체 의존성은 `package.json`/`package-lock.json`에 고정했다. React 19.3.1, TypeScript 7.0.2, Vite 8.3.5, Recharts 3.10.1, html-to-image 1.11.13이다.

```sh
cd frontend
npm ci
npm run typecheck
npm run build
npm run dev
```

Vite는 `http://127.0.0.1:5173`에서 실행하고 포트가 겹치면 실패한다. `/api` proxy 기본 목적지는 `http://127.0.0.1:8000`이다. `.env.example`을 참고해 `.env.local` 또는 실행 환경에 `VITE_API_PROXY_TARGET`을 설정하고 재시작한다. `VITE_DATA_LABEL`은 검증 환경 안내용 공개 문구다. ingest 토큰·AI 키를 브라우저·Vite 변수에 넣지 않는다. 외부 GeoIP 서비스나 폰트 CDN을 호출하지 않는다.

`npm run preview`는 빌드의 로컬 확인용이며 같은 proxy 설정을 이어받는다. proxy 목적지는 실행 시, 공개 안내 문구는 빌드 시 정해진다. 운영 배포·로그인·결제는 범위 밖이다.

## 모니터링 시작 설정

처음 진입하면 인스턴스와 조회할 데이터(실제 수집 `live` / 예시 `sample`)를 선택한다. 설정은 다섯 화면에 공통 적용되고 같은 탭의 새로고침에도 유지된다. 상단 ‘모니터링 설정’에서 변경하거나 취소할 수 있다. 브라우저에는 서버 ID와 출처만 sessionStorage에 저장하며, 설정 화면은 서버 등록·수집기 설치 기능이 아니다.

각 화면의 필터는 조회 기간·상세 조건을 다룬다. 준비 점검에는 별도 기간 필터가 없다. ‘주의’ 표시는 이벤트의 정책명이 등록된 경고 정책명과 일치함을 뜻하며 공격 확정·차단 성공을 의미하지 않는다.

## 화면과 모듈

| 경로 | 화면 | 연결·동작 |
|---|---|---|
| `/overview` | 보안 개요 | 전체 관찰/정책 일치/live/sample 집계, 네트워크 관찰 지구본, 설정 위치·위치 미확인 목록, 추이·최근 이벤트 |
| `/replay` | 관찰 활동 리플레이 | 서버가 저장한 고정 집합, 발생 시각 순 재생·일시정지·1/4/16x·시점 이동, 레인·원본 상세 이동 |
| `/readiness` | 수집·정책 준비 점검 | 서버·단일 source로 상태 보고 조회. ready/warning/error/unknown/stale·사유·관찰/수신 시각·센서/정책 목록 |
| `/telemetry` | 텔레메트리 탐색기 | 수신 건수/분(버킷 평균), 시간 구간 적용, 서버·유형·프로세스·정책·출처 필터, 서버별 표·페이지 목록·별도 원본 상세 |
| `/servers` | 서버 보안 대시보드 | 서버별 관찰/정책 일치 수, 유형 분포·추이·프로세스 부모/관찰 통신 관계·초점 탐색 |

`navigation.ts`는 다섯 경로의 History 탐색·뒤로/앞으로·직접 진입을 다룬다. `/`와 예전 `#overview`는 `/overview`, `#events`는 `/telemetry`, `#analysis`는 `/overview`의 안전 분석 영역으로 안내한다. Vite의 SPA fallback으로 직접 URL 새로고침이 가능하다. 개요의 최근 이벤트나 텔레메트리 목록을 선택하면 현재 화면 오른쪽에 상세 사이드바가 열리고 선택 행이 강조된다. `?event=UUID`로 직접 진입할 수 있으며 닫기·Esc·브라우저 뒤로가 동작한다. 원본 JSON은 별도 탭에서 텍스트로 표시한다. 모르는 경로에는 개요 이동을 제공한다.

현재 API는 개별 **이벤트 조회**를 제공한다. 사건 상관 분석, 사건별 AI 요약, 처리 상태·체크리스트·메모 저장 계약은 없으므로 사이드바에 가상 결과나 저장 버튼을 표시하지 않는다. 사이드바의 확인 항목은 운영자 참고 문구이며 조치를 자동 실행하지 않는다.

`src/screens/`의 화면과 읽기 hook, `src/events/`의 필터·목록·상세·집계 차트, `src/analysis/`의 안전 캡처 흐름을 분리했다. 공통 API 경로는 `src/api.ts`, DTO와 allowlist는 `src/types.ts`에 있다. 프레임워크나 외부 서비스를 새로 추가하지 않았다.

## 조회·표현 경계

- 기간은 receivedAt `[from,to)`, 최대 31일이다. 상대 기간은 폴링마다 이동하고 직접 선택은 로컬 시각을 UTC로 변환한다. processExecId·policyName은 정확 일치, 각각 1~1024/1~100자다. 준비 점검에는 서버·단일 live/sample만 적용한다.
- 라이브 조회는 2초 폴링한다. 진행 중 조회는 겹치지 않으며 필터 변경/화면 이탈 시 취소와 active 검사로 이전 응답을 버린다. 실패 시 마지막 성공 데이터·실제 적용 범위·성공 시각을 유지하고 10초 이후 오래된 응답임을 표시한다. source를 바꾼 요청이 실패해도 이전 sample을 live 결과로 이름 바꾸지 않는다.
- 라이브 집계·목록·추가 API는 별도 HTTP 조회다. 같은 DB 시점이라고 보장하지 않으며 각 성공 범위를 표시한다. 고정 일관성은 서버 Snapshot/Replay 트랜잭션 계약에 맡긴다.
- 지구본은 location이 있는 항목만 구면 투영한다. destinationIp 우선, 없으면 sourceIp임을 표시한다. 서버 위치도 serverLocation이 있을 때만 연결한다. 설정 근거·좌표·미설정 서버 위치·반대 반구 회전을 안내한다. 미확인 IP는 지도 밖 목록에 남기며 unmappedCount는 **위치 없는 네트워크 이벤트 수**다. IP 고유 개수나 접속 성공 수로 바꾸지 않는다.
- graph의 ID/종류/간선을 그대로 사용한다. PID나 실행 파일 이름으로 부모를 추론하지 않는다. 누락 부모 노드·parent/observed·생략 플래그·200/500 상한을 표시한다. 간선 수는 이벤트 수가 아니다.
- readiness는 서버의 generatedAt/state/reason을 표시한다. 90초 stale·30초 미래 CLOCK_SKEW 등의 판정은 서버 책임이다. 미보고도 unknown으로 표시하고, 조회 성공을 서버 보안 정상으로 바꾸지 않는다. 새로고침은 저장된 보고 읽기이며 Tetragon 원격 명령이 아니다.
- 정책 일치는 공격 확정이 아니다. reportedAction을 차단 성공으로 바꾸지 않으며 outcome=unknown을 유지한다. 로그인·계정 탈취·DB 조회·전송량·위험 점수·보호율은 생성하지 않는다. 공유는 `예정`으로 비활성이다. 저장뷰·위젯 추가·미지원 env/team/os/group 필터는 제공하지 않는다.

## 고정 리플레이

`POST /api/replays`에 현재 조회 필터를 보내고 서버가 반환한 payload만 재생한다. receivedAt으로 선택한 집합 중 occurredAt이 있는 이벤트를 발생 시각·eventId 순으로 최대 2,000건 재생하며, 날짜 없는 수·전체 수·한도·생략 여부를 별도로 표시한다. 날짜 없는 이벤트의 원본 목록 이동도 제공한다. 단계 카드는 유형별 관찰이며 인과관계가 아니다.

재생 시점은 실제 발생 시각 간격에 따라 이동하고 일시정지·배속·이전/다음 관찰·슬라이더로 조작한다. 필터 변경·새 수신·2초 폴링으로 저장 집합을 교체하지 않는다. 새 집합은 사용자가 다시 고정할 때만 만든다. `?replay=UUID`와 UUID 입력으로 저장 결과를 복원한다. 이 화면의 AI 진입에는 현재 이동 중인 라이브 기간이 아닌 **그 리플레이의 고정 기간·서버·source**를 사용한다.

## 공통 안전 분석·캡처

다섯 화면의 AI 진입은 같은 공통 안전 분석 영역을 연다. **현재 페이지 전체나 지구본/관계/준비 상태 화면을 캡처하지 않는다.** 진입한 기간·서버·source 등 기존 허용 필터를 고정하고 프로세스·정책 추가 필터는 제거했다고 안내한다.

1. 기존 allowlist로 `POST /api/snapshots`. API 경계에서도 from/to/instanceId/eventType/status/source만 명시적으로 구성한다.
2. 반환된 Snapshot을 별도 상태로 렌더링. 라이브 폴링과 분리하고 memo로 불필요한 재렌더링을 막는다.
3. 웹폰트·레이아웃·차트를 준비하고 애니메이션 없는 **동일 1100px 고정 영역**을 PNG로 만든다. PNG 디코딩, 4096px/5 MiB 한도를 확인한다.
4. 같은 snapshotId에 image/png 바이너리 업로드 후에만 분석을 요청한다. 캡처/업로드 실패 시 텍스트만 분석하지 않는다.
5. snapshotId가 일치하는 결과만 사실·가능한 해석·확인 사항·한계로 표시한다. AI 미설정·실패·시간 초과를 성공으로 표시하지 않는다.

고정 영역에는 ID·시각·기간·출처·전체 집계와 최대 8건의 기존 안전 요약, 서버/화면 요약 생략 수를 표시한다. 새 Event의 file/network/process 필드를 복사하지 않는다. 원본·명령 인자·프로세스 경로·IP·execId·센서 상태·위치는 캡처와 AI 밖이다. AI 패널에 디자인의 예시 추론이나 IP/경로/상태 근거를 하드코딩하지 않는다. 외부 문자열은 React 텍스트로 표시한다.

요청 중 중복 클릭·선택 변경·화면 이탈을 잠근다. 같은 페이지에서 재시도는 같은 PNG Blob/ID를 사용한다. PNG 다운로드와 `?snapshot=UUID` 복원을 지원한다. 이미지 GET은 계약에 없으므로 새로고침 뒤 PNG는 메모리에 남지 않는다. 재캡처가 기존 바이트와 다르면 409를 오류 처리하고 덮어쓰지 않는다. 실제 영속성은 backend/PostgreSQL 책임이며 localStorage에 원본·이미지·분석을 복사하지 않는다.

## Figma 참조

[같은 페이지 115:2](https://www.figma.com/design/f0DLL11tJXk2Z4pccjd8ki/팀f?node-id=115-2)의 별도 Tetragon 복제본을 공식 MCP 고정밀 context와 렌더로 확인했다.

- [T01 387:2](https://www.figma.com/design/f0DLL11tJXk2Z4pccjd8ki/팀f?node-id=387-2) · [T02 387:215](https://www.figma.com/design/f0DLL11tJXk2Z4pccjd8ki/팀f?node-id=387-215) · [T03 387:462](https://www.figma.com/design/f0DLL11tJXk2Z4pccjd8ki/팀f?node-id=387-462) · [T04 387:777](https://www.figma.com/design/f0DLL11tJXk2Z4pccjd8ki/팀f?node-id=387-777) · [T05 387:1158](https://www.figma.com/design/f0DLL11tJXk2Z4pccjd8ki/팀f?node-id=387-1158).
- 1440px 기준 사이드바 216px, 어두운 배경 `#0a0c10`/패널 `#12151b`/경계 `#242a33`, text `#e8eaed`/muted `#8b93a0`, pink `#ff3b5c`/cyan `#22d3ee`, Noto Sans KR·JetBrains Mono, 지구본·카드·재생바·레인·표·우측 분석 패널 형식을 적용했다. 모바일은 탐색을 가로로 배치하고 표·지구본·관계·캡처를 내부 스크롤한다.
- 원본 `115:3/216/463/778/1159`도 읽었으나 최종 레이아웃 참조는 위 복제본이다. 새 노드의 GUI 문구 교정 완료를 프론트가 대신 주장하지 않는다. 문구·숫자·지원 범위는 d960d3f 계약이 우선한다.
- 지구본의 비데이터 배경 3개 SVG만 공식 asset 안내로 내려받아 `src/assets/`에 보존했다. 루트 크기는 바꾸지 않는다. 지구 배경은 참고 일러스트라고 안내하며 관찰 위치는 API 좌표에서 따로 계산한다. 정적 예시 연결선·IP·차트는 사용하지 않는다. 동적인 차트와 연결은 실제 응답으로 렌더링한다. 참조 PNG·임시 asset URL은 앱이나 Git에 넣지 않았고 Figma 파일은 수정하지 않았다.

## 독립 sample mock

제품 번들에서 import하지 않는 `scripts/mock-server.mjs`가 localhost 18004에서 실행된다. backend가 없거나 미조립일 때만 별도 실행한다. **모든 생성 이벤트/상태는 sample이며 live 선택은 빈 이벤트·미수집 상태**다. 실제 서비스의 fallback이 아니다. JSON/PNG/Replay/Snapshot/mock 분석을 ignored `.local/mock/`에 저장한다. PostgreSQL 또는 실제 모델 검증이 아니다.

```sh
# frontend/에서 각각 별도 터미널
npm run mock
VITE_API_PROXY_TARGET=http://127.0.0.1:18004 VITE_DATA_LABEL='독립 sample mock · 실제 SaaS/모델 아님' npm run dev
```

기본 source는 live다. 시작 설정에서 예시 데이터(sample)를 선택해야 예시가 나온다. 발표용 인스턴스 환경변수가 있으면 해당 인스턴스와 sample을 미리 선택해 보여 준다. 모든 예시는 안전한 문서용 IP·경로이며 실제 런타임 이벤트를 Git에 넣지 않는다. 다른 담당 서버나 공유 VM·컨테이너를 중단하지 않는다.

```sh
# 조회 장애 / 복구
curl -s http://127.0.0.1:18004/__mock/control -H 'Content-Type: application/json' -d '{"failRead":true}'
curl -s http://127.0.0.1:18004/__mock/control -H 'Content-Type: application/json' -d '{"failRead":false,"delayMs":0}'
# AI 실패 / 정상 mock. AI_FAILED / AI_TIMEOUT도 가능
curl -s http://127.0.0.1:18004/__mock/control -H 'Content-Type: application/json' -d '{"ai":"AI_NOT_CONFIGURED"}'
curl -s http://127.0.0.1:18004/__mock/control -H 'Content-Type: application/json' -d '{"ai":"success","failUpload":false}'
# 새로운 sample 이벤트와 명시적 sample 상태 보고
curl -s -X POST http://127.0.0.1:18004/__mock/append
curl -s -X POST http://127.0.0.1:18004/__mock/reports
```

`readiness` control에는 mixed/stale/clock/missing/unreachable/disabled/error/no-sensors/no-policy를 지정할 수 있다. `/__mock/many` POST는 2,505개의 sample 집합으로 한도 검증, `/__mock/undated` POST는 발생 시각 없는 집합 검증에 사용한다. `/__mock/stats`는 호출 순서와 요청 수를 제공한다. `/__mock/reset` POST는 이 임시 mock의 이벤트·고정 자료를 초기화하므로 보존하려는 mock 자료가 있으면 사용하지 않는다. 제품 API에는 이 경로가 없다.

## 검증 기록

2026-10-31, 격리된 설치 Chrome에서 브라우저 조작으로 확인했다. 제품에 자동 테스트/CI를 추가하지 않았고 일회성 조작 스크립트·JSON·PNG는 ignored `.local/`에만 있다.

### 독립 sample mock (18004)

| 직접 확인 | 실제 결과 |
|---|---|
| 타입·빌드 | `npm run typecheck`, `npm run build`, `git diff --check` 성공. 의존성·lock은 기존 검증 버전 유지 |
| 경로·탐색 | 다섯 직접 URL·새로고침·현재 메뉴·기존 hash 안내, 브라우저 뒤로/앞으로 확인 |
| 정상·빈 상태 | source=sample 137건/정책 일치 23건/네트워크 27건. 기본 live는 0건이며 예시를 자동 주입하지 않음 |
| 네트워크·asset | 설정 좌표·회전·서버 연결선·미확인 이벤트 18건 목록, SVG 3개 로드/슬롯/루트 크기 확인. 위치 없는 항목에 좌표를 생성하지 않음 |
| 필터·구간 | 서버+sample+execId+정책 정확 일치 결과 1건, 공백 execId 거부. 시계열 구간 선택이 custom 기간과 서버 조회에 적용 |
| 오류·출처 | 503 뒤 마지막 성공 데이터와 원래 sample 범위를 유지. source를 바꾼 실패 응답으로 이전 데이터를 live라고 표시하지 않음 |
| 서버·관계 | 서버 집계, parent/observed 선택, 누락 부모와 초점 노드. PID·binary로 관계를 새로 만들지 않음 |
| 준비 상태 | ready/warning/error/unknown/stale 항목 수 1/1/2/2/1, CLOCK_SKEW·미보고·비활성·조회 실패 구분. live 미수집은 7개 unknown. 혼합 source 요청 차단. 이벤트 없는 미보고 대상도 표에서 클릭해 서버 필터로 선택·전체 복귀 |
| 리플레이 | 137건 중 날짜 있는 117건·없는 20건 구분, 중복 클릭 1회 생성, 실제 시간 간격 재생/일시정지/16x·이전/다음·시점 이동. 동일 occurredAt 5개도 eventId 순으로 개별 선택·원본 상세 이동 확인. 새 수신/필터 변경 후 payload 불변 |
| 한도·미확인 | sample 2,505건에서 Replay 2,000건·네트워크 200개·그래프 노드 200/간선 500 상한과 생략 표시. 전체 날짜 없는 집합은 0건 재생과 원본 목록 이동 |
| 안전 분석 | 프로세스/정책 추가 필터를 snapshot POST에서 제거. IP·경로·execId·센서 상태·원본 sentinel이 캡처에 없음. 실제 PNG 1100×1146 생성/업로드 후 mock 분석 |
| 고정 범위·복원 | replay 생성 뒤 현재 source를 live로 바꿔도 분석 POST는 고정 replay의 from/to/source=sample 사용. 대문자 UUID 복원도 처리 |
| PNG·재시작 | 최종 PNG 194,397바이트, 데스크톱/390px 해시 일치. 이 작업 소유 mock만 재기동 후 Replay·Snapshot·분석 payload와 PNG 해시 동일, 브라우저 복원 확인. JSON 파일 영속성이며 PostgreSQL 검증 아님 |
| 화면·조작 | 1440×1024/390×844 다섯 화면 확인. 준비 표의 모바일 넘침을 수정한 뒤 전체 페이지 390px, 표·지구본·관계·캡처는 내부 스크롤. 원본 script 문자열 비실행, 브라우저 런타임 예외·외부 GeoIP 호출 없음 |

브라우저 검사 24개와 별도 고정 범위/대문자 UUID/PNG/재시작 검증을 완료했다. 최종 PNG SHA-256은 `8bc939acba57eb3af5b13cf7a4962a15b2a23105804a082b494f54a87dff1a39`다. mock Replay `77e420b6-7132-4add-9c0f-64e27ea5f95f`, Snapshot `d9cff889-2164-4239-8c92-9ccafa7f2a1d`에서 확인했다. mock 결과는 실제 모델 분석이 아니다.

### 독립 data 모듈 + PostgreSQL (18002)

다른 작업을 수정/병합하지 않고 `dashboard-data` 커밋 `3d38cb3`의 기존 독립 서버에 이 작업의 Vite proxy만 임시 연결했다. **GET만 사용**해 개요·텔레메트리·서버·준비 화면의 API 연결을 확인했다. 기간 2026-10-30T00:00:00Z~2026-11-01T00:00:00Z, source=sample을 사용했다. 입력은 data 담당이 직접 넣은 synthetic DB 자료이며 실제 Tetragon 수집이 아니다.

- 네트워크 응답 200개/상한 표시와 과거 `network=null` 3개를 IP 미확인으로 표시했다. 이 호환 처리 후 브라우저 예외 없음.
- 텔레메트리 페이지 20건, 관계 그래프·서버 집계, 준비 항목 22개(서버 상태/수집기/조회/시각 88행)를 렌더링했다.
- 읽기 연결 중 POST/PUT 등 변경 요청은 없었다. 다른 담당의 DB·서버·컨테이너를 중단하거나 데이터를 쓰지 않았다.
- 완료 후 프론트 목적지를 자체 mock 18004로 복구했다. Replay/Snapshot/AI의 이 data 서버 통합을 검증했다고 쓰지 않는다.

### 남은 범위

**실제 Tetragon → 전송기 → core 수신/정규화 → data → 다섯 화면 → 실제 AI의 전체 통합은 미검증**이다. 네트워크/정책 live 실측, 실제 상태 파일 전송, core 앱/공유 DB의 조립, 실제 모델·유료 호출·운영 배포·Chrome 외 브라우저도 별도 검증이다. 따라서 Draft PR 상태를 유지한다. 빌드는 성공하지만 메인 JS 약 624KB(minified, gzip 약 187KB) 크기 경고가 남는다. 화면·캡처·분석은 동적 import로 분리했다.

기존 `3044276`/`84ad71e`의 단일 화면 단계에서는 설치·ci·타입·빌드, sample 필터·503·경합, 1100×1146 PNG·민감 필드 제외·AI 실패·같은 PNG 재시도, mock 재기동 보존, 데스크톱/모바일 문구를 확인했다. 이 과거 기록을 신규 다섯 화면 검증이나 실제 통합으로 바꾸어 표현하지 않는다.

공식 문서: [Vite](https://vite.dev/guide/) · [서버 proxy](https://vite.dev/config/server-options) · [React effect](https://react.dev/reference/react/useEffect) · [Recharts](https://recharts.github.io/en-US/api/Area/) · [html-to-image](https://github.com/bubkoo/html-to-image) · [TypeScript](https://www.typescriptlang.org/tsconfig/) · [Fontsource](https://fontsource.org/docs/getting-started/install). 기존 설치 버전을 유지했다.

## PR #11 디자인 통합

기존 5개 화면과 SaaS API·스냅샷/PNG 분석 흐름을 유지하고 PR #11의 카드·색상·타이포그래피와 3D 지구본 표현을 적용했다. 사건 관리·localStorage Demo·별도 WebSocket·가상 공격 시나리오는 포함하지 않는다.

개요의 3D 지구본은 기존 `GET /api/network` 응답을 사용한다. `location`은 관찰 IP, `serverLocation`은 서버 설정 위치이며 양쪽 좌표가 있을 때만 관계선을 그린다. 좌표가 없으면 추정하지 않고 위치 미확인 목록에 남긴다. 회전/확대와 자동 회전 중지를 지원하고, WebGL 불가 시 목록으로 확인할 수 있다. 국가 경계·참조 구현의 고지는 [THREAT_MAP_NOTICE.md](THREAT_MAP_NOTICE.md)에 보존했다.

위치는 서버의 `DASHBOARD_LOCATIONS_FILE` 설정을 따른다. 임의 해외 위치, 위험도, 접속 성공, 공격 방향을 만들지 않는다. 기존 source 필터와 조회 범위·상한을 그대로 사용한다. 3D 라이브러리는 개요에서 지연 로딩한다. 분석 캡처는 기존 안전 영역을 유지하며 3D 캔버스를 캡처하지 않는다.
