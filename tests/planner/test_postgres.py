"""Optional integration against an isolated PostgreSQL test database."""

import os
import pytest
from fastapi.testclient import TestClient
from planner.api import create_app, Base


@pytest.mark.skipif(
    not os.getenv("POSTGRES_TEST_URL"), reason="PostgreSQL de teste não configurado"
)
def test_postgres_snapshot_version_and_transaction():
    # Render provides a plain PostgreSQL URL, not a SQLAlchemy driver URL.
    provider_url = os.environ["POSTGRES_TEST_URL"].replace(
        "postgresql+psycopg://", "postgresql://", 1
    )
    app = create_app(provider_url, api_token="")
    try:
        with TestClient(app) as c:
            first = c.get("/api/scenarios").json()["data"][0]
            r = c.post(
                f"/api/scenarios/{first['id']}/plan",
                json={"expected_version": first["version"], "max_seconds": 1},
            )
            assert (
                r.status_code == 201
                and r.json()["data"]["result"]["execution"]["verified"]
            )
            payload = first["scenario"]
            payload["name"] = "PostgreSQL validado"
            assert (
                c.put(
                    f"/api/scenarios/{first['id']}",
                    json={"expected_version": first["version"], "scenario": payload},
                ).status_code
                == 200
            )
            assert (
                c.put(
                    f"/api/scenarios/{first['id']}",
                    json={"expected_version": first["version"], "scenario": payload},
                ).status_code
                == 409
            )
            assert c.get("/api/runs").json()["data"]
    finally:
        Base.metadata.drop_all(app.state.engine)
        app.state.engine.dispose()
