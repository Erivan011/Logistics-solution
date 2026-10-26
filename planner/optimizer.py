"""Capacitated vehicle routing with windows, stock and cold-chain constraints.

Travel is an explicit estimate, NOT a road-network or live-traffic service.
Unserved orders are allowed, with transparent business penalties.
"""

from collections import Counter
from math import asin, ceil, cos, radians, sin, sqrt
from time import perf_counter
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from .models import Scenario

PENALTIES = {"normal": 80_000, "high": 200_000, "urgent": 500_000}
RANK = {"urgent": 0, "high": 1, "normal": 2}


def haversine_m(a, b) -> int:
    dlat, dlng = radians(b.lat - a.lat), radians(b.lng - a.lng)
    arc = (
        sin(dlat / 2) ** 2
        + cos(radians(a.lat)) * cos(radians(b.lat)) * sin(dlng / 2) ** 2
    )
    return round(6_371_000 * 2 * asin(min(1, sqrt(arc))))


def matrices(s: Scenario):
    points = [s.depot] + [o.location for o in s.orders]
    distance = [
        [round(haversine_m(a, b) * s.road_factor) for b in points] for a in points
    ]
    minutes = [
        [ceil(m / (s.average_speed_kmh * 1000 / 60)) for m in row] for row in distance
    ]
    return distance, minutes


def available_stock(s: Scenario):
    stock = Counter()
    for batch in s.batches:
        if batch.expires_on >= s.planning_date:
            stock[batch.product_id] += batch.quantity
    return stock


def arc_cost(meters, vehicle):
    # Integer currency, rounded to the nearest cent for each arc.
    return (meters * vehicle.cost_per_km_cents + 500) // 1000


def summarize(s: Scenario, routes, method, distance):
    served = {stop["order_id"] for route in routes for stop in route["stops"]}
    by_id = {o.id: o for o in s.orders}
    dropped = [o for o in s.orders if o.id not in served]
    cost = sum(r["cost_cents"] for r in routes)
    weight = sum(r["load_g"] for r in routes)
    capacity = sum(
        v.capacity_kg * 1000
        for v in s.vehicles
        if any(r["vehicle_id"] == v.id for r in routes)
    )
    return {
        "method": method,
        "routes": routes,
        "served_order_ids": sorted(served),
        "unserved_order_ids": [o.id for o in dropped],
        "metrics": {
            "served": len(served),
            "unserved": len(dropped),
            "total_orders": len(s.orders),
            "cost_cents": cost,
            "distance_m": sum(r["distance_m"] for r in routes),
            "vehicles_used": len(routes),
            "load_g": weight,
            "utilization_pct": round(weight / capacity * 100, 1) if capacity else 0,
            "urgent_served": sum(by_id[x].priority == "urgent" for x in served),
            "urgent_total": sum(o.priority == "urgent" for o in s.orders),
            "objective_cents": cost + sum(PENALTIES[o.priority] for o in dropped),
        },
    }


def make_route(s, vehicle_index, visits, distance, travel, start=None):
    """Build feasible route times by forward propagation, always returning to depot."""
    v = s.vehicles[vehicle_index]
    time = v.shift_start if start is None else start
    depart = time
    last = 0
    meters = 0
    cost = v.fixed_cost_cents
    stops = []
    load = 0
    products = {p.id: p for p in s.products}
    for index in visits:
        order = s.orders[index - 1]
        arrival = max(time + travel[last][index], order.window_start)
        if arrival > order.window_end:
            return None
        load += order.quantity * products[order.product_id].weight_g
        if load > v.capacity_kg * 1000 or (
            products[order.product_id].refrigerated and not v.refrigerated
        ):
            return None
        meters += distance[last][index]
        cost += arc_cost(distance[last][index], v)
        stops.append(
            {
                "order_id": order.id,
                "arrival_min": arrival,
                "departure_min": arrival + order.service_minutes,
            }
        )
        time = arrival + order.service_minutes
        last = index
    time += travel[last][0]
    meters += distance[last][0]
    cost += arc_cost(distance[last][0], v)
    if time > v.shift_end:
        return None
    return {
        "vehicle_id": v.id,
        "vehicle_name": v.name,
        "start_min": depart,
        "end_min": time,
        "distance_m": meters,
        "cost_cents": cost,
        "load_g": load,
        "capacity_g": v.capacity_kg * 1000,
        "refrigerated": v.refrigerated,
        "stops": stops,
    }


def greedy_baseline(s: Scenario, distance=None, travel=None):
    """Priority/deadline first, cheapest feasible append. Same constraints as solver."""
    if distance is None:
        distance, travel = matrices(s)
    stock = available_stock(s)
    visits = [[] for _ in s.vehicles]
    routes = {}
    ordered = sorted(
        enumerate(s.orders, 1),
        key=lambda pair: (RANK[pair[1].priority], pair[1].window_end, pair[1].id),
    )
    for node, order in ordered:
        if stock[order.product_id] < order.quantity:
            continue
        options = []
        for i in range(len(s.vehicles)):
            candidate = make_route(s, i, visits[i] + [node], distance, travel)
            if candidate:
                delta = candidate["cost_cents"] - routes.get(i, {}).get("cost_cents", 0)
                options.append((delta, i, candidate))
        if options:
            _, i, route = min(options, key=lambda x: (x[0], x[1]))
            routes[i] = route
            visits[i].append(node)
            stock[order.product_id] -= order.quantity
    return summarize(s, list(routes.values()), "greedy_priority", distance)


def _unserved_reason(s, order, stock, travel, index):
    products = {p.id: p for p in s.products}
    product = products[order.product_id]
    eligible = [v for v in s.vehicles if not product.refrigerated or v.refrigerated]
    if stock[order.product_id] < order.quantity:
        return (
            "stock",
            "Quantidade solicitada supera todo o estoque válido deste produto.",
        )
    if not eligible:
        return (
            "cold_chain",
            "Nenhum veículo disponível é compatível com a exigência de refrigeração.",
        )
    if all(order.quantity * product.weight_g > v.capacity_kg * 1000 for v in eligible):
        return (
            "capacity",
            "O peso deste pedido excede a capacidade de todos os veículos compatíveis.",
        )
    if all(
        max(v.shift_start + travel[0][index], order.window_start) > order.window_end
        or max(v.shift_start + travel[0][index], order.window_start)
        + order.service_minutes
        + travel[index][0]
        > v.shift_end
        for v in eligible
        if order.quantity * product.weight_g <= v.capacity_kg * 1000
    ):
        return (
            "time_window",
            "Mesmo uma viagem direta não cabe na janela de atendimento e no turno.",
        )
    return (
        "combination",
        "Não selecionado nesta solução: competição por estoque, capacidade ou tempo. Não foi provado um motivo único.",
    )


def allocate_fefo(s, served):
    """Read-only allocation proposal. No inventory is decremented by a simulation."""
    remaining = {b.id: b.quantity for b in s.batches}
    allocations = []
    orders = sorted(
        [o for o in s.orders if o.id in served],
        key=lambda o: (RANK[o.priority], o.window_end, o.id),
    )
    for order in orders:
        needed = order.quantity
        for batch in sorted(s.batches, key=lambda b: (b.expires_on, b.id)):
            if (
                batch.product_id != order.product_id
                or batch.expires_on < s.planning_date
            ):
                continue
            take = min(needed, remaining[batch.id])
            if take:
                allocations.append(
                    {
                        "order_id": order.id,
                        "batch_id": batch.id,
                        "product_id": batch.product_id,
                        "quantity": take,
                        "expires_on": batch.expires_on.isoformat(),
                    }
                )
                remaining[batch.id] -= take
                needed -= take
            if not needed:
                break
        if needed:
            raise AssertionError("Solver proposed more stock than available")
    return allocations


def verify_plan(s: Scenario, plan):
    """Independent invariant check after optimization and before API persistence."""
    distance, travel = matrices(s)
    orders = {o.id: (i, o) for i, o in enumerate(s.orders, 1)}
    vehicles = {v.id: (i, v) for i, v in enumerate(s.vehicles)}
    seen = set()
    vehicle_seen = set()
    stock = available_stock(s)
    used = Counter()
    for route in plan["routes"]:
        if route["vehicle_id"] in vehicle_seen:
            raise AssertionError("Vehicle used twice")
        vehicle_seen.add(route["vehicle_id"])
        vi, v = vehicles[route["vehicle_id"]]
        nodes = []
        for stop in route["stops"]:
            if stop["order_id"] in seen:
                raise AssertionError("Duplicate order")
            seen.add(stop["order_id"])
            index, order = orders[stop["order_id"]]
            nodes.append(index)
            used[order.product_id] += order.quantity
        expected = make_route(s, vi, nodes, distance, travel, start=route["start_min"])
        if expected is None or route["start_min"] < v.shift_start:
            raise AssertionError("Infeasible route")
        for field in ("stops", "load_g", "distance_m", "cost_cents", "end_min"):
            if route[field] != expected[field]:
                raise AssertionError(f"Inconsistent {field}")
    if seen != set(plan["served_order_ids"]):
        raise AssertionError("Served set differs from route stops")
    if set(plan["unserved_order_ids"]) != {o.id for o in s.orders} - seen:
        raise AssertionError("Missing order classification")
    if any(qty > stock[product] for product, qty in used.items()):
        raise AssertionError("Insufficient stock")
    expected = summarize(s, plan["routes"], plan["method"], distance)
    if expected["metrics"] != plan["metrics"]:
        raise AssertionError("Inconsistent metrics")
    return True


def optimize(s: Scenario, max_seconds: int = 3):
    started = perf_counter()
    distance, travel = matrices(s)
    stock = available_stock(s)
    baseline = greedy_baseline(s, distance, travel)
    if not s.orders:
        best = baseline
        solver_status = "empty"
    else:
        manager = pywrapcp.RoutingIndexManager(len(s.orders) + 1, len(s.vehicles), 0)
        routing = pywrapcp.RoutingModel(manager)
        products = {p.id: p for p in s.products}

        def weight(index):
            node = manager.IndexToNode(index)
            return (
                0
                if node == 0
                else s.orders[node - 1].quantity
                * products[s.orders[node - 1].product_id].weight_g
            )

        weight_callback = routing.RegisterUnaryTransitCallback(weight)
        routing.AddDimensionWithVehicleCapacity(
            weight_callback,
            0,
            [v.capacity_kg * 1000 for v in s.vehicles],
            True,
            "Weight",
        )

        def transit(from_index, to_index):
            a, b = manager.IndexToNode(from_index), manager.IndexToNode(to_index)
            return travel[a][b] + (s.orders[a - 1].service_minutes if a else 0)

        transit_callback = routing.RegisterTransitCallback(transit)
        routing.AddDimension(transit_callback, 720, 1440, False, "Time")
        time = routing.GetDimensionOrDie("Time")
        callbacks = []
        for vi, v in enumerate(s.vehicles):

            def cost(a, b, vehicle=v):
                return arc_cost(
                    distance[manager.IndexToNode(a)][manager.IndexToNode(b)], vehicle
                )

            callbacks.append(cost)  # Keep Python callbacks alive throughout search.
            routing.SetArcCostEvaluatorOfVehicle(
                routing.RegisterTransitCallback(cost), vi
            )
            routing.SetFixedCostOfVehicle(v.fixed_cost_cents, vi)
            time.CumulVar(routing.Start(vi)).SetRange(v.shift_start, v.shift_end)
            time.CumulVar(routing.End(vi)).SetRange(v.shift_start, v.shift_end)
            routing.AddVariableMinimizedByFinalizer(time.CumulVar(routing.Start(vi)))
            routing.AddVariableMinimizedByFinalizer(time.CumulVar(routing.End(vi)))
        for i, order in enumerate(s.orders, 1):
            index = manager.NodeToIndex(i)
            time.CumulVar(index).SetRange(order.window_start, order.window_end)
            routing.AddDisjunction([index], PENALTIES[order.priority])
            allowed = [
                vi
                for vi, v in enumerate(s.vehicles)
                if not products[order.product_id].refrigerated or v.refrigerated
            ]
            if allowed:
                routing.SetAllowedVehiclesForIndex(allowed, index)
            else:
                routing.solver().Add(routing.ActiveVar(index) == 0)
        for product in s.products:
            terms = [
                routing.ActiveVar(manager.NodeToIndex(i)) * o.quantity
                for i, o in enumerate(s.orders, 1)
                if o.product_id == product.id
            ]
            if terms:
                routing.solver().Add(routing.solver().Sum(terms) <= stock[product.id])
        params = pywrapcp.DefaultRoutingSearchParameters()
        params.first_solution_strategy = (
            routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
        )
        params.local_search_metaheuristic = (
            routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        )
        params.time_limit.seconds = max_seconds
        params.log_search = False
        assignment = routing.SolveWithParameters(params)
        solver_status = str(routing.status())
        candidate = None
        if assignment:
            routes = []
            for vi in range(len(s.vehicles)):
                index = routing.Start(vi)
                nodes = []
                while not routing.IsEnd(index):
                    node = manager.IndexToNode(index)
                    if node:
                        nodes.append(node)
                    index = assignment.Value(routing.NextVar(index))
                if nodes:
                    route = make_route(s, vi, nodes, distance, travel)
                    if route is None:
                        raise AssertionError("Invalid route returned by solver")
                    routes.append(route)
            candidate = summarize(s, routes, "ortools_vrptw", distance)
            verify_plan(s, candidate)
        best = (
            candidate
            if candidate
            and candidate["metrics"]["objective_cents"]
            <= baseline["metrics"]["objective_cents"]
            else baseline
        )
    verify_plan(s, best)
    allocations = allocate_fefo(s, set(best["served_order_ids"]))
    unserved = []
    for i, order in enumerate(s.orders, 1):
        if order.id not in best["served_order_ids"]:
            code, reason = _unserved_reason(s, order, stock, travel, i)
            unserved.append(
                {
                    "order_id": order.id,
                    "destination": order.destination,
                    "priority": order.priority,
                    "reason_code": code,
                    "reason": reason,
                }
            )
    return {
        "plan": best,
        "baseline": baseline,
        "allocations": allocations,
        "unserved": unserved,
        "execution": {
            "elapsed_ms": round((perf_counter() - started) * 1000),
            "time_limit_seconds": max_seconds,
            "solver_status": solver_status,
            "verified": True,
            "optimality_proven": False,
        },
        "assumptions": {
            "distance_model": "Haversine × fator viário; não utiliza malha viária ou trânsito real.",
            "average_speed_kmh": s.average_speed_kmh,
            "road_factor": s.road_factor,
            "time_origin": "08:00 America/Sao_Paulo",
            "stock_policy": "FEFO após seleção; exclui lotes vencidos; sem baixa de estoque.",
            "objective": "Custo de transporte + penalidades por pedidos não atendidos. Não é garantia de ótimo global.",
            "penalties_cents": PENALTIES,
        },
    }
