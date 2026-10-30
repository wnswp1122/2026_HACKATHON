"""JSONL 파일 경계만 처리한다. 원본의 의미는 해석하지 않는다."""

import os
import stat
import time
from pathlib import Path


class InputChangedError(Exception):
    pass


def read_lines(path: Path, *, follow: bool):
    with path.open("rb") as stream:
        opened = os.fstat(stream.fileno())
        if not stat.S_ISREG(opened.st_mode):
            raise OSError("Input must be a regular file")
        if not follow:
            yield from enumerate(stream, start=1)
            return

        # 시작 전에 있던 미완결 줄의 뒷부분도 기존 이벤트이므로 버린다.
        end = stream.seek(0, os.SEEK_END)
        discard_partial = False
        if end:
            stream.seek(end - 1)
            discard_partial = stream.read(1) != b"\n"
            stream.seek(end)
        last_size = end
        pending = bytearray()
        line_number = 0
        while True:
            try:
                current = path.stat()
            except FileNotFoundError:
                raise InputChangedError("input_removed") from None
            if (current.st_dev, current.st_ino) != (opened.st_dev, opened.st_ino):
                raise InputChangedError("input_replaced")
            if current.st_size < last_size or current.st_size < stream.tell():
                raise InputChangedError("input_truncated")
            last_size = current.st_size
            chunk = stream.readline()
            if not chunk:
                time.sleep(0.2)
                continue
            # 읽는 사이 추가된 데이터의 축소도 다음 반복에서 감지한다.
            last_size = max(last_size, stream.tell())
            if not discard_partial:
                pending.extend(chunk)
            if chunk.endswith(b"\n"):
                line_number += 1
                if not discard_partial:
                    yield line_number, bytes(pending)
                pending.clear()
                discard_partial = False
