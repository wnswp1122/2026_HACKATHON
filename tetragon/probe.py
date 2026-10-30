"""고정 시연 파일만 읽는 별도 프로세스. HTTP 서버에서 호출하지 않는다."""

import os
from datetime import datetime, timezone


def main() -> int:
    print(f"PROBE_START pid={os.getpid()} time={datetime.now(timezone.utc).isoformat()}", flush=True)
    try:
        with open("/tmp/hack-demo/protected.txt", "rb", buffering=0) as source:
            content = source.read(64)
    except OSError as error:
        print(f"READ_ERROR errno={error.errno}", flush=True)
        return 1
    if content != b"demo-only":
        print("CONTENT_MISMATCH", flush=True)
        return 2
    print("READ_OK bytes=9", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
