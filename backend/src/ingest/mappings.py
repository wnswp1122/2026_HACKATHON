"""정책·훅·인자 타입을 함께 확인한 매핑만 사용한다. 증거는 backend README 참조."""

from ipaddress import ip_address
from typing import Any


def valid_ip(value: Any) -> str | None:
    if not isinstance(value, str) or "%" in value:
        return None
    try:
        return str(ip_address(value))
    except ValueError:
        return None


def valid_port(value: Any) -> int | None:
    return value if type(value) is int and 0 <= value <= 65535 else None


def nonempty_text(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def mapped_file(event: dict) -> dict | None:
    if event.get("policy_name") not in ("hack-demo-observe", "hack-demo-enforce", "hack-demo-service-observe"):
        return None
    if event.get("function_name") != "security_file_permission":
        return None
    args = event.get("args")
    if not isinstance(args, list) or len(args) < 2 or not all(isinstance(arg, dict) for arg in args[:2]):
        return None
    file_arg = args[0].get("file_arg")
    mask = args[1].get("int_arg")
    if not isinstance(file_arg, dict) or type(mask) is not int or mask not in (2, 4):
        return None
    if mask == 2 and event.get("policy_name") != "hack-demo-service-observe":
        return None
    path = nonempty_text(file_arg.get("path"))
    if path is None:
        return None
    # MAY_READ/MAY_WRITE 권한 검사 관찰이다. 실제 읽기·쓰기 성공을 의미하지 않는다.
    return {"path": path, "operation": "read" if mask == 4 else "write"}


def mapped_network(event: dict, *, sample: bool = False) -> dict | None:
    # Tetragon 담당의 tcp_connect 성공/ECONNREFUSED 양쪽 실측에 근거한다.
    if event.get("policy_name") not in ("hack-demo-network", "hack-demo-service-network") and not (sample and event.get("policy_name") == "sample-risk-network"):
        return None
    if event.get("function_name") != "tcp_connect":
        return None
    args = event.get("args")
    if not isinstance(args, list) or not args or not isinstance(args[0], dict):
        return None
    sock = args[0].get("sock_arg")
    if not isinstance(sock, dict):
        return None
    if sock.get("family") != "AF_INET" or sock.get("type") != "SOCK_STREAM" or sock.get("protocol") != "IPPROTO_TCP":
        return None
    return {
        "sourceIp": valid_ip(sock.get("saddr")),
        "sourcePort": valid_port(sock.get("sport")),
        "destinationIp": valid_ip(sock.get("daddr")),
        "destinationPort": valid_port(sock.get("dport")),
        "protocol": "TCP",
        "operation": "connect",
    }


def network_target(network: dict) -> str | None:
    for direction in ("destination", "source"):
        ip = network[f"{direction}Ip"]
        port = network[f"{direction}Port"]
        if ip is not None:
            host = f"[{ip}]" if ":" in ip else ip
            return f"{host}:{port}" if port is not None else host
    return None
