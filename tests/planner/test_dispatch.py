"""Dispatch invariants: atomic stock effects, idempotency and version arbitration."""

from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import date, timedelta
from threading import Barrier
from uuid import uuid4
import importlib
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session
from planner.api import create_app, RunRecord


@pytest.fixture
def client(tmp_path):
    with TestClient(
        create_app(f"sqlite:///{tmp_path/'dispatch.db'}", api_token="")
    ) as c:
        yield c


def current(c):
    return c.get("/api/scenarios").json()["data"][0]


def plan(c):
    s = current(c)
    r = c.post(
        f"/api/scenarios/{s['id']}/plan",
        json={"expected_version": s["version"], "max_seconds": 1},
    )
    assert r.status_code == 201
    return r.json()["data"]


def body(version=1, key=None):
    return {
        "expected_scenario_version": version,
        "idempotency_key": key or str(uuid4()),
    }


def confirm(c, run, data=None):
    return c.post(f"/api/runs/{run['id']}/dispatch", json=data or body())


def test_dispatch_consumes_exact_lots_removes_served_orders_and_preserves_snapshot(
    client,
):
    before = current(client)
    run = plan(client)
    response = confirm(client, run)
    assert response.status_code == 201
    entry = response.json()["data"]["dispatch"]
    after = current(client)
    assert entry["order_count"] == run["result"]["plan"]["metrics"]["served"]
    assert after["version"] == 2
    assert {o["id"] for o in after["scenario"]["orders"]} == set(
        run["result"]["plan"]["unserved_order_ids"]
    )
    usage = Counter()
    for a in run["result"]["allocations"]:
        usage[a["batch_id"]] += a["quantity"]
    for b0, b1 in zip(before["scenario"]["batches"], after["scenario"]["batches"]):
        assert b1["quantity"] == b0["quantity"] - usage[b0["id"]]
        assert b1["quantity"] >= 0
    assert (
        next(b for b in after["scenario"]["batches"] if b["id"] == "SR-VENC")[
            "quantity"
        ]
        == 200
    )
    for movement in entry["movements"]:
        assert movement["before"] - movement["quantity"] == movement["after"]
    snapshot = client.get(f"/api/runs/{run['id']}").json()["data"]["scenario_snapshot"]
    assert snapshot == before["scenario"]
    audit = client.get("/api/audit").json()["data"]
    assert [x["action"] for x in audit].count("dispatch_confirmed") == 1
    assert len(client.get("/api/dispatches").json()["data"]) == 1


def test_retry_same_key_has_no_extra_effect_and_mismatches_conflict(client):
    run = plan(client)
    request = body()
    first = confirm(client, run, request)
    snapshot = deepcopy(current(client))
    retry = confirm(client, run, request)
    assert first.status_code == 201 and retry.status_code == 200
    assert retry.json()["data"]["replayed"] is True
    assert (
        first.json()["data"]["dispatch"]["id"] == retry.json()["data"]["dispatch"]["id"]
    )
    assert current(client) == snapshot
    assert confirm(client, run, body()).status_code == 409
    assert (
        confirm(client, run, {**request, "expected_scenario_version": 2}).status_code
        == 409
    )
    assert (
        client.post("/api/runs/different-run/dispatch", json=request).status_code == 409
    )
    assert len(client.get("/api/dispatches").json()["data"]) == 1


def test_edited_scenario_blocks_obsolete_plan_without_consumption(client):
    run = plan(client)
    s = current(client)
    client.put(
        f"/api/scenarios/{s['id']}",
        json={"expected_version": 1, "scenario": {**s["scenario"], "name": "Alterado"}},
    )
    expected = current(client)
    assert confirm(client, run).status_code == 409
    assert current(client) == expected
    assert client.get("/api/dispatches").json()["data"] == []


def test_second_plan_from_same_version_cannot_consume_twice(client):
    first = plan(client)
    second = plan(client)
    assert confirm(client, first).status_code == 201
    state = deepcopy(current(client))
    assert confirm(client, second).status_code == 409
    assert current(client) == state


def test_empty_and_historical_dates_cannot_be_dispatched(client):
    s = current(client)
    empty = {**s["scenario"], "orders": []}
    client.put(
        f"/api/scenarios/{s['id']}", json={"expected_version": 1, "scenario": empty}
    )
    run = plan(client)
    assert confirm(client, run, body(version=2)).status_code == 409
    s = current(client)
    historical = deepcopy(s["scenario"])
    historical["planning_date"] = "2020-01-01"
    client.put(
        f"/api/scenarios/{s['id']}",
        json={"expected_version": 2, "scenario": historical},
    )
    run = plan(client)
    assert confirm(client, run, body(version=3)).status_code == 409
    assert client.get("/api/dispatches").json()["data"] == []


def test_tampered_allocations_are_rejected(client):
    run = plan(client)
    before = current(client)
    with Session(client.app.state.engine) as session:
        record = session.get(RunRecord, run["id"])
        result = deepcopy(record.result)
        result["allocations"][0]["quantity"] += 1
        record.result = result
        session.commit()
    assert confirm(client, run).status_code == 409
    assert current(client) == before
    assert client.get("/api/dispatches").json()["data"] == []


def test_audit_failure_rolls_back_scenario_and_dispatch(client):
    run = plan(client)
    before = current(client)

    def fail_audit(connection, cursor, statement, parameters, context, executemany):
        if statement.startswith("INSERT INTO planning_audit"):
            raise RuntimeError("Injected audit failure")

    engine = client.app.state.engine
    event.listen(engine, "before_cursor_execute", fail_audit)
    try:
        with pytest.raises(RuntimeError, match="Injected audit failure"):
            confirm(client, run)
    finally:
        event.remove(engine, "before_cursor_execute", fail_audit)
    assert current(client) == before
    assert client.get("/api/dispatches").json()["data"] == []


def test_concurrent_retry_with_same_key_consumes_once(client, monkeypatch):
    run = plan(client)
    request = body()
    barrier = Barrier(2)
    module = importlib.import_module("planner.api")
    original = module.prepare_dispatch

    def coordinated(*args):
        value = original(*args)
        barrier.wait(timeout=5)
        return value

    monkeypatch.setattr(module, "prepare_dispatch", coordinated)
    with ThreadPoolExecutor(max_workers=2) as workers:
        responses = list(workers.map(lambda _: confirm(client, run, request), range(2)))
    assert sorted(r.status_code for r in responses) == [200, 201]
    assert current(client)["version"] == 2
    assert len(client.get("/api/dispatches").json()["data"]) == 1


def test_concurrent_different_keys_on_same_plan_have_one_winner(client, monkeypatch):
    run = plan(client)
    barrier = Barrier(2)
    module = importlib.import_module("planner.api")
    original = module.prepare_dispatch

    def coordinated(*args):
        value = original(*args)
        barrier.wait(timeout=5)
        return value

    monkeypatch.setattr(module, "prepare_dispatch", coordinated)
    with ThreadPoolExecutor(max_workers=2) as workers:
        responses = list(workers.map(lambda _: confirm(client, run, body()), range(2)))
    assert sorted(r.status_code for r in responses) == [201, 409]
    assert current(client)["version"] == 2
    assert len(client.get("/api/dispatches").json()["data"]) == 1
