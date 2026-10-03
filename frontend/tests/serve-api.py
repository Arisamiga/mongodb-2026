"""Isolated browser-test API: real routes, in-memory Mongo/GridFS, fixture matching."""

import sys
from pathlib import Path

import mongomock
import mongomock.gridfs
import uvicorn

backend = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(backend))
sys.path.insert(0, str(backend / "tests"))

from conftest import FakeAIClient  # noqa: E402

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

mongomock.gridfs.enable_gridfs_integration()
database = mongomock.MongoClient(tz_aware=True).browser_test
app = create_app(
    database=database,
    ai_client=FakeAIClient(database),
    settings=Settings(jwt_secret="isolated-browser-test-secret-not-for-production", _env_file=None),
)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
