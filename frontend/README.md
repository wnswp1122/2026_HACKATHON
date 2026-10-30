# SaaS 대시보드 담당 지침

사용자 요청으로 dashboard-frontend Orca 작업이 React·TypeScript·Vite·Recharts 초기 세팅부터 구현한다. [병렬 개발 기준](../docs/saas-parallel-development.md)의 API/캡처 계약을 따른다. 아직 기준 브랜치에 화면 코드는 없다.

## 화면과 연결

- 인스턴스/기간/유형/경고/source 필터, 전체 범위 집계 카드·유형 분포·시간 추이·목록·원본 상세.
- 2초 폴링, sample/live와 경고 의미를 구분. API 실패 시 기존 화면과 마지막 성공 시각 유지.
- 원본을 직접 정규화하지 않는다. API 필드/경로/오류는 병렬 개발 기준을 따른다.
- 최근 수신을 Tetragon 정상 연결로 표시하지 않는다. reportedAction을 실제 차단 성공으로 바꾸지 않는다.

## AI 분석 화면

사용자 기간 선택 → SaaS 스냅샷 생성 → 고정 데이터 표시 → 로딩/폰트/애니메이션 완료 후 html-to-image로 분석 영역 캡처 → snapshotId에 이미지 연결 → 분석 요청·결과 표시.

새 이벤트가 들어와도 분석 영역은 고정한다. 캡처에 snapshotId·기간·출처·집계 범위를 표시한다. 원본 JSON·명령 인자·비밀값은 캡처 영역에서 제외한다. 캡처 실패 시 데이터만 분석하는 대체 동작을 하지 않는다.

빈 상태·오류·미설정 AI·오래된 응답과 선택 변경을 처리하고, 외부 문자열은 실행하지 않고 텍스트로 렌더링한다. [데이터 의미](../docs/api-contract.md), [수동 확인](../docs/manual-verification.md)을 따른다.
