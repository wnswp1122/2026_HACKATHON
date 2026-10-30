"""30초 주기의 관리 CLI 실조회. 이벤트 JSONL과 별도 파일로 기록한다."""

import argparse
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
import threading
import time

from runtime import OWNER, ROOT

INTERVAL_SECONDS = 30
ADDRESS = "unix:///var/run/tetragon/tetragon.sock"
POLICY_STATES = {
    "TP_STATE_ENABLED": "enabled",
    "TP_STATE_DISABLED": "disabled",
    "TP_STATE_LOAD_ERROR": "error",
    "TP_STATE_ERROR": "error",
}


class QueryError(Exception):
    def __init__(self, code: str, reachable: bool | None):
        self.code = code
        self.reachable = reachable


def command(*args: str) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(["docker", *args], text=True, capture_output=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        raise QueryError("STATUS_COMMAND_FAILED", None) from None


def tetra(*args: str) -> subprocess.CompletedProcess:
    return command("exec", "hack-tetragon", "tetra", "--server-address", ADDRESS,
                   "--timeout", "1s", "--retries", "0", *args)


def report(code: str | None = None) -> dict:
    collector = {"state": "error" if code else "ok", "errorCode": code}
    tetragon = {"reachable": None, "version": None, "sensors": [], "policies": []}
    if code is None:
        try:
            result = command("container", "inspect", "hack-tetragon")
            if result.returncode:
                raise QueryError("TETRAGON_CONTAINER_UNAVAILABLE", None)
            data = json.loads(result.stdout)[0]
            if (data["Config"].get("Labels") or {}).get("io.2026-hack.owner") != OWNER:
                raise QueryError("RESOURCE_NOT_OWNED", None)
            if not data["State"]["Running"]:
                raise QueryError("TETRAGON_STOPPED", False)
            version = tetra("version", "--server")
            if version.returncode:
                raise QueryError("TETRAGON_UNREACHABLE", False)
            tetragon["reachable"] = True
            match = re.search(r"^Server version: v?([0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?)$",
                              version.stdout, re.MULTILINE)
            if match is None:
                raise QueryError("STATUS_INVALID_VERSION", True)
            tetragon["version"] = match[1]
            health = tetra("status")
            if health.returncode:
                raise QueryError("HEALTH_QUERY_FAILED", True)
            if health.stdout.strip() != "Health Status: running":
                collector.update(state="unknown", errorCode="HEALTH_STATUS_UNKNOWN")
            policies = tetra("tracingpolicy", "list", "-o", "json")
            if policies.returncode:
                raise QueryError("POLICY_QUERY_FAILED", True)
            raw = json.loads(policies.stdout).get("policies", [])
            if not isinstance(raw, list):
                raise QueryError("STATUS_INVALID_POLICY_LIST", True)
            if len(raw) > 200:
                collector.update(state="error", errorCode="STATUS_LIMIT_EXCEEDED")
            for policy in raw[:200]:
                name = policy.get("name")
                if not isinstance(name, str) or not 1 <= len(name) <= 100:
                    raise QueryError("STATUS_INVALID_POLICY_NAME", True)
                state = POLICY_STATES.get(policy.get("state"), "unknown")
                if policy.get("error"):
                    state = "error"
                tetragon["policies"].append({"name": name, "state": state,
                                             "error": "POLICY_LOAD_ERROR" if state == "error" else None})
            sensors = tetra("sensors", "list")
            if sensors.returncode and "ListSensors is deprecated" in sensors.stderr:
                # v1.8.0은 개별 센서 조회 API를 지원하지 않는다. 정책/health로 대체하지 않는다.
                if collector["state"] != "error":
                    collector.update(state="unknown", errorCode="SENSOR_STATUS_UNSUPPORTED")
            elif sensors.returncode:
                raise QueryError("SENSOR_QUERY_FAILED", True)
            else:
                # v1.8.0 고정 CLI의 문서화된 목록 형식. 모르는 출력은 정상으로 해석하지 않는다.
                for line in sensors.stdout.splitlines():
                    match = re.fullmatch(r"(\S+) \((enabled|not enabled)\)(?: .*)?", line)
                    if not match or len(match[1]) > 100:
                        raise QueryError("STATUS_INVALID_SENSOR_LIST", True)
                    tetragon["sensors"].append({"name": match[1],
                                                "state": "enabled" if match[2] == "enabled" else "disabled",
                                                "error": None})
                if len(tetragon["sensors"]) > 100:
                    tetragon["sensors"] = tetragon["sensors"][:100]
                    collector.update(state="error", errorCode="STATUS_LIMIT_EXCEEDED")
        except QueryError as error:
            collector.update(state="error", errorCode=error.code)
            tetragon["reachable"] = error.reachable
        except (ValueError, KeyError, TypeError, IndexError, AttributeError):
            collector.update(state="error", errorCode="STATUS_INVALID_RESPONSE")
    return {"observedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "collector": collector, "tetragon": tetragon}


def atomic_write(path: Path, value: dict) -> None:
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         prefix=f".{path.name}.", delete=False) as target:
            temporary = Path(target.name)
            json.dump(value, target, ensure_ascii=False, separators=(",", ":"))
            target.write("\n")
            target.flush()
            os.fsync(target.fileno())
            os.fchmod(target.fileno(), 0o644)
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "status.json")
    parser.add_argument("--once", action="store_true", help="실조회 결과를 한 번 기록하고 종료")
    args = parser.parse_args()
    if sys.platform != "linux":
        parser.error("준비된 Linux VM 안에서 실행하세요")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    stopped = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stopped.set())
    # 같은 출력 경로의 기존 수집기를 덮어쓰거나 종료하지 않는다.
    with args.output.with_suffix(args.output.suffix + ".lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("COLLECTOR_ALREADY_RUNNING", file=sys.stderr)
            return 1
        while not stopped.is_set():
            started = time.monotonic()
            value = report()
            if stopped.is_set():
                break
            atomic_write(args.output, value)
            print(f"STATUS_WRITTEN state={value['collector']['state']} errorCode={value['collector']['errorCode']}", flush=True)
            if args.once:
                return 1 if value["collector"]["state"] == "error" else 0
            stopped.wait(max(0, INTERVAL_SECONDS - (time.monotonic() - started)))
        atomic_write(args.output, report("COLLECTOR_STOPPED"))
        print("COLLECTOR_STOPPED", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OSError:
        print("STATUS_WRITE_FAILED", file=sys.stderr)
        raise SystemExit(1) from None
