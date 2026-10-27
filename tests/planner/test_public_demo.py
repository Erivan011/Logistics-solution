"""Public portfolio data is independent from the protected operation."""

import json
from pathlib import Path
from fastapi.testclient import TestClient
from planner.api import create_app
from planner.models import Scenario
from planner.optimizer import verify_plan


def test_public_demo_never_reads_or_exposes_private_operation(tmp_path):
    app = create_app(f"sqlite:///{tmp_path/'private.db'}", api_token="demo-test-token")
    with TestClient(app) as c:
        headers = {"Authorization": "Bearer demo-test-token"}
        current = c.get("/api/scenarios", headers=headers).json()["data"][0]
        changed = current["scenario"]
        changed["name"] = "PRIVATE OPERATION MUST NOT LEAK"
        assert (
            c.put(
                "/api/scenarios/demo-sp",
                headers=headers,
                json={"expected_version": 1, "scenario": changed},
            ).status_code
            == 200
        )
        public = c.get("/api/demo")
        assert public.status_code == 200
        recorded = json.loads(
            (Path(__file__).resolve().parents[2] / "docs/demo-result.json").read_text()
        )
        assert public.json()["data"] == recorded
        assert "PRIVATE OPERATION" not in public.text
        verify_plan(
            Scenario.model_validate(recorded["scenario_snapshot"]),
            recorded["result"]["plan"],
        )
        assert c.get("/api/scenarios").status_code == 401
        assert c.get("/api/runs").status_code == 401
        assert c.get("/api/dispatches").status_code == 401
        assert c.post("/api/scenarios", json=changed).status_code == 401
        assert c.post("/api/demo", json=changed).status_code == 405
        assert (
            c.post(
                "/api/runs/demo-recorded-run/dispatch",
                json={
                    "expected_scenario_version": 1,
                    "idempotency_key": "9a29e5f0-e1be-4f51-b49d-d12eb1e65b83",
                },
            ).status_code
            == 401
        )
        assert (
            c.get("/api/scenarios", headers=headers).json()["data"][0]["version"] == 2
        )


def test_public_csv_exports_only_the_recorded_plan(tmp_path):
    with TestClient(
        create_app(f"sqlite:///{tmp_path/'csv.db'}", api_token="demo-test-token")
    ) as c:
        demo = c.get("/api/demo").json()["data"]
        response = c.get("/api/demo/export.csv")
        assert response.status_code == 200
        assert response.text.startswith("\ufeff")
        assert (
            len(response.text.splitlines())
            == demo["result"]["plan"]["metrics"]["served"] + 1
        )
        assert demo["id"] in response.text
        assert c.get("/api/runs/demo-recorded-run/export.csv").status_code == 401
