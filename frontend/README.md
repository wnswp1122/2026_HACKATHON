# SaaS 대시보드 담당 지침

## Security Story 사고 대응 프론트엔드 MVP (2026-10-31)

이 저장소의 최신 사용자 요청에 따라 `src/main.tsx`에 React·TypeScript·Vite 화면 3개를 구현했다. 아래의 기존 스냅샷/캡처 지침은 이전 범위의 설계 기록이며, 현재 실행 가능한 화면과 API는 사고 중심 MVP다. 백엔드 팀의 조회 계약이 확정되면 연결 지점을 함께 조정해야 한다.

### 실행

```powershell
cd frontend
npm ci
npm run dev
```

브라우저에서 `http://localhost:5173`을 연다. 기본값은 Demo 모드다. Demo는 시연용 사건 5건(웹 서버 셸, 민감 설정 파일, 컨테이너 패키지 관리자, SSH 설정 확인, 정상 관리자 작업)을 제공한다. 대시보드 → 사고 분석 → 타임라인/원본 JSON → 대응 상태·체크리스트·메모 → 대시보드 복귀가 동작한다. 변경은 브라우저 `localStorage`의 `security-story-demo-v1`에 저장되어 새로고침 후에도 유지된다. 사건 시각 기준은 `security-story-demo-anchor-v1`에 저장된다. 시연 상태를 초기화하려면 두 키를 삭제한다.

### FastAPI 모드

`frontend/.env.example`을 참고하여 `frontend/.env.local`에 다음을 설정하고 개발 서버를 다시 시작한다.

```dotenv
VITE_DATA_MODE=api
VITE_API_BASE_URL=http://127.0.0.1:8000
```

브라우저가 FastAPI를 직접 호출하므로 서로 다른 포트로 실행할 경우 FastAPI에 `http://localhost:5173` CORS 허용이 필요하다. API 모드에서 실패한 요청은 Demo로 대체하지 않으며 오류와 마지막 성공 조회 시각을 표시한다. 4초마다 개요·사고·이벤트 목록을 재조회한다. 수집기 연결 상태는 `collectorStatus` 값이 있을 때만 정상/이상을 표시한다. API 키나 OpenAI 키는 브라우저 설정에 넣지 않는다.

### 제안 조회·변경 계약

기존 [수신 계약](../docs/api-contract.md)의 `POST /api/events`는 사용자 서버 → SaaS 전송용이다. 아래는 프론트 조회용 **제안 계약**이며 현재 백엔드 구현으로 확인되지 않았다.

| 요청 | 최소 응답 |
|---|---|
| `GET /api/overview` | `{ monitoredServers, collectorStatus: "healthy" \| "degraded" \| "unknown", collectorLabel, todayEvents, trend: [{time,process,file,network,high}], serverRisk: [{server,score}], severityDistribution: [{severity,count}] }` |
| `GET /api/events` | `{ items: [SecurityEvent] }` 또는 배열 |
| `GET /api/incidents` | `{ items: [Incident] }` 또는 배열 |
| `GET /api/incidents/{id}` | `Incident` 상세, `events` 포함 |
| `POST /api/incidents/{id}/analyze` | `{ analysis: {behavior,risk,impact,evidence,uncertainty,analyzedAt} }` 또는 분석 객체 |
| `PATCH /api/incidents/{id}` | 요청 `{status?,checklist?,memo?}`. 저장 후 프론트가 상세를 다시 조회함 |

`Incident` 최소 필드는 `id`, `title`, `server`, `firstSeenAt` (ISO 8601 또는 null), `severity` (`CRITICAL/HIGH/MEDIUM/LOW`), `status` (`unconfirmed/investigating/resolved/benign`), `source` (`live/sample`), `events`, `analysis`, `guide` (문자열 배열), `checklist` (boolean 배열), `memo`, `activity` (`{at,text}` 배열)다. `SecurityEvent`는 `id`, `incidentId`, `occurredAt`, `server`, `type`, `title`, `process.binary`, `command`, `process.parentBinary`, `target`, `ip`, `port`, `rawEvent`를 사용한다. 누락된 관찰 필드는 `미수집`으로 표시한다. 응답 정규화는 `src/api.ts`, 공통 모델은 `src/model.ts`, Demo 데이터와 브라우저 저장은 `src/mock.ts`에 있다.

기존 백엔드 문서의 기간 스냅샷/화면 캡처 AI 흐름과 이번 사건 단위 분석 흐름은 서로 다르다. 실제 API 연결 전에 경로·필드·권한·AI 입력 범위·사고 생성/저장 방식·분석 응답 지속성을 백엔드 담당과 확정해야 한다. 현재 프론트는 서버 격리, IP 차단, 프로세스 종료를 수행하지 않는다. 실제 Tetragon 데이터나 실제 OpenAI 호출은 프론트 Demo 검증에 포함되지 않는다.

다른 팀원 담당. React·TypeScript·Vite·Recharts로 구현한다. 사용자 측 Orca 작업에서 프론트를 구현하지 않는다. 아직 화면 코드는 없다.

## 화면과 연결

- 인스턴스/기간/유형/경고/source 필터, 전체 범위 집계 카드·유형 분포·시간 추이·목록·원본 상세.
- 2초 폴링, sample/live와 경고 의미를 구분. API 실패 시 기존 화면과 마지막 성공 시각 유지.
- 원본을 직접 정규화하지 않는다. API 필드/경로/오류는 SaaS 팀원과 먼저 합의한다.
- 최근 수신을 Tetragon 정상 연결로 표시하지 않는다. reportedAction을 실제 차단 성공으로 바꾸지 않는다.

## AI 분석 화면

사용자 기간 선택 → SaaS 스냅샷 생성 → 고정 데이터 표시 → 로딩/폰트/애니메이션 완료 후 html-to-image로 분석 영역 캡처 → snapshotId에 이미지 연결 → 분석 요청·결과 표시.

새 이벤트가 들어와도 분석 영역은 고정한다. 캡처에 snapshotId·기간·출처·집계 범위를 표시한다. 원본 JSON·명령 인자·비밀값은 캡처 영역에서 제외한다. 캡처 실패 시 데이터만 분석하는 대체 동작을 하지 않는다.

빈 상태·오류·미설정 AI·오래된 응답과 선택 변경을 처리하고, 외부 문자열은 실행하지 않고 텍스트로 렌더링한다. [데이터 의미](../docs/api-contract.md), [수동 확인](../docs/manual-verification.md)을 따른다.
