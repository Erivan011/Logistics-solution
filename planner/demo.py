"""Deterministic synthetic São Paulo operation; no company or patient data."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from .models import Scenario


def demo_scenario(today: date | None = None) -> Scenario:
    today = today or datetime.now(ZoneInfo("America/Sao_Paulo")).date()
    products = [
        dict(
            id="soro", name="Soro fisiológico 500 ml", weight_g=550, refrigerated=False
        ),
        dict(
            id="vacina",
            name="Produto refrigerado de demonstração",
            weight_g=180,
            refrigerated=True,
        ),
        dict(id="gaze", name="Gaze estéril", weight_g=80, refrigerated=False),
    ]
    destinations = [
        ("Hospital Aurora", -23.600, -46.650),
        ("UBS Jardim Sul", -23.663, -46.730),
        ("Clínica Horizonte", -23.555, -46.690),
        ("Centro Vila Nova", -23.587, -46.622),
        ("Hospital Santa Clara", -23.530, -46.630),
        ("UBS Bela Vista", -23.565, -46.645),
        ("Unidade Santo Amaro", -23.650, -46.710),
        ("Clínica Pinheiros", -23.565, -46.705),
        ("Centro Liberdade", -23.564, -46.633),
        ("UBS Ipiranga", -23.600, -46.605),
        ("Hospital Leste", -23.560, -46.540),
        ("Unidade Norte", -23.495, -46.630),
        ("Clínica Campo Belo", -23.625, -46.670),
        ("Unidade Vila Mariana", -23.588, -46.636),
        ("Centro Brooklin", -23.610, -46.690),
        ("UBS Morumbi", -23.600, -46.725),
        ("Hospital Consolação", -23.550, -46.660),
        ("Clínica Saúde", -23.620, -46.640),
    ]
    orders = []
    for i, (name, lat, lng) in enumerate(destinations):
        orders.append(
            dict(
                id=f"PED-{i+1:03}",
                destination=name,
                location=dict(lat=lat, lng=lng),
                product_id=["soro", "vacina", "gaze"][i % 3],
                quantity=[120, 80, 150, 100, 100, 180][i % 6],
                priority=["urgent", "high", "normal", "high", "normal", "normal"][
                    i % 6
                ],
                window_start=[0, 30, 60, 0, 90, 120][i % 6],
                window_end=[180, 210, 300, 240, 360, 420][i % 6],
                service_minutes=10,
            )
        )
    batches = [
        dict(
            id="SR-01",
            product_id="soro",
            quantity=300,
            expires_on=today + timedelta(days=8),
        ),
        dict(
            id="SR-02",
            product_id="soro",
            quantity=450,
            expires_on=today + timedelta(days=90),
        ),
        dict(
            id="SR-VENC",
            product_id="soro",
            quantity=200,
            expires_on=today - timedelta(days=1),
        ),
        dict(
            id="RF-01",
            product_id="vacina",
            quantity=150,
            expires_on=today + timedelta(days=4),
        ),
        dict(
            id="RF-02",
            product_id="vacina",
            quantity=220,
            expires_on=today + timedelta(days=60),
        ),
        dict(
            id="GZ-01",
            product_id="gaze",
            quantity=1200,
            expires_on=today + timedelta(days=150),
        ),
    ]
    vehicles = [
        dict(
            id="V-01",
            name="VUC refrigerado",
            capacity_kg=220,
            refrigerated=True,
            cost_per_km_cents=340,
            fixed_cost_cents=8500,
        ),
        dict(
            id="V-02",
            name="Van urbana",
            capacity_kg=180,
            refrigerated=False,
            cost_per_km_cents=220,
            fixed_cost_cents=5000,
        ),
        dict(
            id="V-03",
            name="Furgão leve",
            capacity_kg=130,
            refrigerated=False,
            cost_per_km_cents=180,
            fixed_cost_cents=4000,
        ),
    ]
    return Scenario(
        name="Distribuição São Paulo · demonstração",
        planning_date=today,
        depot=dict(lat=-23.633, lng=-46.700),
        products=products,
        batches=batches,
        orders=orders,
        vehicles=vehicles,
    )
