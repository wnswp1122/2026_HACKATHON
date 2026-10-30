import argparse
import json
import sys
from pathlib import Path

import httpx

from settings import Settings
from forwarder import AuthenticationError, Counts, diagnose, send_event, send_status, validate_event
from inputs import InputChangedError, read_lines
from status_input import read_statuses


def main():
    parser = argparse.ArgumentParser(description="Client event forwarder")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check-config", action="store_true",
                      help="Validate configuration without sending a request")
    mode.add_argument("--follow", action="store_true",
                      help="Send new complete lines from TETRAGON_LOG_PATH as live events")
    mode.add_argument("--replay", type=Path, metavar="PATH",
                      help="Send PATH once from the beginning as sample events")
    mode.add_argument("--status-follow", type=Path, metavar="PATH",
                      help="Send new status snapshots independently as live reports")
    mode.add_argument("--status-replay", type=Path, metavar="PATH",
                      help="Send one status snapshot as a sample report")
    args = parser.parse_args()
    status_mode = args.status_follow is not None or args.status_replay is not None
    try:
        settings = Settings.from_environment(status_mode=status_mode)
    except ValueError as error:
        parser.error(str(error))
    if args.check_config:
        with httpx.Client(timeout=5, follow_redirects=False, trust_env=False) as client:
            client.build_request("POST", settings.events_url,
                                 headers={"Authorization": f"Bearer {settings.ingest_token}"})
        print(json.dumps({"status": "configuration_valid", "schemaVersion": "1",
                          "instanceId": settings.instance_id,
                          "inputExists": settings.log_path.is_file()}))
        return 0

    counts = Counts()
    source = "live" if args.follow or args.status_follow is not None else "sample"
    status = "completed"
    exit_code = 0
    if status_mode:
        lines = read_statuses(args.status_follow or args.status_replay,
                              follow=args.status_follow is not None)
    else:
        lines = read_lines(settings.log_path if args.follow else args.replay, follow=args.follow)
    try:
        with httpx.Client(timeout=5, follow_redirects=False, trust_env=False) as client:
            for item in lines:
                if status_mode:
                    payload, error = item
                    if error:
                        diagnose(error)
                        if error != "status_same_observation":
                            counts.invalid_input += 1
                        continue
                    send_status(client, settings, payload, source, counts)
                    continue
                line_number, line = item
                if not line.strip():
                    continue
                try:
                    event = validate_event(line)
                except (ValueError, UnicodeError, RecursionError):
                    counts.invalid_input += 1
                    diagnose("invalid_input", line=line_number)
                    continue
                send_event(client, settings, event, source, counts)
    except AuthenticationError:
        status, exit_code = "authentication_error", 2
    except InputChangedError as error:
        status, exit_code = str(error), 2
        diagnose(status)
    except OSError:
        status, exit_code = "input_error", 2
        diagnose(status)
    except KeyboardInterrupt:
        status, exit_code = "interrupted", 130
    finally:
        lines.close()
    summary = {"status": status, "source": source, **counts.as_dict()}
    if status_mode:
        summary["kind"] = "sensor_status"
    print(json.dumps(summary), flush=True)
    return exit_code or int(bool(counts.invalid_input or counts.failed))


if __name__ == "__main__":
    sys.exit(main())
