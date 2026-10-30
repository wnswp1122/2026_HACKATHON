#!/usr/bin/env python3
"""최근 24시간의 합성 sample 기록을 DB에 추가한다. live 데이터는 변경하지 않는다."""
import json
import math
import os
from pathlib import Path
import random
import sys
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from src.ingest.models import Envelope
from src.ingest.normalize import normalize
import psycopg
from psycopg.types.json import Jsonb
import sample_network


def main():
    database = os.environ['DATABASE_URL']
    output = Path(os.environ.get('DASHBOARD_LOCATIONS_FILE', ROOT / '.local/dashboard-locations.json'))
    config = json.loads(output.read_text()) if output.exists() else {'ips': {}, 'instances': {}}
    config['ips'].update(sample_network.locations())
    for ip, code, lat, lon in [
        ('192.0.2.10', 'JP', 35.6762, 139.6503), ('192.0.2.11', 'KR', 37.5665, 126.978),
        ('198.51.100.20', 'DE', 50.1109, 8.6821), ('203.0.113.30', 'US', 37.7749, -122.4194),
        ('198.51.100.21', 'SG', 1.3521, 103.8198), ('198.51.100.22', 'GB', 51.5074, -.1278),
        ('198.51.100.23', 'AU', -33.8688, 151.2093), ('198.51.100.24', 'BR', -23.5505, -46.6333),
        ('203.0.113.104', 'CN', 31.2304, 121.4737), ('203.0.113.105', 'CN', 23.1291, 113.2644),
        ('203.0.113.106', 'CN', 30.5728, 104.0668), ('203.0.113.107', 'RU', 43.1155, 131.8855),
        ('203.0.113.108', 'RU', 59.9343, 30.3351), ('203.0.113.109', 'KP', 41.7956, 129.7758),
    ]:
        config['ips'][ip] = dict(countryCode=code, latitude=lat, longitude=lon, source='configured')
    instances = ['integration-sample', 'sample-worker', 'sample-edge']
    for instance in instances:
        config['instances'][instance] = dict(countryCode='KR', latitude=37.5665, longitude=126.978, source='configured')
    safe_ips = [ip for ip in config['ips'] if not ip.startswith('203.0.113.10')]
    risk_ips = [f'203.0.113.{i}' for i in range(101, 110)]
    rng = random.Random(2026)
    end = datetime.now(timezone.utc) - timedelta(seconds=2)
    rows = []
    for minute in range(1440):
        incident = any(abs(minute - center) < width for center, width in [(380, 16), (890, 24), (1390, 12)])
        count = 4 + int(4 * (1 + math.sin(minute / 90))) + rng.randrange(4) + (20 if incident else 0)
        for index in range(count):
            at = end - timedelta(minutes=1439-minute, seconds=rng.uniform(0, 59))
            instance = rng.choices(instances, weights=[6, 3, 2])[0]
            risky = rng.random() < (.63 if incident else .035)
            proc = dict(exec_id=f'{instance}-history-{minute // 15}', pid=4100 + minute // 15,
                        uid=1000, binary='/usr/bin/curl' if risky else '/opt/board/venv/bin/python3')
            parent = dict(exec_id=f'{instance}-server', pid=4000, uid=1000, binary='/usr/bin/board-server')
            kind = rng.random()
            if kind < (.9 if risky else .62):
                ip = rng.choice(risk_ips) if risky else rng.choice(safe_ips)
                raw = {'process_kprobe': dict(process=proc, parent=parent, function_name='tcp_connect',
                    policy_name=sample_network.POLICY if risky else 'hack-demo-network', action='KPROBE_ACTION_POST',
                    args=[{'sock_arg': dict(family='AF_INET', type='SOCK_STREAM', protocol='IPPROTO_TCP',
                        saddr='192.0.2.1', sport=40000 + index, daddr=ip, dport=8443 if risky else 443)}])}
            elif kind < .9 or risky:
                raw = {'process_kprobe': dict(process=proc, parent=parent, function_name='security_file_permission',
                    policy_name='hack-demo-enforce' if risky else 'hack-demo-observe', action='KPROBE_ACTION_POST',
                    args=[{'file_arg': {'path': '/tmp/hack-demo/protected.txt' if risky else '/srv/board/data/board.sqlite3'}}, {'int_arg': 4}])}
            else:
                raw = {rng.choice(['process_exec', 'process_exit']): dict(process=proc, parent=parent)}
            raw.update(time=(at - timedelta(milliseconds=80)).isoformat(), node_name='sample-seoul')
            envelope = Envelope(schemaVersion='1', messageId=str(uuid4()), instanceId=instance, source='sample', rawEvent=raw)
            event_id = uuid4()
            normalized = normalize(envelope, str(event_id), at, frozenset(['hack-demo-enforce', sample_network.POLICY]))
            rows.append((event_id, instance, UUID(envelope.messageId), '1', 'sample', at, Jsonb(raw), Jsonb(normalized)))
    with psycopg.connect(database) as connection:
        for instance in instances:
            connection.execute('INSERT INTO instances VALUES (%s, %s) ON CONFLICT (instance_id) DO UPDATE SET last_received_at=GREATEST(instances.last_received_at, EXCLUDED.last_received_at)', (instance, end))
        # 이전 단계에서 이번 작업이 추가한 6건만 새 sample 매핑으로 바로잡는다.
        for row in connection.execute("SELECT event_id, instance_id, message_id, received_at, raw_event FROM events WHERE source='sample' AND normalized->>'policyName'=%s AND normalized->>'eventType'='OTHER'", (sample_network.POLICY,)).fetchall():
            event_id, instance, message_id, received, raw = row
            envelope = Envelope(schemaVersion='1', messageId=str(message_id), instanceId=instance, source='sample', rawEvent=raw)
            normalized = normalize(envelope, str(event_id), received, frozenset([sample_network.POLICY]))
            connection.execute('UPDATE events SET normalized=%s WHERE event_id=%s AND source=\'sample\'', (Jsonb(normalized), event_id))
        with connection.cursor() as cursor:
            cursor.executemany('INSERT INTO events (event_id,instance_id,message_id,schema_version,source,received_at,raw_event,normalized) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)', rows)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(config, indent=2))
    print(json.dumps({'events': len(rows), 'risk': sum(row[-1].obj['status']=='attention' for row in rows), 'from': min(row[5] for row in rows).isoformat(), 'to': end.isoformat(), 'instances': instances}, ensure_ascii=False))


if __name__ == '__main__':
    main()
