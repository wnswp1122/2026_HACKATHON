import os
from pathlib import Path


def database_path() -> Path:
    default = Path(__file__).resolve().parent / ".local" / "board.sqlite3"
    return Path(os.environ.get("BOARD_DB_PATH", str(default))).expanduser()
