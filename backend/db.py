"""공유 동기 DB 연결과 명시적 스키마 초기화 진입점."""

from contextlib import contextmanager
from pathlib import Path
from collections.abc import Iterator

import psycopg
from psycopg.rows import dict_row

from settings import database_url


@contextmanager
def get_connection() -> Iterator[psycopg.Connection]:
    # psycopg 연결 context는 정상 종료 commit, 예외 rollback 후 항상 close한다.
    with psycopg.connect(database_url(), row_factory=dict_row, connect_timeout=3) as connection:
        yield connection


def initialize_schema() -> None:
    with get_connection() as connection:
        connection.execute(Path(__file__).with_name("schema.sql").read_text())


if __name__ == "__main__":
    try:
        initialize_schema()
    except (psycopg.Error, ValueError):
        raise SystemExit("스키마 초기화 실패: DATABASE_URL과 PostgreSQL 상태를 확인하세요.") from None
    print("PostgreSQL 스키마 초기화 완료")
