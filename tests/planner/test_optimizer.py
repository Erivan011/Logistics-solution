from collections import Counter
from copy import deepcopy
from datetime import date
from itertools import permutations
import pytest
from planner.demo import demo_scenario
from planner.models import Scenario
from planner.optimizer import (
    optimize,
    verify_plan,
    allocate_fefo,
    available_stock,
    make_route,
    matrices,
    PENALTIES,
)


@pytest.fixture
def demo():
    return demo_scenario(date(2026, 10, 26))


def mutate(s, **changes):
    data = s.model_dump(mode="json")
    data.update(changes)
    return Scenario.model_validate(data)


def test_demo_routes_are_feasible_and_no_worse_than_baseline(demo):
    result = optimize(demo, 1)
    plan = result["plan"]
    assert verify_plan(demo, plan)
    assert (
        plan["metrics"]["objective_cents"]
        <= result["baseline"]["metrics"]["objective_cents"]
    )
    assert plan["metrics"]["urgent_served"] == 3
    assert len(plan["served_order_ids"]) == len(set(plan["served_order_ids"]))
    assert result["execution"]["verified"] is True
    assert result["execution"]["optimality_proven"] is False
    assert demo.batches[0].quantity == 300  # simulation never mutates inventory


def test_expired_stock_is_excluded_and_fefo_is_respected(demo):
    result = optimize(demo, 1)
    used = Counter()
    for a in result["allocations"]:
        used[a["batch_id"]] += a["quantity"]
        assert a["expires_on"] >= "2026-10-26"
    assert used["SR-VENC"] == 0
    if used["SR-02"]:
        assert used["SR-01"] == 300
    if used["RF-02"]:
        assert used["RF-01"] == 150
    for b in demo.batches:
        assert used[b.id] <= b.quantity
    order_units = Counter()
    for a in result["allocations"]:
        order_units[a["order_id"]] += a["quantity"]
    for o in demo.orders:
        assert order_units[o.id] == (
            o.quantity if o.id in result["plan"]["served_order_ids"] else 0
        )


def test_no_cold_vehicle_explains_compatibility(demo):
    vehicles = [{**v.model_dump(), "refrigerated": False} for v in demo.vehicles]
    scenario = mutate(demo, vehicles=vehicles)
    result = optimize(scenario, 1)
    cold_ids = {o.id for o in scenario.orders if o.product_id == "vacina"}
    assert not cold_ids.intersection(result["plan"]["served_order_ids"])
    assert all(
        u["reason_code"] == "cold_chain"
        for u in result["unserved"]
        if u["order_id"] in cold_ids
    )


def test_zero_inventory_serves_nothing_and_returns_stock_reasons(demo):
    scenario = mutate(demo, batches=[])
    r = optimize(scenario, 1)
    assert r["plan"]["metrics"]["served"] == 0
    assert r["plan"]["metrics"]["cost_cents"] == 0
    assert not r["allocations"]
    assert {u["reason_code"] for u in r["unserved"]} == {"stock"}


def test_impossible_capacity_and_window_have_specific_reasons(demo):
    data = demo.model_dump(mode="json")
    data["orders"] = data["orders"][:2]
    data["orders"][0]["quantity"] = 10000
    data["batches"][0]["quantity"] = 10000
    data["orders"][1]["window_start"] = 0
    data["orders"][1]["window_end"] = 0
    r = optimize(Scenario.model_validate(data), 1)
    reasons = {u["order_id"]: u["reason_code"] for u in r["unserved"]}
    assert reasons["PED-001"] == "capacity"
    assert reasons["PED-002"] == "time_window"


def test_empty_order_set_is_valid(demo):
    r = optimize(mutate(demo, orders=[]), 1)
    assert r["execution"]["solver_status"] == "empty"
    assert r["plan"]["metrics"]["served"] == 0
    assert r["plan"]["metrics"]["utilization_pct"] == 0


def test_verifier_rejects_corrupt_time_cost_and_duplicates(demo):
    plan = optimize(demo, 1)["plan"]
    corrupt = deepcopy(plan)
    corrupt["routes"][0]["stops"][0]["arrival_min"] += 1
    with pytest.raises(AssertionError):
        verify_plan(demo, corrupt)
    corrupt = deepcopy(plan)
    corrupt["routes"][0]["cost_cents"] += 1
    with pytest.raises(AssertionError):
        verify_plan(demo, corrupt)
    corrupt = deepcopy(plan)
    corrupt["routes"].append(corrupt["routes"][0])
    with pytest.raises(AssertionError):
        verify_plan(demo, corrupt)


def test_small_route_matches_exhaustive_optimum(demo):
    data = demo.model_dump(mode="json")
    data["orders"] = data["orders"][:4]
    for o in data["orders"]:
        o.update(window_start=0, window_end=600)
    data["vehicles"] = [{**data["vehicles"][0], "capacity_kg": 2000, "shift_end": 720}]
    data["batches"] = [{**b, "quantity": 10000} for b in data["batches"]]
    s = Scenario.model_validate(data)
    distance, travel = matrices(s)
    candidates = [
        make_route(s, 0, list(p), distance, travel) for p in permutations(range(1, 5))
    ]
    best = min(r["cost_cents"] for r in candidates if r)
    result = optimize(s, 1)
    assert result["plan"]["metrics"]["served"] == 4
    assert result["plan"]["metrics"]["cost_cents"] == best


def test_cross_references_ids_and_nonfinite_values_are_rejected(demo):
    data = demo.model_dump(mode="json")
    data["orders"][0]["product_id"] = "missing"
    with pytest.raises(ValueError):
        Scenario.model_validate(data)
    data = demo.model_dump(mode="json")
    data["orders"][0]["id"] = data["orders"][1]["id"]
    with pytest.raises(ValueError):
        Scenario.model_validate(data)
    data = demo.model_dump(mode="json")
    data["road_factor"] = float("nan")
    with pytest.raises(ValueError):
        Scenario.model_validate(data)
    data = demo.model_dump(mode="json")
    data["orders"][0]["window_end"] = -1
    with pytest.raises(ValueError):
        Scenario.model_validate(data)
