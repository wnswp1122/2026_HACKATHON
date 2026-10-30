"""문서용 IP에 연결한 가상 위험 목적지. 실제 국가별 IP 평판 정보가 아니다."""
DESTINATIONS = [
    ('203.0.113.101', 'KP', 39.0392, 125.7625, 1),
    ('203.0.113.102', 'CN', 39.9042, 116.4074, 3),
    ('203.0.113.103', 'RU', 55.7558, 37.6173, 2),
]
POLICY = 'sample-risk-network'


def locations():
    return {ip: dict(countryCode=country, latitude=lat, longitude=lon, source='configured')
            for ip, country, lat, lon, _ in DESTINATIONS}


def stages(proc, parent):
    for ip, country, _, _, count in DESTINATIONS:
        for index in range(count):
            yield f'{country} 가상 위험 목적지 연결 {index + 1}', {'process_kprobe': {
                'process': proc, 'parent': parent, 'function_name': 'tcp_connect',
                'policy_name': POLICY, 'action': 'KPROBE_ACTION_POST',
                'args': [{'sock_arg': {'family': 'AF_INET', 'type': 'SOCK_STREAM',
                    'protocol': 'IPPROTO_TCP', 'saddr': '192.0.2.1', 'sport': 45000 + index,
                    'daddr': ip, 'dport': 8443}}]}}
