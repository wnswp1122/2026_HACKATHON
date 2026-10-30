# 시연 정책

- `observe.yaml`: `hack-demo-observe`, 고정 보호파일 읽기에서 `Post`.
- `enforce.yaml`: `hack-demo-enforce`, 같은 조건에서 별도 probe에 `Sigkill`.

Tetragon v1.8.0 / Ubuntu ARM64 `6.8.0-142-generic`에서 실제 적용·관찰·종료·해제를 확인했다. [재현과 증거](../README.md), [필드 매핑](../field-mapping.md)을 함께 본다.

두 YAML은 `__HACK_DEMO_MNT_NS__`를 가진 **템플릿**이다. `runtime.py observe|enforce`가 현재 `hack-demo`의 mount namespace를 숫자로 치환하고 기존 자기 정책을 해제한 뒤 적용한다. 직접 add하거나 오래된 렌더링 파일을 재사용하지 않는다.

동일 selector의 binary·namespace·파일 경로·읽기 mask 조건은 AND다. 조건을 제거해 범위를 넓히지 않는다. `Sigkill`은 프로세스 종료 시연이며 읽기 완전 차단 보장이 아니다.
