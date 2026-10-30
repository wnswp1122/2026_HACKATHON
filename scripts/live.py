#!/usr/bin/env python3
"""Run event and sensor-status forwarding together on a prepared Linux server."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone

KEYS = {'EVENTS_URL', 'STATUS_URL', 'INSTANCE_ID', 'INGEST_TOKEN',
        'TETRAGON_LOG_PATH', 'STATUS_PATH', 'FORWARDER_DIR', 'FORWARDER_PYTHON',
        'SPOOL_DIR'}


def configuration(path):
    path = path.expanduser()
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise RuntimeError('설정 파일은 현재 사용자 소유의 일반 파일이며 권한 600이어야 합니다.')
    values = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        key, sep, value = line.partition('=')
        if not sep or key not in KEYS or key in values:
            raise RuntimeError('설정 파일의 항목 또는 중복 키를 확인하세요.')
        values[key] = value.strip()
    required = KEYS - {'SPOOL_DIR'}
    if any(not values.get(key) for key in required):
        raise RuntimeError('live.env.example의 필수 항목을 모두 설정하세요.')
    for key in ('TETRAGON_LOG_PATH', 'STATUS_PATH', 'FORWARDER_DIR', 'FORWARDER_PYTHON'):
        if not Path(values[key]).is_absolute():
            raise RuntimeError(key + '에는 Linux 절대 경로가 필요합니다.')
    if values.get('SPOOL_DIR') and not Path(values['SPOOL_DIR']).is_absolute():
        raise RuntimeError('SPOOL_DIR에는 Linux 절대 경로가 필요합니다.')
    return values


def preflight(values):
    directory = Path(values['FORWARDER_DIR'])
    if not (directory / 'main.py').is_file():
        raise RuntimeError('FORWARDER_DIR에 전송기 소스가 없습니다.')
    env = {**os.environ, **values}
    # Existing forwarder validates URL, token and instance settings without printing secrets.
    check = subprocess.run([values['FORWARDER_PYTHON'], str(directory / 'main.py'), '--check-config'],
                           env=env, capture_output=True, timeout=15)
    if check.returncode:
        raise RuntimeError('전송기 설정/의존성 확인 실패. URL·토큰·Python 환경을 확인하세요.')
    with Path(values['TETRAGON_LOG_PATH']).open('rb'):
        pass
    payload = json.loads(Path(values['STATUS_PATH']).read_text())
    observed = datetime.fromisoformat(payload['observedAt'].replace('Z', '+00:00'))
    age = (datetime.now(timezone.utc) - observed).total_seconds()
    if not -30 <= age <= 90:
        raise RuntimeError('센서 상태 파일이 오래됐거나 미래 시각입니다. 상태 수집기를 확인하세요.')
    if payload.get('tetragon', {}).get('reachable') is not True:
        raise RuntimeError('Tetragon 도달 상태가 확인되지 않았습니다.')
    print('준비 확인: 전송기 설정·입력 파일·최근 센서 보고. HTTP 인증/수신 성공은 실행 후 확인합니다.', flush=True)
    return env


def run_local(args):
    if sys.platform != 'linux':
        raise RuntimeError('--local은 Linux에서 실행하세요.')
    values = configuration(Path(args.config))
    env = preflight(values)
    if args.action == 'check':
        return 0
    # Lock identity follows the input, even when different config files are used.
    lock_path = Path(values['TETRAGON_LOG_PATH']).resolve().with_suffix('.live-forwarding.lock')
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    children = []
    with os.fdopen(fd, 'w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('같은 입력의 live 실행기가 이미 실행 중입니다.') from None
        command = [values['FORWARDER_PYTHON'], str(Path(values['FORWARDER_DIR']) / 'main.py')]
        event_args = ['--follow']
        if values.get('SPOOL_DIR'):
            event_args += ['--spool-dir', values['SPOOL_DIR']]
        def interrupted(signum, frame):
            raise KeyboardInterrupt
        signal.signal(signal.SIGTERM, interrupted)
        signal.signal(signal.SIGHUP, interrupted)
        try:
            for extra in (event_args, ['--status-follow', values['STATUS_PATH']]):
                children.append(subprocess.Popen(command + extra, env=env, start_new_session=True))
            print('live 전송 실행 중. Ctrl+C로 이 실행기가 시작한 전송기만 종료합니다.', flush=True)
            while all(child.poll() is None for child in children):
                time.sleep(0.25)
            raise RuntimeError('전송기 하나가 종료돼 함께 종료합니다. 위 진단과 설정을 확인한 뒤 재실행하세요.')
        finally:
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            signal.signal(signal.SIGINT, signal.SIG_IGN)
            for child in children:
                if child.poll() is None:
                    child.send_signal(signal.SIGINT)
            for child in children:
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['check', 'run'])
    parser.add_argument('--config', required=True, help='실행할 Linux 호스트 안의 mode600 설정 파일')
    parser.add_argument('--local', action='store_true')
    parser.add_argument('--vm', default='2026-hack-client')
    parser.add_argument('--run-id', help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.local:
        return run_local(args)
    run_id = str(uuid.uuid4())
    command = ['limactl', 'shell', args.vm, '--', 'python3', '-', args.action,
               '--local', '--config', args.config, '--run-id', run_id]
    try:
        return subprocess.run(command, input=Path(__file__).read_text(), text=True).returncode
    except KeyboardInterrupt:
        # SSH does not reliably forward Ctrl+C when the program arrives through stdin.
        # Identify only this invocation, never a saved PID that could have been reused.
        cleanup = """import os, signal
from pathlib import Path
for p in Path('/proc').iterdir():
    try:
        args = (p/'cmdline').read_bytes().split(b'\\0')
        if p.stat().st_uid == os.getuid() and b'--run-id' in args and TOKEN in args:
            os.kill(int(p.name), signal.SIGTERM)
    except (OSError, ValueError): pass
""".replace('TOKEN', repr(run_id.encode()))
        try:
            subprocess.run(['limactl', 'shell', args.vm, '--', 'python3', '-'],
                           input=cleanup, text=True, timeout=15, check=True)
        except (OSError, subprocess.SubprocessError):
            print('원격 종료 확인 실패. Linux에서 해당 live 실행기를 확인하세요.', file=sys.stderr)
        return 130



if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
    except (RuntimeError, OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        # Config values, raw sensor JSON and exception text may contain secrets.
        message = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        print('live 실행 실패: ' + message, file=sys.stderr)
        raise SystemExit(1)
