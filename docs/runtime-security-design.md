# 런타임 보안 모니터링 책임과 흐름

```text
Linux VM: 게시판 API + SQLite
               ↓ 커널 활동
          Tetragon + eBPF ── 사람이 적용한 정책에 따른 대응
               ↓ 원본 JSONL
             전송기
               ↓ 인증 HTTP /api/events
SaaS: 수신 → 정규화·경고 분류 → PostgreSQL → 조회·집계
                                               ↓
프론트: 대시보드 → 기간 선택 → 고정 스냅샷 표시·캡처
                                               ↓
SaaS: 같은 스냅샷의 데이터 + 이미지 → AI → 결과 저장
```

사용자가 클라이언트·SaaS·프론트를 모두 개발하며 [병렬 개발 기준](saas-parallel-development.md)에 따라 Orca 작업을 나눈다. [데이터 계약](api-contract.md)이 연결의 단일 기준이다.

Tetragon 대응은 미리 적용한 정책을 따르며 SaaS나 AI의 응답을 기다리지 않는다. 기본 시연은 보호 파일 접근을 수행한 별도 probe 프로세스 종료다. 프로세스 종료가 읽기 자체의 완전 차단을 뜻하지 않는다.

SaaS만 원본을 정규화한다. attention은 정책 기반 확인 필요 상태, reportedAction은 원본에 보고된 동작, outcome=unknown은 실제 결과 미확인이다. sample/live를 모든 화면과 분석에서 구분한다.

대시보드는 receivedAt 기준 범위 전체를 집계한다. AI 요청 시 데이터를 고정해 표시·캡처하므로 새 이벤트가 들어와도 분석 데이터와 화면이 달라지지 않게 한다. 원본·인자·비밀값은 AI와 캡처에서 제외한다.

최종 증거는 sample 수신, 실제 관찰, 정책 전후 결과, 실제 SaaS 연결, 실제 AI 호출을 각각 분리한다. [수동 확인](manual-verification.md)을 따른다.
