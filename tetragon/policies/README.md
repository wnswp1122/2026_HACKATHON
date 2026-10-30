# 시연용 정책 파일

아직 YAML은 없다. [Tetragon 작업 안내](../README.md)에 따라 환경에서 검증한 후 다음 두 파일을 작성한다.

- `observe.yaml`: 시연용 파일 접근 관찰. 제안 정책명 hack-demo-observe.
- `enforce.yaml`: 같은 시연 대상에 대한 프로세스 종료 대응. 제안 정책명 hack-demo-enforce.

파일에는 정책의 목적, 적용 대상, 검증한 Tetragon·커널 버전과 관찰 지점을 주석으로 적는다. 둘을 중복 적용하지 않고 README의 적용·해제 절차를 따른다. 미검증 YAML을 완료된 보호 정책으로 제공하지 않는다. 정확한 지원 훅과 인자는 환경 담당자가 확인한다.
