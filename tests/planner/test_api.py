from copy import deepcopy
from datetime import date
from fastapi.testclient import TestClient
import pytest
from planner.api import create_app
from planner.demo import demo_scenario


@pytest.fixture
def client(tmp_path):
    app = create_app(f"sqlite:///{tmp_path/'test.db'}", seed=True, api_token="")
    with TestClient(app) as client:
        yield client


def first(client):
    return client.get("/api/scenarios").json()["data"][0]


def test_scenario_version_conflict_is_atomic_and_audited(client):
    initial = first(client)
    payload = deepcopy(initial["scenario"])
    payload["name"] = "Alterado"
    r = client.put(
        f"/api/scenarios/{initial['id']}",
        json={"expected_version": 1, "scenario": payload},
    )
    assert r.status_code == 200 and r.json()["data"]["version"] == 2
    payload["name"] = "Não deve sobrescrever"
    r = client.put(
        f"/api/scenarios/{initial['id']}",
        json={"expected_version": 1, "scenario": payload},
    )
    assert r.status_code == 409
    assert first(client)["scenario"]["name"] == "Alterado"
    assert len(client.get("/api/audit").json()["data"]) == 1


def test_plan_snapshot_survives_later_scenario_edits_and_exports(client):
    initial = first(client)
    r = client.post(
        f"/api/scenarios/{initial['id']}/plan",
        json={"expected_version": 1, "max_seconds": 1},
    )
    assert r.status_code == 201
    r = r.json()["data"]
    assert r["result"]["execution"]["verified"]
    changed = deepcopy(initial["scenario"])
    changed["orders"][0]["quantity"] = 1
    client.put(
        f"/api/scenarios/{initial['id']}",
        json={"expected_version": 1, "scenario": changed},
    )
    saved = client.get(f"/api/runs/{r['id']}").json()["data"]
    assert saved["scenario_snapshot"]["orders"][0]["quantity"] == 120
    assert saved["scenario_version"] == 1
    assert first(client)["version"] == 2
    assert (
        client.post(
            f"/api/scenarios/{initial['id']}/plan",
            json={"expected_version": 1, "max_seconds": 1},
        ).status_code
        == 409
    )
    csv = client.get(f"/api/runs/{r['id']}/export.csv")
    assert csv.status_code == 200
    assert csv.text.startswith("\ufeff")
    assert (
        len(csv.text.splitlines()) == saved["result"]["plan"]["metrics"]["served"] + 1
    )
    assert len(client.get("/api/runs").json()["data"]) == 1


def test_scenario_creation_validation_and_unknown_resources(client):
    payload = demo_scenario(date(2026, 10, 26)).model_dump(mode="json")
    payload["name"] = "Outra operação"
    assert client.post("/api/scenarios", json=payload).status_code == 201
    assert len(client.get("/api/scenarios").json()["data"]) == 2
    payload["orders"][0]["quantity"] = -1
    assert client.post("/api/scenarios", json=payload).status_code == 422
    assert client.get("/api/runs/missing").status_code == 404
    assert (
        client.post(
            "/api/scenarios/missing/plan", json={"expected_version": 1}
        ).status_code
        == 404
    )


def test_authentication_and_origin_guards(tmp_path):
    app = create_app(f"sqlite:///{tmp_path/'secured.db'}", api_token="test-only-token")
    with TestClient(app) as c:
        assert c.get("/api/health").status_code == 200
        assert c.get("/api/scenarios").status_code == 401
        headers = {"Authorization": "Bearer test-only-token"}
        assert c.get("/api/scenarios", headers=headers).status_code == 200
        initial = c.get("/api/scenarios", headers=headers).json()["data"][0]
        headers["Origin"] = "https://external.invalid"
        assert (
            c.post(
                "/api/scenarios", headers=headers, json=initial["scenario"]
            ).status_code
            == 403
        )
        assert c.get("/api/scenarios").headers["x-content-type-options"] == "nosniff"


def test_database_persists_across_application_restarts(tmp_path):
    url = f"sqlite:///{tmp_path/'persist.db'}"
    with TestClient(create_app(url, api_token="")) as c:
        original = first(c)
        c.post("/api/scenarios", json={**original["scenario"], "name": "Persistido"})
    with TestClient(create_app(url, api_token="")) as c:
        assert len(c.get("/api/scenarios").json()["data"]) == 2


def test_local_api_documentation_schema_and_body_limit(client):
    docs = client.get("/docs")
    assert docs.status_code == 200
    assert "/api-docs/assets/swagger-ui-bundle.js" in docs.text
    assert "cdn.jsdelivr" not in docs.text
    assert client.get("/api-docs/assets/swagger-ui-bundle.js").status_code == 200
    schema = client.get("/openapi.json").json()
    assert "/api/scenarios/{id}/plan" in schema["paths"]
    assert "HTTPBearer" in schema["components"]["securitySchemes"]
    response = client.post("/api/scenarios", content=b"x" * 270000)
    assert response.status_code == 413
