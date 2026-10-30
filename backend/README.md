# 백엔드 구현 안내

## 목표·경계

원본 Tetragon 이벤트를 수신·정리·저장하고 화면에 제공한다. 경고 판정과 AI 요청 연결도 맡는다. 정책 적용·컨테이너 제어는 하지 않는다. **현재는 의존성 목록만 있으며 코드는 미구현이다.**

입출력은 [API 계약](../docs/api-contract.md), 실행 방법은 [개발 환경](../docs/local-development.md)을 따른다.

## 작성할 파일과 순서

| 파일 | 할 일 |
|---|---|
| `src/__init__.py` | 패키지 진입점 |
| `src/settings.py` | 환경변수 로드. 키는 서버 내부에 보관. 경고 정책명은 쉼표 분리 후 공백 제거 |
| `src/main.py` | FastAPI app, health, 공통 오류 처리, events/analysis router, `/`와 `/static` 제공 |
| `src/events/models.py` | 수신 봉투·응답 모델. null 허용 여부와 enum은 API 계약 준수 |
| `src/events/normalize.py` | 실제 원본 → 공통 이벤트. 원본에 없는 값을 만들어내지 않음 |
| `src/events/store.py` | ID 부여 후 최근 1,000건 저장·조회. DB 추상화 계층 불필요 |
| `src/events/router.py` | POST/GET events와 상세. 라우터에 원본 파싱을 중복 작성하지 않음 |
| `src/analysis/router.py` | 이벤트 조회, 사용자 설명 검증, 분석 service 호출 |
| `src/analysis/service.py` | 허용 필드 선택, OpenAI 호출, 구조화 응답 검사 |

각 하위 패키지에 `__init__.py`를 둔다. 앱 시작 때 메모리 저장소와 `serverSessionId`를 한 번 만든다. 삭제된 이벤트는 404. 정적 경로는 소스 위치에서 계산하고 `/api` 경로를 가로채지 않게 `/static`에 mount한다.

## 처리 흐름

1. 봉투 형식 검증 → 원본 변환 → 정책명 기반 경고 분류.
2. ID와 receivedAt 부여 → 보관 한도 적용 → 201 응답.
3. 목록에서는 rawEvent 제외, 상세에서는 포함. 최신은 발생 시각이 아닌 수신 순서 기준.
4. AI 분석은 버튼 요청 시에만 실행. HTTPX AsyncClient 등을 사용해 다른 API를 막지 않는다.

## 완료 확인

[수동 확인](../docs/manual-verification.md)의 API 성공·유효성 오류·없는 ID·AI 미설정·재시작 초기화를 확인한다. 실제 Tetragon 원본 수신 여부는 sample 요청 성공과 별도로 적는다. 구현 후 README에 실제 기동 명령, 확인한 버전과 PR 검증 결과를 남긴다.
