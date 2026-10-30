# 사용자 담당 컴포넌트 개발 지침

이 문서는 Orca의 게시판·Tetragon·전송기 작업에 공통으로 전달한다. SaaS와 프론트는 [별도 Orca 작업](saas-parallel-development.md)으로 개발하므로 이 세 작업에서 수정하지 않는다.

## 작업 시작 전

AGENTS.md, [개발 가이드](development-guide.md), [데이터 계약](api-contract.md), [개발 환경](local-development.md), 담당 README를 읽는다. 이미 준비된 FastAPI/SQLite와 HTTPX 설정 검증 기반을 이어서 기능 코드는 각 워크트리에서 구현하며 같은 문서·환경 기준 커밋에서 분기한다.

| 작업 | 소유 범위 | 연결점 |
|---|---|---|
| 게시판 | demo/ | FastAPI CRUD·SQLite 볼륨, 내부 8080/호스트 8081 |
| Tetragon | tetragon/ | 전용 Linux VM, 보호 파일 probe, JSONL export, 정책별 실측 매핑 |
| 전송기 | event-forwarder/ | JSONL → 인증 HTTP 봉투, sample/live, 재시도/중복 응답 |

공통 docs/·루트 설정·backend/·frontend/는 수정하지 않는다. 계약이나 공통 환경 변경이 필요하면 필요한 변경을 결과에 남긴다. 폴더 내부 requirements/예시 설정/실행 안내는 담당이 관리한다.

## 연결 지점

- 통합/정책 시연 컨테이너 이름 hack-demo, 내부 HTTP 8080. DB는 /data/board.sqlite3 볼륨에 보관한다. 병렬 개발 중 게시판 담당은 hack-board-dev와 별도 포트/볼륨으로 검증하고, Tetragon 담당만 hack-demo를 관리한다.
- Tetragon의 probe는 tetragon/ 소유다. 게시판 컨테이너에 read-only mount 또는 docker exec로 배치하며 demo/ 파일을 수정하지 않는다.
- 보호 파일은 /tmp/hack-demo/protected.txt, 내용 demo-only. probe는 이 고정 경로만 읽는다. HTTP 임의 명령 실행 API는 만들지 않는다.
- Tetragon JSONL은 Linux VM의 ~/2026-hack-runtime/tetragon/events.jsonl에 둔다. 전송기는 TETRAGON_LOG_PATH 설정으로 읽는다. 진단 로그와 혼합하지 않는다.
- SaaS가 준비되지 않으면 전송기 검증용 임시 HTTP 수신기를 사용한다. 제품 SaaS 구현이나 실제 SaaS 연결 성공으로 보고하지 않는다.
- Tetragon 실제 원본이 준비되지 않으면 sample로 전송기 개발을 진행한다. sample 확인을 실제 관찰·대응 증거로 바꾸지 않는다.

## 완료·전달

프로젝트는 CI/자동 테스트 추가를 기본 요구하지 않는다. 기동·성공·실패·재시작·정리 동작을 직접 확인하고 해당 README/기능 PR에 결과를 남긴다. 실행 환경이 없으면 무엇이 막혔는지 구체적으로 기록한다. 검증되지 않은 정책을 완료된 대응으로 표시하지 않는다.

이 지침을 사용하는 기존 세 작업의 범위는 클라이언트 세 컴포넌트다. 사용자 요청으로 추가된 SaaS·프론트 작업은 별도 지침을 따른다. 공통 문서·환경 푸시는 이 작업에서 수행하며, 기능별 작업은 로컬 검증·커밋 후 결과를 전달한다. 사용자가 별도 요청하기 전 자동 머지하지 않는다.
