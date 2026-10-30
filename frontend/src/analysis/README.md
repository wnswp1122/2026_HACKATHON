# 다섯 화면의 공통 안전 스냅샷·분석

기준은 **d960d3f**의 [5화면 후속 계약](https://github.com/wnswp1122/2026_HACKATHON/blob/d960d3f/docs/tetragon-screen-plan.md)이다. [실행·검증과 미검증 범위](../../README.md)를 따른다.

각 화면은 현재 조회 범위로 같은 분석 영역을 열고, 리플레이는 저장된 고정 필터를 전달한다. 화면마다 별도 AI/캡처 구현을 복제하지 않는다. `safeSnapshotFilters`와 API 경계는 기존 from/to/instanceId/eventType/status/source만 만든다. processExecId/policyName은 제거하고 제외 사실을 안내한다.

`AnalysisPanel.tsx`는 생성/복원 → 고정 영역 렌더링 → 폰트·레이아웃·차트 준비 → PNG → 같은 ID에 업로드 → 분석을 순서대로 수행한다. `SnapshotView.tsx`는 받은 안전 Snapshot만 memo로 렌더링한다. 새 Event의 file/network/process 필드를 넣지 않는다. 원본·경로·IP·execId·센서 상태·위치·그래프와 페이지 전체는 AI 입력/캡처 밖이다.

`capture.ts`는 1100px 동일 영역·1x 픽셀·5 MiB/4096px 제한·PNG 디코딩을 확인한다. 캡처/업로드 실패 시 AI를 호출하지 않고, 같은 페이지에서 재시도는 같은 PNG Blob을 사용한다. 생성/조회/업로드/분석의 ID가 섞이지 않게 확인한다. 요청 중 중복 클릭·필터 변경·화면 이동을 잠근다. URL 복원 뒤 이미지 재캡처 충돌 가능성은 상위 README에 적었다.

독립 mock 분석의 모델명은 `mock-no-model-called`다. 실제 모델의 판단이라고 쓰지 않는다. UI 패널의 기본 설명은 분석 경계이며 디자인에 적힌 예시 IP/명령/센서 상태를 AI 근거로 생성하지 않는다. 실제 전체 통합·유료 모델 호출은 별도 검증이다.
