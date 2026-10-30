"""준비된 Linux VM 안에서만 실행하는 시연 환경 관리 CLI."""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

IMAGE = "quay.io/cilium/tetragon@sha256:5ed9088a1582131d71b06c98e0d549a37a71ae63ab13aabefc7a47553c822a9d"
OWNER = "2026-hack-tetragon-runtime"
LABEL = f"io.2026-hack.owner={OWNER}"
ROOT = Path.home() / "2026-hack-runtime/tetragon"
SOURCE = Path(__file__).resolve().parent
FILE_POLICIES = ("hack-demo-observe", "hack-demo-enforce")
POLICIES = (*FILE_POLICIES, "hack-demo-network")
HEALTH_CHECK = ["exec", "hack-demo", "python", "-c",
                "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=1).read().decode())"]
POLICY_CLI = ["exec", "hack-tetragon", "tetra", "--server-address",
              "unix:///var/run/tetragon/tetragon.sock", "--timeout", "1s", "tracingpolicy"]


def docker(*args: str, capture: bool = False) -> str:
    result = subprocess.run(["docker", *args], check=True, text=True,
                            stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else ""


def inspect(name: str) -> dict | None:
    result = subprocess.run(["docker", "container", "inspect", name], text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        if "No such container" in result.stderr or "No such object" in result.stderr:
            return None
        raise RuntimeError(result.stderr.strip())
    data = json.loads(result.stdout)[0]
    if (data["Config"].get("Labels") or {}).get("io.2026-hack.owner") != OWNER:
        raise RuntimeError(f"소유하지 않은 컨테이너: {name}")
    return data


def running(name: str) -> dict:
    data = inspect(name)
    if not data or not data["State"]["Running"]:
        raise RuntimeError(f"실행 중인 소유 컨테이너 필요: {name}")
    return data


def tetra(*args: str, capture: bool = False) -> str:
    running("hack-tetragon")
    return docker(*POLICY_CLI, *args, capture=capture)


def wait_ready(args: list[str]) -> None:
    for _ in range(30):
        result = subprocess.run(["docker", *args], text=True, capture_output=True, timeout=5)
        if result.returncode == 0:
            print(result.stdout.strip())
            return
        time.sleep(0.25)
    raise RuntimeError(f"기동 준비 시간 초과: {result.stderr.strip()}")


def policy_list() -> list[dict]:
    data = json.loads(tetra("list", "-o", "json", capture=True))
    return data.get("policies", [])


def off(names: tuple[str, ...] = POLICIES) -> None:
    for policy in policy_list():
        if policy["name"] in names:
            tetra("delete", policy["name"])
    tetra("list")


def health() -> None:
    running("hack-demo")
    docker(*HEALTH_CHECK)


def prepare_probes() -> None:
    running("hack-demo")
    probe_dir = ROOT / "probe"
    probe_dir.mkdir(exist_ok=True)
    for name in ("probe.py", "network_probe.py"):
        (probe_dir / name).write_bytes((SOURCE / name).read_bytes())
    docker("exec", "-u", "0", "hack-demo", "sh", "-ec",
           "cp /usr/local/bin/python3.12 /usr/local/bin/hack-demo-probe; "
           "cp /usr/local/bin/python3.12 /usr/local/bin/hack-demo-net-probe; "
           "chmod 755 /usr/local/bin/hack-demo-probe /usr/local/bin/hack-demo-net-probe; "
           "mkdir -p /tmp/hack-demo; "
           "if [ ! -e /tmp/hack-demo/protected.txt ]; then "
           "printf %s demo-only > /tmp/hack-demo/protected.txt; fi; "
           "chmod 444 /tmp/hack-demo/protected.txt")


def prepare() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    if inspect("hack-demo"):
        raise RuntimeError("hack-demo가 이미 있음. 재준비로 기존 파일을 덮어쓰지 않음")
    volume = subprocess.run(["docker", "volume", "inspect", "hack-tetragon-board-data"],
                            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if volume.returncode == 0:
        labels = json.loads(volume.stdout)[0].get("Labels") or {}
        if labels.get("io.2026-hack.owner") != OWNER:
            raise RuntimeError("소유하지 않은 볼륨: hack-tetragon-board-data")
    elif "no such volume" not in volume.stderr.lower():
        raise RuntimeError(volume.stderr.strip())
    docker("volume", "create", "--label", LABEL, "hack-tetragon-board-data")
    probe_dir = ROOT / "probe"
    probe_dir.mkdir(exist_ok=True)
    # 별도 볼륨 이름으로 게시판 담당의 데이터와 분리한다.
    docker("run", "-d", "--name", "hack-demo", "--label", LABEL,
           "-p", "127.0.0.1:8081:8080", "-v", "hack-tetragon-board-data:/data",
           "--mount", f"type=bind,src={probe_dir},dst=/opt/hack-demo-probe,readonly",
           "hack-demo:tetragon-runtime")
    prepare_probes()
    wait_ready(HEALTH_CHECK)


def start() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / "policies").mkdir(exist_ok=True)
    demo_only = os.environ.get("TETRAGON_EXPORT_DEMO_ONLY", "0")
    if demo_only not in ("0", "1"):
        raise RuntimeError("TETRAGON_EXPORT_DEMO_ONLY는 0 또는 1이어야 합니다")
    export_options = []
    if demo_only == "1":
        demo = inspect("hack-demo")
        if demo is None:
            raise RuntimeError("demo 전용 export에는 소유한 hack-demo가 필요합니다")
        container_id = demo["Id"][:31]
        export_options = ["--export-allowlist=" + json.dumps({"container_id": [f"^{container_id}"]})]
    current = inspect("hack-tetragon")
    if current:
        if current["State"]["Running"]:
            raise RuntimeError("hack-tetragon이 이미 실행 중")
        configured = [arg for arg in current["Config"].get("Cmd", [])
                      if arg.startswith("--export-allowlist=")]
        if configured != export_options:
            raise RuntimeError("export allowlist가 기존 컨테이너와 다릅니다. 소유 확인과 로그 보존 후 재생성하세요")
        docker("start", "hack-tetragon")
        wait_ready([*POLICY_CLI, "list"])
        return
    # gRPC는 컨테이너 내부 Unix socket. TCP 관리 포트를 게시하지 않는다.
    docker("run", "-d", "--name", "hack-tetragon", "--label", LABEL,
           "--pid=host", "--cgroupns=host", "--privileged",
           "-v", "/sys/kernel/btf/vmlinux:/var/lib/tetragon/btf:ro",
           "-v", f"{ROOT}:/var/log/tetragon",
           "-v", f"{ROOT / 'policies'}:/policies:ro", IMAGE,
           "--export-filename=/var/log/tetragon/events.jsonl", "--export-file-perm=644",
           "--enable-process-ns", "--server-address=unix:///var/run/tetragon/tetragon.sock",
           "--health-server-address=", *export_options)
    wait_ready([*POLICY_CLI, "list"])


def apply(mode: str) -> None:
    running("hack-demo")
    # Docker 재생성 때마다 바뀌는 namespace를 컨테이너 안에서 읽는다.
    link = docker("exec", "hack-demo", "readlink", "/proc/self/ns/mnt", capture=True)
    if not link.startswith("mnt:[") or not link.endswith("]"):
        raise RuntimeError(f"잘못된 mount namespace: {link}")
    namespace = int(link[5:-1])
    if namespace == os.stat("/proc/self/ns/mnt").st_ino:
        raise RuntimeError("호스트 mount namespace는 허용하지 않음")
    text = (SOURCE / "policies" / f"{mode}.yaml").read_text()
    if text.count("__HACK_DEMO_MNT_NS__") != 1:
        raise RuntimeError("namespace 템플릿 확인 실패")
    target = ROOT / "policies" / f"{mode}.yaml"
    target.write_text(text.replace("__HACK_DEMO_MNT_NS__", str(namespace)))
    off(("hack-demo-network",) if mode == "network" else FILE_POLICIES)
    tetra("add", f"/policies/{mode}.yaml")
    loaded = policy_list()
    if not any(p["name"] == f"hack-demo-{mode}" and p["state"] == "TP_STATE_ENABLED" for p in loaded):
        raise RuntimeError(f"정책 활성화 확인 실패: {loaded}")
    print(f"APPLIED mode={mode} mnt={namespace}")
    tetra("list")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["prepare", "probes", "start", "status", "observe", "enforce", "network", "network-off", "off", "probe", "network-probe", "network-probe-closed", "health", "stop"])
    args = parser.parse_args()
    if sys.platform != "linux":
        raise RuntimeError("준비된 2026-hack-client Linux VM 안에서 실행하세요")
    if args.command == "prepare":
        prepare()
    elif args.command == "probes":
        prepare_probes()
    elif args.command == "start":
        start()
    elif args.command == "status":
        tetra("list")
    elif args.command in ("observe", "enforce", "network"):
        apply(args.command)
    elif args.command == "network-off":
        off(("hack-demo-network",))
    elif args.command == "off":
        off()
    elif args.command == "probe":
        running("hack-demo")
        docker("exec", "hack-demo", "/usr/local/bin/hack-demo-probe", "-I",
               "/opt/hack-demo-probe/probe.py")
    elif args.command == "health":
        health()
    elif args.command in ("network-probe", "network-probe-closed"):
        running("hack-demo")
        docker("exec", "hack-demo", "/usr/local/bin/hack-demo-net-probe", "-I",
               "/opt/hack-demo-probe/network_probe.py",
               "closed" if args.command.endswith("-closed") else "health")
    elif args.command == "stop":
        off()
        docker("stop", "hack-tetragon")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode) from None
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1) from None
