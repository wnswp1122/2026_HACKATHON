#!/usr/bin/env python3
"""준비된 Linux 시연 환경의 기존 runtime.py를 짧은 명령으로 실행한다."""
import argparse
from pathlib import Path
import runpy
import shutil
import signal
import subprocess
import sys

ACTIONS = {
    'status': '게시판 health와 현재 정책 확인',
    'observe': '파일·네트워크 관찰 정책 적용',
    'file': '고정 파일 읽기 시연',
    'network': '열린 포트 연결 시연',
    'network-fail': '닫힌 포트 연결 시연 (CONNECT_ERROR/1 기대)',
    'enforce': '대응 probe 실행 후 observe 복구',
    'restore': '파일 정책을 observe로 복구 (network는 유지)',
}


def local_run(args):
    import fcntl
    directory = Path(args.runtime_dir).expanduser() if args.runtime_dir else Path.home() / '2026-hack-runtime/tetragon/src'
    script = directory / 'runtime.py'
    if not script.is_file():
        raise RuntimeError(f'준비된 runtime.py가 없습니다: {script}. tetragon/README.md의 환경 준비가 필요합니다.')
    # 이 진입점끼리 정책 변경이 겹치지 않도록 직렬화한다.
    with (directory / '.demo-launcher.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('다른 demo 명령이 실행 중입니다. 완료 후 다시 실행하세요.') from None
        runtime = runpy.run_path(str(script))
        runtime['health']()
        policies = {p['name']: p['state'] for p in runtime['policy_list']()}
        if args.action == 'status':
            runtime['tetra']('list')
            return
        if args.action == 'restore':
            runtime['apply']('observe')
            runtime['health']()
            return
        if 'hack-demo-enforce' in policies:
            raise RuntimeError('기존 enforce 정책이 있습니다. 먼저 현재 상태를 확인하고 demo.py restore로 복구하세요.')
        if args.action == 'observe':
            runtime['apply']('observe')
            runtime['apply']('network')
            return
        required = 'hack-demo-network' if args.action.startswith('network') else 'hack-demo-observe'
        if policies.get(required) != 'TP_STATE_ENABLED':
            raise RuntimeError(f'{required}가 활성 상태가 아닙니다. 먼저 demo.py observe를 실행하세요.')

        def probe(command, expected, marker):
            result = subprocess.run([sys.executable, str(script), command], text=True,
                                    capture_output=True, timeout=15)
            print(result.stdout, end='', flush=True)
            print(result.stderr, end='', file=sys.stderr, flush=True)
            if result.returncode != expected or marker not in result.stdout:
                raise RuntimeError(f'probe 기대 불일치: 종료 코드 {result.returncode}, 기대 {expected}, 표식 {marker}')
            if expected == 137 and 'READ_OK' in result.stdout:
                raise RuntimeError('대응 구간에서 READ_OK가 관찰됐습니다.')
            print(f'개별 probe 기대 결과 일치: {command} / exit {expected}', flush=True)

        if args.action == 'file':
            probe('probe', 0, 'READ_OK bytes=9')
        elif args.action == 'network':
            probe('network-probe', 0, 'CONNECT_OK')
        elif args.action == 'network-fail':
            probe('network-probe-closed', 1, 'CONNECT_ERROR')
        else:
            def interrupted(signum, frame):
                raise KeyboardInterrupt
            signal.signal(signal.SIGTERM, interrupted)
            try:
                runtime['apply']('enforce')
                probe('probe', 137, 'PROBE_START')
                runtime['health']()
            finally:
                # 정상·예외·Ctrl+C 모두 복구를 시도한다. 강제 종료/VM 단절은 보장하지 않는다.
                signal.signal(signal.SIGINT, signal.SIG_IGN)
                signal.signal(signal.SIGTERM, signal.SIG_IGN)
                print('파일 관찰 정책으로 복구합니다.', flush=True)
                try:
                    runtime['apply']('observe')
                    runtime['health']()
                    probe('probe', 0, 'READ_OK bytes=9')
                except Exception:
                    print('복구 실패: 연결을 확인한 뒤 demo.py restore를 실행하세요.', file=sys.stderr)
                    raise
        print('SaaS 저장·화면 표시·SIGKILL 원본 대조는 별도 확인이 필요합니다.', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
                                     epilog='\n'.join(f'  {name:14} {description}' for name, description in ACTIONS.items()))
    parser.add_argument('action', nargs='?', choices=ACTIONS, default='status')
    parser.add_argument('--vm', default='2026-hack-client', help='Lima VM 이름')
    parser.add_argument('--runtime-dir', default='', help='Linux 안의 runtime.py 폴더 (기본: ~/2026-hack-runtime/tetragon/src)')
    parser.add_argument('--local', action='store_true', help='Linux 안에서 직접 실행')
    parser.add_argument('--dry-run', action='store_true', help='실행 위치와 동작만 출력')
    args = parser.parse_args()
    if args.local or args.dry_run:
        print(f'[{args.action}] {ACTIONS[args.action]}', flush=True)
    if args.dry_run:
        print(f'대상: {"현재 Linux" if args.local else "Lima " + args.vm}; 폴더: {args.runtime_dir or "~/2026-hack-runtime/tetragon/src"}')
        return 0
    if args.local:
        if sys.platform != 'linux':
            raise RuntimeError('--local은 Linux에서만 사용할 수 있습니다.')
        local_run(args)
        return 0
    if not shutil.which('limactl'):
        raise RuntimeError('limactl이 없습니다. 준비된 Linux에서는 --local을 사용하세요.')
    # 셸 문자열을 조립하지 않고 인자로 전달한다. VM 파일은 덮어쓰지 않는다.
    command = ['limactl', 'shell', args.vm, '--', 'python3', '-', args.action, '--local']
    if args.runtime_dir:
        command += ['--runtime-dir', args.runtime_dir]
    try:
        return subprocess.run(command, input=Path(__file__).read_text(), text=True).returncode
    except KeyboardInterrupt:
        print('\n중단했습니다. enforce 실행 중이었다면 demo.py status로 복구 여부를 확인하세요.', file=sys.stderr)
        return 130


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print('중단됐습니다. 정책 상태를 확인하세요.', file=sys.stderr)
        raise SystemExit(130)
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        print(f'실행 실패: {error}', file=sys.stderr)
        raise SystemExit(1)
