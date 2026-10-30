"""시연 컨테이너 내부의 고정 IPv4 loopback TCP 포트에만 연결한다."""

import argparse
from datetime import datetime, timezone
import os
import socket


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", choices=("health", "closed"), default="health", nargs="?")
    port = 18080 if parser.parse_args().target == "closed" else 8080
    print(f"NETWORK_PROBE_START pid={os.getpid()} time={datetime.now(timezone.utc).isoformat()} destination=127.0.0.1:{port}", flush=True)
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as connection:
            connection.settimeout(2)
            connection.connect(("127.0.0.1", port))
    except OSError as error:
        print(f"CONNECT_ERROR errno={error.errno}", flush=True)
        return 1
    print("CONNECT_OK", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
