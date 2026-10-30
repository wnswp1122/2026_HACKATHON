# LiteSOC 보안 대시보드

React·TypeScript·Vite 기반 로컬 MVP 프론트다. 조회·스냅샷·이미지·AI의 연결 기준은 [SaaS HTTP 계약 v1](../docs/saas-parallel-development.md)이다. `frontend/`만 구현했으며 실제 SaaS 모듈 전체 통합과 실제 모델 분석 완료를 뜻하지 않는다.

## 설치와 실행

검증 환경: macOS ARM64, Node 24.20.0, npm 11.19.0. Node 22.12 이상을 사용한다. 실제 설치 버전은 `package.json`과 `package-lock.json`에 고정했다.

```sh
cd frontend
npm ci
npm run typecheck
npm run build
npm run dev
```

기본 주소는 <http://127.0.0.1:5173>이다. 포트가 사용 중이면 다른 포트로 이동하지 않고 실패한다. Vite `/api` proxy는 기본 `http://127.0.0.1:8000`이다. `.env.example`을 참고해 `frontend/.env.local`에 `VITE_API_PROXY_TARGET`을 설정한 뒤 Vite를 다시 실행한다. ingest 토큰·AI 키를 프론트 환경변수에 넣지 않는다. Vite의 `VITE_` 변수는 공개 설정으로 취급한다.

`npm run preview`는 정적 빌드의 로컬 확인용이며 Vite 8의 기본 동작에 따라 같은 `/api` proxy 설정을 이어받는다. API 목적지는 실행 시 설정하고 화면의 `VITE_DATA_LABEL`은 빌드 시 결정된다. 이번 브라우저 검증은 dev 서버에서 수행했다. 운영 배포·인증은 이번 범위에 없다.

## 화면과 책임

- `src/events/`: 인스턴스·기간·유형·경고·live/sample 필터, 전체 범위 집계와 수신 추이/유형 분포, 20건 페이지 목록, 별도 원본 상세.
- `src/analysis/`: 서버 스냅샷 생성/복원, 고정 영역, PNG 생성·검증·업로드, AI 요청/재시도와 결과의 사실·해석·확인 사항·한계 표시.
- `src/api.ts`, `src/types.ts`: 공통 HTTP 경로·오류·camelCase 계약. 제품 API에 sample fallback을 넣지 않는다.

라이브는 2초 간격으로 폴링한다. 진행 중인 조회와 겹치면 다음 주기를 기다리고, 필터·페이지 변경 시 이전 요청을 취소하고 이전 응답을 무시한다. 대시보드·목록·인스턴스를 모두 가져온 성공 화면만 갱신한다. 조회 실패 시 마지막 성공 데이터·시각·해당 필터 범위를 남기고 오류를 함께 표시한다. 성공 후 10초가 지나면 오래된 화면으로 표시한다. 라이브 조회의 집계와 목록은 별도 HTTP 요청이며 DB의 같은 시점이라고 보장하지 않는다. 스냅샷의 일관성은 서버 트랜잭션 계약에 맡긴다.

수신 기간은 `[from,to)`이고, 직접 선택은 로컬 시각을 UTC ISO로 변환한다. 최대 31일이다. 상대 기간은 폴링마다 이동한다. 원본에서 새 이벤트를 해석하거나 공격을 판정하지 않는다. `attention`은 등록한 정책명 일치이며, `outcome=unknown`을 차단 성공으로 바꾸지 않는다. 최근 수신은 heartbeat가 아니다.

## 고정 캡처·분석 순서

1. 현재 적용한 필터와 실행 시점의 기간으로 `POST /api/snapshots`.
2. 반환된 스냅샷을 라이브와 별도 상태로 렌더링. URL의 `?snapshot=UUID`로 새로고침/링크 복원 가능.
3. 웹폰트와 두 프레임의 레이아웃을 기다리고, Recharts 애니메이션을 끈 상태의 **같은 1100px 고정 영역**을 html-to-image로 PNG 생성.
4. PNG 디코딩·크기·5 MiB 제한을 확인하고 `PUT /api/snapshots/{id}/image`에 바이너리 업로드.
5. 업로드가 성공한 같은 ID로 `POST /api/snapshots/{id}/analysis`. 결과 ID 일치 확인 후 표시.

고정 영역에는 ID·생성 시각·기간·필터·출처·전체 집계·최대 8건의 안전 요약을 표시한다. 서버 저장 요약 수/한도/생략 여부와 화면에서 생략한 수를 별도로 표시한다. 원본 JSON·명령 인자·프로세스 경로·원본 상세·라이브 목록은 캡처 밖이다. 데이터 문자열은 React 텍스트로 표시한다. Noto Sans KR·JetBrains Mono는 npm 패키지에서 로컬 제공하며 외부 폰트 CDN을 사용하지 않는다.

작업 중 필터·복원·중복 버튼을 잠근다. 라이브 폴링은 계속되어도 스냅샷은 바뀌지 않는다. 캡처/업로드 실패 시 AI 요청은 보내지 않는다. PNG 다운로드가 가능하며, 같은 페이지에서 실패 재시도는 같은 PNG 바이트와 ID를 사용한다. AI 미설정/실패/시간 초과를 성공으로 표시하지 않는다. 외부로 보내는 안전 요약+집계+기간+출처+PNG를 버튼 주변에 안내한다.

저장한 스냅샷과 성공 분석은 GET으로 복원한다. 이미지 다운로드 API는 계약에 없으므로 페이지를 새로고침하면 이전 PNG Blob은 유지되지 않는다. 복원한 미완료 스냅샷 재시도에서는 화면을 다시 캡처한다. 기존 이미지와 바이트가 다르면 서버 409를 그대로 오류 처리하며 덮어쓰지 않는다. 필요하면 새 스냅샷을 생성한다. 성공 결과의 영속성은 backend/PostgreSQL 책임이며 프론트는 원본·이미지·결과를 localStorage에 복사하지 않는다.

## Figma 참조와 계약 차이

출처: [팀f / 115:2 페이지](https://www.figma.com/design/f0DLL11tJXk2Z4pccjd8ki/팀f?node-id=115-2), [A · 보안 개요 198:2](https://www.figma.com/design/f0DLL11tJXk2Z4pccjd8ki/팀f?node-id=198-2), [C · 런타임 이벤트 198:1162](https://www.figma.com/design/f0DLL11tJXk2Z4pccjd8ki/팀f?node-id=198-1162).

공식 MCP의 overview 고정밀 context/스크린샷과 runtime 하위 `198:1575` 고정밀 context, 공유된 runtime 스크린샷을 확인했다. LiteSOC 로고, 1440px 기준 sidebar 216px/topbar 56px, 배경 `#0a0c10`/sidebar `#0d1015`/panel `#12151b`/border `#242a33`, text `#e8eaed`/muted `#8b93a0`, pink `#ff3b5c`/cyan `#22d3ee`, 폰트와 조밀한 카드·이벤트표·AI 브리핑 스타일을 적용했다. 작은 화면에서는 사이드바를 가로 탐색으로 바꾸고 표/고정 캡처는 내부 스크롤한다.

범위에 없는 메뉴·검색·알림·계정·정책편집은 추가하지 않았다. 디자인의 위험점수·탐지 지연·6/6 정상·유출 GB·MITRE·예시 분석 문구를 옮기지 않았다. 카드는 계약의 total/attention/bySource에 연결했다. AI 브리핑은 대기 또는 실제로 받은 해당 스냅샷 결과만 표시하고 mock은 명시한다. 파이프라인은 관측 불가 상태를 미확인으로 표시한다. 메모리 저장 UI는 사용하지 않으며 제품 저장 계약은 PostgreSQL이다. 디자인의 정적 차트/상태 이미지는 계약 데이터에 따라 달라지는 차트/미확인 상태로 구현했다. 범위 밖 검색·알림 아이콘 슬롯은 제외해 별도 Figma 정적 asset이 필요하지 않았다. 참조 PNG를 앱 이미지로 사용하지 않았고 Figma 파일도 수정하지 않았다.

## 독립 mock 수동 검증

백엔드가 없는 현재 브랜치에서만 사용하는 로컬 harness다. `scripts/mock-server.mjs`는 제품 번들에 포함되지 않고 외부 서비스/실제 모델을 호출하지 않는다. 모든 생성 이벤트는 `source=sample`이다. live 필터는 빈 결과다. 데이터·스냅샷·PNG·mock 결과는 Git 제외 경로 `.local/mock/`에 저장하므로 mock 재시작 후 복원 확인이 가능하다. 실제 PostgreSQL 검증으로 해석하지 않는다.

터미널 두 개에서 실행한다.

```sh
# 터미널 1, frontend에서
npm run mock
# 터미널 2, frontend에서
VITE_API_PROXY_TARGET=http://127.0.0.1:18004 VITE_DATA_LABEL='독립 mock · 실제 SaaS/모델 아님' npm run dev
```

mock은 localhost 18004를 사용하며 기존 backend 8000/data 18002/AI 18003 포트를 점유하지 않는다. Docker·Lima·기본 context를 사용하거나 변경하지 않는다. mock control은 아래처럼 별도 경로에서 조작하고 브라우저 5173에서 확인한다.

```sh
# 503 후 마지막 성공 화면 보존 확인
curl -s http://127.0.0.1:18004/__mock/control -H 'Content-Type: application/json' -d '{"failRead":true}'
# 조회 복구 + AI 미설정. 새 스냅샷 분석 또는 같은 ID 재시도
curl -s http://127.0.0.1:18004/__mock/control -H 'Content-Type: application/json' -d '{"failRead":false,"ai":"AI_NOT_CONFIGURED"}'
# AI 외부 실패/시간 초과는 ai를 AI_FAILED / AI_TIMEOUT으로 변경
# 정상 mock 결과로 복구
curl -s http://127.0.0.1:18004/__mock/control -H 'Content-Type: application/json' -d '{"ai":"success","failUpload":false,"delayMs":0}'
# 신규 sample 수신. 라이브 값이 바뀌어도 기존 스냅샷은 고정
curl -s -X POST http://127.0.0.1:18004/__mock/append
```

`failUpload:true`는 이미지 저장 실패, `delayMs:2500`은 느린 응답에 사용한다. `/__mock/stats`에서 요청 순서·분석 호출 수를 확인할 수 있다. `/__mock/reset` POST는 이 harness의 예시 데이터만 다시 생성하므로 기존 mock 스냅샷을 보존할 때는 사용하지 않는다. 실제 모듈 통합 시 mock을 중단하고 proxy를 8000으로 되돌린 뒤 별도 검증한다.

## 실제 검증 기록

2026-10-31, macOS ARM64의 설치된 Google Chrome을 Playwright로 격리 실행했다. 제품에 자동 테스트/CI를 추가하지 않았다. 아래는 모두 **독립 sample mock** 결과다.

| 확인 | 실제 결과 |
|---|---|
| 설치·타입·빌드 | npm install, npm ci, npm run typecheck, npm run build 성공. React 19.3.1 / TypeScript 7.0.2 / Vite 8.3.5 / Recharts 3.10.1 / html-to-image 1.11.13 |
| 초기 화면 | 로딩 표시 후 전체 137건/페이지 20건 분리, 다음 페이지 2/7 이동 |
| 필터 | 인스턴스+FILE_ACCESS+attention+sample 조합 3건, live는 0건 빈 상태. 31일 초과는 요청 적용 전 차단 |
| 경합·오류 | 2.5초 지연 후 새 필터의 35건 유지, 이전 응답 무시. 503 후 마지막 성공 카드/범위 유지와 10초 최근성 표시 |
| 폴링 | sample 추가 137→138 반영. 격리된 단일 페이지에서 연속 요청 간격 1996ms/2003ms 측정 |
| 스냅샷·PNG | 같은 영역에서 실제 PNG 1100×1146, 194,401바이트 생성·다운로드·업로드·mock 결과. 원본/인자/프로세스 경로 제외를 화면과 PNG에서 확인 |
| 고정·중복 | 연속 두 번 클릭에도 스냅샷/분석 각 1건. 신규 수신 139건/필터 live 0건으로 바뀌어도 고정 스냅샷은 138건 유지 |
| 실패·복구 | AI_NOT_CONFIGURED/AI_FAILED/AI_TIMEOUT 표시. 동일 PNG·ID 재시도 성공. 복원 payload/분석의 snapshotId 불일치를 각각 거부. 업로드 실패 시 분석 호출 수 불변. canvas 실패 주입 시 업로드/분석 호출 모두 불변. 빈 스냅샷도 PNG 성공 |
| 영속성 경계 | URL 새로고침 복원. **이 작업의 mock 서버만** 종료·재기동 후 payload/분석/PNG SHA-256 일치와 브라우저 복원. JSON 파일 영속성이며 PostgreSQL 검증 아님 |
| 화면·접근 | 1440×1024 및 390×844 확인. 390px 페이지 전체 넘침 없음, 고정 영역은 1100px 내부 스크롤. 원본 script 문자열 비실행. 브라우저 런타임 예외 없음. 탐색 active/aria-current 반영 |

PNG SHA-256 확인값: `47c32cc761b01b1b4125e7c7618b0a48ef4ead87421020b6a034e91a47d3bf52` (sample 스냅샷 `e3a98b42-ed4f-4ce0-8fef-aa1b29f83402`). 최종 memo/탐색 수정과 npm ci 후에도 캡처/업로드/mock 분석을 다시 확인했다. 데스크톱과 390px에서 같은 고정 영역을 재캡처한 PNG SHA-256도 일치했다(최종 예시 195,337바이트). 검증 스크립트·JSON·화면 PNG는 로컬 `.local/`에만 두고 Git에 넣지 않았다. Plannotator 실제 앱 피드백 창도 열었으며 사용자 검토/승인을 받았다고 보고하지 않는다.

공식 문서와 설치된 버전을 함께 확인했다: [Vite 시작/Node 기준](https://vite.dev/guide/), [Vite proxy/strictPort](https://vite.dev/config/server-options), [React effect 정리·응답 경합](https://react.dev/reference/react/useEffect), [Recharts Area 애니메이션](https://recharts.github.io/en-US/api/Area/), [html-to-image PNG·웹폰트 옵션](https://github.com/bubkoo/html-to-image), [TypeScript 설정](https://www.typescriptlang.org/tsconfig/), [Fontsource 로컬 폰트 설치](https://fontsource.org/docs/getting-started/install). 웹폰트 설치가 끝나기 전 임시 빌드에서 나온 미해결 font URL 경고는 설치 후 재빌드에서 없어졌다. 최종 빌드에는 메인 JS 약 615KB(minified, gzip 약 182KB) 크기 경고가 남는다. 캡처·분석 코드는 동적 import로 분리했다.

**미검증:** 실제 FastAPI 모듈 통합, 실제 PostgreSQL의 스냅샷/이미지/분석 영속성, 실제 Tetragon live 이벤트, 실제 외부 모델/유료 호출, Chrome 외 브라우저, 운영 배포. 프론트 구현·독립 브라우저 검증 완료이며 전체 서비스 기능 완성은 아니다. HTTP 계약 변경은 없다. 푸시·PR·머지는 수행하지 않는다.
