#!/usr/bin/env python3
"""Sample events -> real SaaS APIs -> presentation dashboard. No kernel probes."""
import sample_network
import argparse
import json
import os
from pathlib import Path
import secrets
import shlex
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import webbrowser
from datetime import datetime, timedelta, timezone

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.local' / 'presentation'


def now():
    return datetime.now(timezone.utc).isoformat()


def request(base, path, token='', payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(base + path, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f'{path.split("?")[0]}: HTTP {exc.code} {exc.read(1024).decode()}') from None


def stages(run):
    parent = {'exec_id': run + '-server', 'pid': 4100, 'uid': 1000, 'binary': '/usr/bin/board-server'}
    child = {'exec_id': run + '-worker', 'pid': 4101, 'uid': 1000, 'binary': '/usr/bin/python3'}
    yield '게시판 서버 프로세스 실행', {'process_exec': {'process': parent}}
    yield '자식 프로세스 실행', {'process_exec': {'process': child, 'parent': parent}}
    probe = {'process': child, 'parent': parent, 'function_name': 'security_file_permission',
             'args': [{'file_arg': {'path': '/tmp/hack-demo/protected.txt'}}, {'int_arg': 4}]}
    yield '보호 파일 읽기 관찰', {'process_kprobe': {**probe, 'policy_name': 'hack-demo-observe', 'action': 'KPROBE_ACTION_POST'}}
    for ip, city in [('192.0.2.10', '도쿄'), ('198.51.100.20', '프랑크푸르트'), ('203.0.113.30', '샌프란시스코')]:
        yield f'서울 → {city} 연결 관찰 (가상 좌표)', {'process_kprobe': {
            'process': child, 'parent': parent, 'function_name': 'tcp_connect',
            'policy_name': 'hack-demo-network', 'action': 'KPROBE_ACTION_POST',
            'args': [{'sock_arg': {'family': 'AF_INET', 'type': 'SOCK_STREAM', 'protocol': 'IPPROTO_TCP',
                                   'saddr': '192.0.2.1', 'sport': 43000, 'daddr': ip, 'dport': 443}}]}}
    yield from sample_network.stages(child, parent)
    yield '정책 일치·SIGKILL 동작 기록 (성공 판정 아님)', {'process_kprobe': {
        **probe, 'policy_name': 'hack-demo-enforce', 'action': 'KPROBE_ACTION_SIGKILL'}}
    yield '자식 프로세스 종료', {'process_exit': {'process': child, 'parent': parent, 'signal': 'SIGKILL'}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--interval', type=float, default=3, help='단계 간격(초)')
    parser.add_argument('--scenario', choices=['short', 'service'], default='short', help='14건 시연 / 게시판 운영 sample')
    parser.add_argument('--cycles', type=int, default=200, help='service 운영 주기 수 (기본 200)')
    parser.add_argument('--api-port', type=int, default=None)
    parser.add_argument('--web-port', type=int, default=None)
    parser.add_argument('--no-open', action='store_true')
    parser.add_argument('--exit-after', action='store_true', help='주입 검증 후 서버 종료')
    args = parser.parse_args()
    if not 0 <= args.interval <= 60:
        parser.error('interval은 0~60초입니다.')
    if not 1 <= args.cycles <= 1000:
        parser.error('cycles는 1~1000입니다.')
    expected = {'total': 14, 'network': 9, 'attention': 7}
    config_file = LOCAL / 'config.json'
    config = json.loads(config_file.read_text()) if config_file.exists() else {}
    # Only read the two AI settings; never execute a shell configuration file.
    ai_config = {}
    ai_file = ROOT / 'backend/.local/core.env'
    if ai_file.exists():
        for line in ai_file.read_text().splitlines():
            key, separator, value = line.removeprefix('export ').partition('=')
            if separator and key.strip() in ('GEMINI_API_KEY', 'GEMINI_MODEL'):
                parts = shlex.split(value, comments=True)
                if len(parts) == 1:
                    ai_config[key.strip()] = parts[0]
    ai_config.update({key: os.environ[key] for key in ('GEMINI_API_KEY', 'GEMINI_MODEL') if os.environ.get(key)})
    database = os.environ.get('DATABASE_URL') or config.get('databaseUrl')
    if not database:
        raise RuntimeError('DATABASE_URL을 설정하세요. scripts/presentation.env.example 참조')
    python = ROOT / 'backend/.venv/bin/python'
    vite = ROOT / 'frontend/node_modules/vite/bin/vite.js'
    if not python.exists() or not vite.exists():
        raise RuntimeError('backend/.venv와 frontend/node_modules를 먼저 준비하세요. docs/presentation.md 참조')
    def free_port(requested, preferred):
        for port in ([requested] if requested is not None else range(preferred, preferred + 20)):
            try:
                with socket.socket() as sock:
                    sock.bind(('127.0.0.1', port))
                return port
            except OSError:
                if requested is not None:
                    raise RuntimeError(f'{port} 포트가 사용 중입니다. 다른 포트를 지정하세요.') from None
        raise RuntimeError('발표용 빈 포트를 찾지 못했습니다.')
    args.api_port = free_port(args.api_port, 18020)
    args.web_port = free_port(args.web_port, 5180)
    run = 'presentation-' + uuid.uuid4().hex[:12]
    directory = LOCAL / run
    directory.mkdir(parents=True)
    token = secrets.token_urlsafe(32)
    location = lambda lat, lon, country: dict(latitude=lat, longitude=lon, countryCode=country, source='configured')
    locations = {'instances': {run: location(37.5665, 126.978, 'KR')}, 'ips': {
        '192.0.2.10': location(35.6762, 139.6503, 'JP'),
        '198.51.100.20': location(50.1109, 8.6821, 'DE'),
        '203.0.113.30': location(37.7749, -122.4194, 'US')}}
    if args.scenario == 'service':
        import service_scenario
        locations = service_scenario.locations(run)
        events = list(service_scenario.stages(run, args.cycles))
        expected = service_scenario.expected(args.cycles)
    else:
        events = list(stages(run))
    locations['ips'].update(sample_network.locations())
    (directory / 'locations.json').write_text(json.dumps(locations, indent=2))
    env = {**os.environ, **ai_config, 'DATABASE_URL': database, 'INGEST_TOKEN': token, 'INSTANCE_IDS': run,
           'ATTENTION_POLICY_NAMES': 'hack-demo-enforce,' + sample_network.POLICY, 'DASHBOARD_LOCATIONS_FILE': str(directory / 'locations.json'),
           'VITE_API_PROXY_TARGET': f'http://127.0.0.1:{args.api_port}', 'VITE_PRESENTATION_INSTANCE': run}
    base = env['VITE_API_PROXY_TARGET']
    url = f'http://127.0.0.1:{args.web_port}/overview'
    children, logs = [], []
    start = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    def launch(command, cwd, name):
        log = (directory / (name + '.log')).open('w')
        logs.append(log)
        proc = subprocess.Popen(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT)
        children.append(proc)
        return proc
    def ready(address, proc, health=False):
        for _ in range(100):
            if proc.poll() is not None:
                raise RuntimeError(f'서버 시작 실패: {directory} 로그 확인')
            try:
                with urllib.request.urlopen(address, timeout=1) as response:
                    if health:
                        body = json.load(response)
                        if body.get('database') != 'ok' or body.get('missingModules'):
                            raise RuntimeError('SaaS 준비 상태가 올바르지 않습니다.')
                    return
            except (urllib.error.URLError, TimeoutError):
                time.sleep(.2)
        raise RuntimeError(f'서버 준비 시간 초과: {directory}')
    def status():
        report = {'schemaVersion': '1', 'messageId': str(uuid.uuid4()), 'instanceId': run, 'source': 'sample',
                  'observedAt': now(), 'collector': {'state': 'ok', 'errorCode': None},
                  'tetragon': {'reachable': True, 'version': '1.8.0 (sample)',
                              'sensors': [{'name': 'presentation-sensor', 'state': 'enabled', 'error': None}],
                              'policies': [{'name': name, 'state': 'enabled', 'error': None}
                                           for name in ['hack-demo-observe', 'hack-demo-network', 'hack-demo-enforce']]}}
        request(base, '/api/sensor-status', token, report)
    def stop_signal(*_):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, stop_signal)
    try:
        api = launch([str(python), '-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', str(args.api_port)], ROOT / 'backend', 'backend')
        ready(base + '/health', api, True)
        # 스키마 생성/마이그레이션은 하지 않는다. 기존 SaaS DB를 먼저 검증한다.
        request(base, '/api/instances')
        web = launch(['node', str(vite), '--host', '127.0.0.1', '--port', str(args.web_port), '--strictPort'], ROOT / 'frontend', 'frontend')
        ready(url, web)
        print(f'발표 화면: {url}\n서버: {run}\n모든 이벤트·상태·좌표는 발표용 sample입니다.', flush=True)
        status()
        if not args.no_open:
            webbrowser.open(url)
        receipts = []
        for index, (label, raw) in enumerate(events, 1):
            time.sleep(args.interval)
            raw.update(time=now(), node_name='presentation-seoul')
            envelope = {'schemaVersion': '1', 'messageId': str(uuid.uuid4()), 'instanceId': run, 'source': 'sample', 'rawEvent': raw}
            receipt = request(base, '/api/events', token, envelope)
            receipts.append({'step': label, 'receipt': receipt})
            if index % 100 == 0:
                status()
            print(f'[{index}/{len(events)}] {label} → SaaS 저장 완료', flush=True)
        query = urllib.parse.urlencode({'from': start, 'to': now(), 'source': 'sample', 'instanceId': run})
        dashboard = request(base, '/api/dashboard?' + query)
        network = request(base, '/api/network?' + query)
        if dashboard['total'] != expected['total'] or dashboard['attention'] != expected['attention'] or network['totalNetworkEvents'] != expected['network'] or network['unmappedCount'] != 0:
            raise RuntimeError(f'집계 결과가 기대값 {expected}와 다릅니다.')
        if not all(item['location'] and item['serverLocation'] for item in network['items']):
            raise RuntimeError('지구본 좌표 누락')
        (directory / 'result.json').write_text(json.dumps({'instanceId': run, 'url': url, 'receipts': receipts,
                                                         'dashboard': dashboard, 'network': network}, ensure_ascii=False, indent=2))
        (LOCAL / 'latest.json').write_text(json.dumps({'instanceId': run, 'url': url, 'directory': str(directory)}))
        print(f"완료: 이벤트 {expected['total']}건 · 정책 일치 {expected['attention']}건 · 네트워크 {expected['network']}건. 화면은 2초 간격으로 갱신됩니다.\n종료: Ctrl+C (이번 실행의 서버만 종료, 저장 데이터 유지)", flush=True)
        if all(ai_config.get(key) for key in ('GEMINI_API_KEY', 'GEMINI_MODEL')):
            print('[9] AI 분석: 화면의 AI 분석 → 스냅샷 생성 · AI 분석을 누르세요. 고정 데이터와 PNG를 실제 AI에 전송합니다.', flush=True)
            if not args.no_open and not args.exit_after:
                webbrowser.open(url + '?analysis=open')
        else:
            print('[9] AI 분석 미설정: backend/.local/core.env에 GEMINI_API_KEY와 GEMINI_MODEL을 설정하고 재실행하세요.', flush=True)
        if not args.exit_after:
            while True:
                time.sleep(30)
                if any(child.poll() is not None for child in children):
                    raise RuntimeError('발표 서버가 종료되었습니다. 로그를 확인하세요.')
                status()  # 실행 중에만 sample 상태를 갱신한다.
    finally:
        for child in reversed(children):
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
        for log in logs:
            log.close()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n발표 서버를 종료했습니다.')
    except Exception as exc:
        print(f'실패: {exc}', file=sys.stderr)
        sys.exit(1)
