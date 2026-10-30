"""선택적 follow 체크포인트와 ACK 전 한 건의 봉투를 로컬에 보관한다."""

import errno
import fcntl
import hashlib
import json
import os
import sqlite3
import stat
import time
from pathlib import Path

from forwarder import diagnose, event_body, send_body, validate_event
from inputs import InputChangedError

DEFAULT_MAX_BYTES = 64 * 1024 * 1024


class SpoolError(Exception):
    pass


def private_file(path):
    try:
        fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    except OSError as error:
        if error.errno in (errno.EACCES, errno.EPERM, errno.ELOOP):
            raise SpoolError("spool_permissions") from None
        raise
    info = os.fstat(fd)
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1
            or stat.S_IMODE(info.st_mode) != 0o600):
        os.close(fd)
        raise SpoolError("spool_permissions")
    return fd


def boundary(stream, offset):
    stream.seek(max(0, offset - 256))
    result = hashlib.sha256(stream.read(min(offset, 256))).hexdigest()
    stream.seek(offset)
    return result


class Spool:
    def __init__(self, directory, max_bytes, settings):
        self.db = None
        self.lock = None
        self.max_bytes = max_bytes
        try:
            directory.mkdir(mode=0o700, parents=True, exist_ok=True)
            info = directory.lstat()
            if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid()
                    or stat.S_IMODE(info.st_mode) != 0o700):
                raise SpoolError("spool_permissions")
            self.lock = private_file(directory / "writer.lock")
            try:
                fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise SpoolError("spool_in_use") from None
            db_path = directory / "queue.sqlite3"
            fd = private_file(db_path)
            os.close(fd)
            if db_path.stat().st_size > max_bytes:
                raise SpoolError("spool_full")
            self.db = sqlite3.connect(db_path, timeout=1)
            # DELETE journal은 commit 뒤 제거된다. 디렉터리는 owner만 접근한다.
            self.db.execute("PRAGMA journal_mode=DELETE")
            self.db.execute("PRAGMA synchronous=FULL")
            page_size = self.db.execute("PRAGMA page_size").fetchone()[0]
            self.db.execute(f"PRAGMA max_page_count={max_bytes // page_size}")
            version = self.db.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1):
                raise SpoolError("spool_version_mismatch")
            with self.db:
                self.db.execute("CREATE TABLE IF NOT EXISTS checkpoint (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)")
                self.db.execute("CREATE TABLE IF NOT EXISTS pending (id INTEGER PRIMARY KEY CHECK(id=1), message_id TEXT NOT NULL, body BLOB NOT NULL)")
                self.db.execute("PRAGMA user_version=1")
            binding = json.dumps([str(settings.log_path.resolve()), settings.instance_id,
                                  settings.events_url]).encode()
            self.binding = hashlib.sha256(binding).hexdigest()
            self.checkpoint = self.load_checkpoint()
            if self.checkpoint and self.checkpoint["binding"] != self.binding:
                raise SpoolError("spool_configuration_mismatch")
        except (sqlite3.Error, OSError):
            self.close()
            raise SpoolError("spool_storage_error") from None
        except BaseException:
            self.close()
            raise

    def load_checkpoint(self):
        row = self.db.execute("SELECT value FROM checkpoint WHERE id=1").fetchone()
        if row is None:
            return None
        try:
            value = json.loads(row[0])
            required = {"binding", "device", "inode", "offset", "boundary", "discard", "line"}
            if (not isinstance(value, dict) or set(value) != required
                    or any(type(value[k]) is not int or value[k] < 0
                           for k in ("device", "inode", "offset", "line"))
                    or type(value["discard"]) is not bool
                    or any(not isinstance(value[k], str) for k in ("binding", "boundary"))):
                raise ValueError
            return value
        except (ValueError, TypeError):
            raise SpoolError("spool_checkpoint_invalid") from None

    def save(self, checkpoint, pending=None):
        # 읽기 위치와 봉투를 같은 트랜잭션에서 확정한 뒤 전송한다.
        with self.db:
            self.db.execute("INSERT OR REPLACE INTO checkpoint VALUES (1, ?)",
                            (json.dumps(checkpoint),))
            if pending:
                body, message_id = pending
                self.db.execute("INSERT INTO pending VALUES (1, ?, ?)", (message_id, body))
        self.checkpoint = checkpoint

    def deliver(self, client, settings, counts, *, recovery=False):
        pending = self.db.execute("SELECT message_id, body FROM pending WHERE id=1").fetchone()
        if pending:
            message_id, body = pending
            if recovery:
                diagnose("spool_pending_retry")
            if not send_body(client, settings.events_url, settings.ingest_token, body,
                             message_id, counts, "eventId"):
                raise SpoolError("spool_delivery_failed")
            with self.db:
                self.db.execute("DELETE FROM pending WHERE id=1")

    def follow(self, client, settings, counts):
        # 이미 저장한 봉투는 입력 파일이 사라져도 먼저 복구한다.
        self.deliver(client, settings, counts, recovery=True)
        with settings.log_path.open("rb") as stream:
            opened = os.fstat(stream.fileno())
            if not stat.S_ISREG(opened.st_mode):
                raise InputChangedError("input_not_regular")
            if self.checkpoint is None:
                offset = stream.seek(0, os.SEEK_END)
                discard = False
                if offset:
                    stream.seek(offset - 1)
                    discard = stream.read(1) != b"\n"
                self.save(dict(binding=self.binding, device=opened.st_dev, inode=opened.st_ino,
                               offset=offset, boundary=boundary(stream, offset), discard=discard, line=0))
            diagnose("spool_ready")
            last_size = opened.st_size
            while True:
                point = self.checkpoint
                try:
                    current = settings.log_path.stat()
                except FileNotFoundError:
                    raise InputChangedError("input_removed") from None
                if ((current.st_dev, current.st_ino) != (point["device"], point["inode"])
                        or (opened.st_dev, opened.st_ino) != (point["device"], point["inode"])):
                    raise InputChangedError("input_replaced")
                if current.st_size < max(last_size, point["offset"]):
                    raise InputChangedError("input_truncated")
                if boundary(stream, point["offset"]) != point["boundary"]:
                    raise InputChangedError("input_checkpoint_mismatch")
                last_size = current.st_size
                # 원본과 봉투 두 사본을 무제한 메모리에 읽지 않는다.
                line = stream.readline(self.max_bytes // 2 + 1)
                if len(line) > self.max_bytes // 2:
                    raise SpoolError("spool_line_too_large")
                if not line.endswith(b"\n"):
                    time.sleep(0.2)
                    continue
                next_point = dict(point, offset=stream.tell(), line=point["line"] + 1, discard=False)
                next_point["boundary"] = boundary(stream, next_point["offset"])
                pending = None
                if not point["discard"] and line.strip():
                    try:
                        event = validate_event(line)
                    except (ValueError, UnicodeError, RecursionError):
                        counts.invalid_input += 1
                        diagnose("invalid_input", line=next_point["line"])
                    else:
                        pending = event_body(settings, event, "live")
                self.save(next_point, pending)
                self.deliver(client, settings, counts)

    def close(self):
        if self.db is not None:
            self.db.close()
            self.db = None
        if self.lock is not None:
            os.close(self.lock)
            self.lock = None


def durable_follow(client, settings, counts, directory: Path, max_bytes: int):
    spool = None
    try:
        spool = Spool(directory, max_bytes, settings)
        spool.follow(client, settings, counts)
    except sqlite3.Error as error:
        reason = "spool_full" if getattr(error, "sqlite_errorcode", None) == sqlite3.SQLITE_FULL else "spool_storage_error"
        raise SpoolError(reason) from None
    except OSError:
        raise SpoolError("spool_io_error") from None
    finally:
        if spool is not None:
            spool.close()
