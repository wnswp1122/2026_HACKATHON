from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
import sqlite3

from database import connection, initialize
from posts import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize()
    yield


app = FastAPI(title="Demo Board", version="0.1.0", lifespan=lifespan)
app.include_router(router)


@app.get("/health")
def health():
    try:
        with connection() as db:
            db.execute("SELECT 1")
    except (sqlite3.Error, OSError):
        raise HTTPException(status_code=503, detail="Database unavailable") from None
    return {"status": "ok", "database": "ok"}
