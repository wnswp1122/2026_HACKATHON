from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
import sqlite3

from database import connection


@asynccontextmanager
async def lifespan(app: FastAPI):
    with connection() as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("SELECT 1")
    yield


app = FastAPI(title="Demo Board", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health():
    try:
        with connection() as db:
            db.execute("SELECT 1")
    except (sqlite3.Error, OSError):
        raise HTTPException(status_code=503, detail="Database unavailable") from None
    return {"status": "ok", "database": "ok"}
