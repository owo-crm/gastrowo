from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import get_db
from app.main import app
from app.models import Base
from app.tests.otp_outbox import SENT_CODES

TEST_DATABASE_URL = "sqlite+pysqlite:///:memory:"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


@pytest.fixture(autouse=True)
def reset_db() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture(autouse=True)
def capture_otp_emails(monkeypatch: pytest.MonkeyPatch) -> None:
    SENT_CODES.clear()

    def fake_send_otp_email(*, email: str, code: str, **_: object) -> None:
        SENT_CODES[email] = code

    monkeypatch.setattr("app.routers.auth.send_otp_email", fake_send_otp_email)
    monkeypatch.setattr("app.routers.platform_auth.send_otp_email", fake_send_otp_email)


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

@pytest.fixture(autouse=True)
def no_real_push(monkeypatch: pytest.MonkeyPatch) -> None:
    # Pushes are sent on a background thread against the real database; tests opt in explicitly.
    monkeypatch.setattr("app.services.push._submit", lambda items: None)
