import argparse
import json

import httpx

from settings import Settings


def main():
    parser = argparse.ArgumentParser(description="Client event forwarder")
    parser.add_argument("--check-config", action="store_true", required=True,
                        help="Validate configuration without sending a request")
    parser.parse_args()
    try:
        settings = Settings.from_environment()
    except ValueError as error:
        parser.error(str(error))
    with httpx.Client(timeout=5, follow_redirects=False, trust_env=False) as client:
        client.build_request("POST", settings.events_url,
                                       headers={"Authorization": f"Bearer {settings.ingest_token}"})
    print(json.dumps({"status": "configuration_valid", "schemaVersion": "1",
                      "instanceId": settings.instance_id, "inputExists": settings.log_path.is_file()}))


if __name__ == "__main__":
    main()
