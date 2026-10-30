# 시연 정책

- `observe.yaml`: `hack-demo-observe`, 고정 보호파일 읽기에서 `Post`.
- `enforce.yaml`: `hack-demo-enforce`, 같은 조건에서 별도 probe에 `Sigkill`.
- `network.yaml`: `hack-demo-network`, 별도 net-probe/같은 namespace/loopback8080·18080의 `tcp_connect`를 `Post`로 관찰.

Tetragon v1.8.0 / Ubuntu ARM64 `6.8.0-142-generic`에서 실제 적용·관찰·종료·해제를 확인했다. [재현과 증거](../README.md), [필드 매핑](../field-mapping.md)을 함께 본다.

세 YAML은 `__HACK_DEMO_MNT_NS__`를 가진 **템플릿**이다. `runtime.py observe|enforce|network`가 현재 `hack-demo`의 mount namespace를 숫자로 치환한다. 파일 두 정책은 상호 교체하고 네트워크 정책은 독립 적용한다. `network-off`는 네트워크만, `off`는 자기 세 정책을 해제한다. 직접 add하거나 오래된 렌더링 파일을 재사용하지 않는다.

동일 selector의 binary·namespace·파일 경로·읽기 mask 조건은 AND다. 조건을 제거해 범위를 넓히지 않는다. `Sigkill`은 프로세스 종료 시연이며 읽기 완전 차단 보장이 아니다.

네트워크도 binary·namespace·목적지IP·포트가 AND다. 성공과 ECONNREFUSED에서 모두 실제 이벤트를 확인했으므로 연결 성공/전송량을 뜻하지 않는다. accept/IPv6/UDP/외부 IP 위치는 미검증이다. 기준은 `d960d3f` [5개 화면 계획](https://github.com/wnswp1122/2026_HACKATHON/blob/d960d3feeed6b1693be47e1a1e7cd48c0b911dac/docs/tetragon-screen-plan.md)이다.
