# 이벤트 수신·변환·저장

## 목표

전송 모듈과 화면이 Tetragon 버전별 필드를 알 필요 없도록 이 패키지에서 한 번만 변환한다. [API 계약](../../../docs/api-contract.md)을 기준으로 모델·정규화·메모리 저장·라우터를 구현한다.

## 정규화 순서

1. time과 node_name을 읽는다. 시간이 없거나 해석되지 않으면 occurredAt=null.
2. process_exec/process_exit를 찾아 해당 process와 parent에서 확인된 필드를 복사한다.
3. 정책 이벤트는 실제 JSON의 policy_name/action 위치를 확인해 기록한다. 미지원 구조는 OTHER로 저장한다.
4. 파일·네트워크 target은 정책 담당자가 제공한 인자 구조로만 채운다. exec.arguments에 파일 경로가 있다는 이유로 파일 접근이라고 하지 않는다.
5. ALERT_POLICY_NAMES에 정확히 일치하는 policyName이면 attention과 이유, 아니면 observed.
6. reportedAction이 있어도 outcome은 unknown. 정책 파일을 읽어서 실제 동작한 것으로 기록하지 않는다.

## 데이터 보관

store.py는 한 프로세스에서 최근 1,000건을 보관한다. 목록은 수신 최신순, 상세는 ID로 찾는다. 성능용 캐시·DB 인터페이스·분산 저장은 필요 없다. 원본은 상세 응답에만 포함한다. JSON 로그나 UI 문자열을 실행하지 않는다.

## Tetragon 담당자가 전달할 자료

- 사용 버전, 정책명, 훅, 관심 이벤트의 원본 JSON.
- process/parent, 파일 경로 또는 목적지 주소·포트, 보고된 action의 실제 필드 위치.
- 대응 검증 결과는 별도 문서. 이벤트만으로 결과를 확정할 수 없는 이유도 포함.

이 자료를 받은 뒤 이 README에 **정책별 매핑 표**를 추가한다. 아직 실제 매핑 예시는 없다.

## 완료 조건

기본 exec와 누락 필드가 안전하게 처리되고, 검증되지 않은 유형은 OTHER로 보존된다. 동일 입력 형식을 전송기·화면이 별도로 해석하지 않는다. 오류·응답 검사는 공통 수동 확인표를 따른다.
