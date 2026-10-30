"""게시판 운영을 가정한 커널 관찰 sample. 실제 요청·공격·파일 읽기는 실행하지 않는다."""

import sample_network

def locations(instance):
    def at(lat, lon, country):
        return dict(latitude=lat, longitude=lon, countryCode=country, source='configured')
    return {'instances': {instance: at(37.5665, 126.978, 'KR')}, 'ips': {
        '192.0.2.11': at(37.5665, 126.978, 'KR'),  # 내부 검색 색인
        '192.0.2.12': at(37.5665, 126.978, 'KR'),  # 내부 작업 큐
        '192.0.2.10': at(35.6762, 139.6503, 'JP'),  # 첨부파일 저장소
        '198.51.100.20': at(50.1109, 8.6821, 'DE'),  # 알림 제공자
        '203.0.113.30': at(37.7749, -122.4194, 'US'),  # 백업 저장소
        **sample_network.locations(),
        '203.0.113.90': at(1.3521, 103.8198, 'SG'),  # 예상 밖의 목적지
    }}


def stages(run, cycles):
    def process(name, pid, binary):
        return dict(exec_id=f'{run}-{name}', pid=pid, uid=1000, binary=binary)

    def execution(proc, parent):
        return {'process_exec': {'process': proc, 'parent': parent}}

    def exit_event(proc, parent, killed=False):
        event = {'process': proc, 'parent': parent, 'status': 0}
        if killed:
            event.update(status=9, signal='SIGKILL')
        return {'process_exit': event}

    def read(proc, parent, path, enforce=False):
        return {'process_kprobe': {
            'process': proc, 'parent': parent, 'function_name': 'security_file_permission',
            'policy_name': 'hack-demo-enforce' if enforce else 'hack-demo-observe',
            'action': 'KPROBE_ACTION_SIGKILL' if enforce else 'KPROBE_ACTION_POST',
            'args': [{'file_arg': {'path': path}}, {'int_arg': 4}]}}

    def connect(proc, parent, ip, port, sequence):
        return {'process_kprobe': {
            'process': proc, 'parent': parent, 'function_name': 'tcp_connect',
            'policy_name': 'hack-demo-network', 'action': 'KPROBE_ACTION_POST',
            'args': [{'sock_arg': {'family': 'AF_INET', 'type': 'SOCK_STREAM',
                                  'protocol': 'IPPROTO_TCP', 'saddr': '192.0.2.1',
                                  'sport': 40000 + sequence % 100,
                                  'daddr': ip, 'dport': port}}]}}

    init = process('init', 1, '/sbin/init')
    api = process('board-api', 4100, '/opt/board/venv/bin/python3')
    worker = process('jobs', 4200, '/opt/board/venv/bin/celery')
    yield '게시판 API 실행', execution(api, init)
    yield '비동기 작업 워커 실행', execution(worker, init)
    for cycle in range(1, cycles + 1):
        prefix = f'운영 주기 {cycle}'
        # HTTP 요청이나 SQL 결과 자체가 아니라 그 과정의 파일·소켓 관찰이다.
        yield f'{prefix}: 게시판 SQLite 파일 읽기 관찰', read(api, init, '/srv/board/data/board.sqlite3')
        yield f'{prefix}: 게시글 검색 색인 연결', connect(api, init, '192.0.2.11', 9200, cycle * 10)
        yield f'{prefix}: 게시글 후속 작업 큐 연결', connect(api, init, '192.0.2.12', 6379, cycle * 10 + 1)
        yield f'{prefix}: 첨부파일 읽기 관찰', read(worker, init, f'/srv/board/uploads/post-{cycle:04d}.jpg')
        yield f'{prefix}: 첨부파일 저장소 TLS 연결', connect(worker, init, '192.0.2.10', 443, cycle * 10 + 2)
        yield f'{prefix}: 알림 제공자 TLS 연결', connect(worker, init, '198.51.100.20', 443, cycle * 10 + 3)
        if cycle % 5 == 0:
            backup = process(f'backup-{cycle}', 5000 + cycle, '/usr/bin/sqlite3')
            yield f'{prefix}: 예약 백업 실행', execution(backup, worker)
            yield f'{prefix}: 백업 원본 읽기 관찰', read(backup, worker, '/srv/board/data/board.sqlite3')
            yield f'{prefix}: 백업 프로세스 종료', exit_event(backup, worker)
            yield f'{prefix}: 백업 저장소 TLS 연결', connect(worker, init, '203.0.113.30', 443, cycle * 10 + 4)
        if cycle % 20 == 0:
            shell = process(f'unexpected-shell-{cycle}', 6000 + cycle, '/bin/sh')
            transfer = process(f'unexpected-curl-{cycle}', 7000 + cycle, '/usr/bin/curl')
            yield f'{prefix}: API 하위의 예상 밖 셸 실행', execution(shell, api)
            yield f'{prefix}: 셸의 서비스 환경 파일 읽기 관찰', read(shell, api, '/srv/board/.env')
            yield f'{prefix}: 셸 하위 전송 도구 실행', execution(transfer, shell)
            yield f'{prefix}: 전송 도구의 예상 밖 외부 연결 관찰', connect(transfer, shell, '203.0.113.90', 8443, cycle * 10 + 5)
            yield from sample_network.stages(transfer, shell)
            yield f'{prefix}: 전송 도구 종료 (전송 성공 미확인)', exit_event(transfer, shell)
            yield f'{prefix}: 보호 파일 정책 일치·SIGKILL 보고', read(shell, api, '/tmp/hack-demo/protected.txt', enforce=True)
            yield f'{prefix}: 셸 SIGKILL 종료 sample', exit_event(shell, api, killed=True)
    yield '작업 워커 정상 종료', exit_event(worker, init)
    yield '게시판 API 정상 종료', exit_event(api, init)


def expected(cycles):
    return {'total': 4 + cycles * 6 + (cycles // 5) * 4 + (cycles // 20) * 13,
            'network': cycles * 4 + cycles // 5 + (cycles // 20) * 7,
            'attention': (cycles // 20) * 7}
