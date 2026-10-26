"""Build an atomic dispatch proposal without mutating the input scenario.

Persistence, idempotency and version arbitration belong to the API transaction.
This layer independently checks the recorded plan before inventory is consumed.
"""

from collections import Counter
from copy import deepcopy
from .models import Scenario
from .optimizer import allocate_fefo, verify_plan


def prepare_dispatch(scenario: Scenario, result: dict):
    plan = result["plan"]
    verify_plan(scenario, plan)
    served = set(plan["served_order_ids"])
    if not served:
        raise ValueError("Não há pedidos atendidos para expedir neste plano.")
    expected_allocations = allocate_fefo(scenario, served)
    if result["allocations"] != expected_allocations:
        raise ValueError("A separação de lotes não corresponde ao plano verificado.")
    quantities = Counter()
    for allocation in expected_allocations:
        quantities[allocation["batch_id"]] += allocation["quantity"]
    payload = scenario.model_dump(mode="json")
    movements = []
    for batch in payload["batches"]:
        used = quantities[batch["id"]]
        if used:
            before = batch["quantity"]
            if used > before:
                raise ValueError("Saldo insuficiente para a expedição.")
            batch["quantity"] -= used
            movements.append(
                {
                    "batch_id": batch["id"],
                    "product_id": batch["product_id"],
                    "quantity": used,
                    "before": before,
                    "after": batch["quantity"],
                    "expires_on": batch["expires_on"],
                }
            )
    dispatched_orders = [
        deepcopy(order) for order in payload["orders"] if order["id"] in served
    ]
    payload["orders"] = [
        order for order in payload["orders"] if order["id"] not in served
    ]
    # Validate the resulting scenario too; empty backlog is valid.
    updated = Scenario.model_validate(payload).model_dump(mode="json")
    return updated, {
        "orders": dispatched_orders,
        "order_count": len(served),
        "unit_count": sum(order["quantity"] for order in dispatched_orders),
        "movements": movements,
        "allocations": expected_allocations,
        "routes": deepcopy(plan["routes"]),
        "metrics": deepcopy(plan["metrics"]),
    }
