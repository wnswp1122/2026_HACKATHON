#!/usr/bin/env python3
"""기존 sample 이벤트 순서를 유지해 최근 24시간에 분산한다. live·고정 조사 기록은 보존한다."""
import argparse
import json
import os
from pathlib import Path
import random
from datetime import datetime, timedelta, timezone

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--events-per-second', type=int, help='서버별 sample 환산 규모. 원본 100건 이상인 서버에 적용')
    args = parser.parse_args()
    if args.events_per_second is not None and not 1 <= args.events_per_second <= 10000:
        parser.error('events-per-second는 1~10000입니다.')
    config = ROOT / '.local/presentation/config.json'
    database = os.environ.get('DATABASE_URL') or json.loads(config.read_text())['databaseUrl']
    end = datetime.now(timezone.utc) - timedelta(seconds=2)
    start = end - timedelta(hours=24)
    backup = ROOT / '.local/sample-history' / (end.strftime('%Y%m%dT%H%M%S%fZ') + '.json')
    rng = random.Random(2026)
    counts, represented = {}, {}
    with psycopg.connect(database, row_factory=dict_row) as connection:
        connection.execute("SET LOCAL lock_timeout = '5s'")
        live_before = connection.execute("SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY event_id)::text, '[]')) AS hash FROM events e WHERE source='live'").fetchone()['hash']
        rows = connection.execute("SELECT event_id, instance_id, received_at, raw_event, normalized FROM events WHERE source='sample' ORDER BY instance_id, received_at, event_id FOR UPDATE").fetchall()
        # 성공적으로 백업을 저장한 다음에만 DB를 변경한다.
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_text(json.dumps(rows, default=str, ensure_ascii=False))
        grouped = {}
        for row in rows:
            grouped.setdefault(row['instance_id'], []).append(row)
        updates = []
        for instance, events in grouped.items():
            slot = timedelta(hours=24) / len(events)
            target = max(len(events), args.events_per_second * 86400) if args.events_per_second and len(events) >= 100 else len(events)
            for index, event in enumerate(events):
                # 각 구간 안에서만 흔들어 발생 순서를 보존하고 한 시점 몰림을 방지한다.
                received = start + slot * (index + rng.uniform(.2, .8))
                occurred = received - timedelta(milliseconds=80)
                raw, normalized = event['raw_event'], event['normalized']
                normalized['receivedAt'] = received.isoformat()
                normalized['sampleWeight'] = ((index + 1) * target // len(events)) - (index * target // len(events))
                if normalized.get('occurredAt') is not None:
                    normalized['occurredAt'] = occurred.isoformat()
                    raw['time'] = occurred.isoformat()
                updates.append((received, Jsonb(raw), Jsonb(normalized), event['event_id']))
            counts[instance] = len(events)
            represented[instance] = target
        with connection.cursor() as cursor:
            cursor.executemany("UPDATE events SET received_at=%s, raw_event=%s, normalized=%s WHERE event_id=%s AND source='sample'", updates)
        connection.execute("UPDATE instances i SET last_received_at=(SELECT max(received_at) FROM events e WHERE e.instance_id=i.instance_id) WHERE i.instance_id=ANY(%s)", (list(grouped),))
        live_after = connection.execute("SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY event_id)::text, '[]')) AS hash FROM events e WHERE source='live'").fetchone()['hash']
        if live_before != live_after:
            raise RuntimeError('live 데이터 변경 감지: rollback')
    print(json.dumps({'events': sum(counts.values()), 'instances': counts, 'from': start.isoformat(), 'to': end.isoformat(), 'backup': str(backup), 'liveUnchanged': True, 'representedEvents': represented}, ensure_ascii=False))


if __name__ == '__main__':
    main()
