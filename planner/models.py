"""API contracts: explicit units, bounded input and cross-reference validation."""

from datetime import date
from uuid import UUID
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, model_validator


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Location(Contract):
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lng: float = Field(ge=-180, le=180, allow_inf_nan=False)


class Product(Contract):
    id: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=100)
    weight_g: int = Field(ge=1, le=100000)
    refrigerated: bool = False


class Batch(Contract):
    id: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    product_id: str
    quantity: int = Field(ge=0, le=1000000)
    expires_on: date


class Order(Contract):
    id: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    destination: str = Field(min_length=1, max_length=100)
    location: Location
    product_id: str
    quantity: int = Field(ge=1, le=10000)
    priority: Literal["normal", "high", "urgent"] = "normal"
    window_start: int = Field(ge=0, le=720, description="Minutes after 08:00 São Paulo")
    window_end: int = Field(ge=0, le=720)
    service_minutes: int = Field(ge=1, le=60, default=8)

    @model_validator(mode="after")
    def ordered_window(self):
        if self.window_end < self.window_start:
            raise ValueError("O fim da janela deve ser posterior ao início.")
        return self


class Vehicle(Contract):
    id: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=80)
    capacity_kg: int = Field(ge=1, le=30000)
    refrigerated: bool = False
    cost_per_km_cents: int = Field(ge=1, le=10000, default=240)
    fixed_cost_cents: int = Field(ge=0, le=1000000, default=5000)
    shift_start: int = Field(ge=0, le=720, default=0)
    shift_end: int = Field(ge=0, le=720, default=540)

    @model_validator(mode="after")
    def ordered_shift(self):
        if self.shift_end <= self.shift_start:
            raise ValueError("O turno do veículo deve ter duração positiva.")
        return self


class Scenario(Contract):
    name: str = Field(min_length=1, max_length=100)
    planning_date: date
    depot: Location
    products: list[Product] = Field(min_length=1, max_length=30)
    batches: list[Batch] = Field(max_length=200)
    orders: list[Order] = Field(max_length=60)
    vehicles: list[Vehicle] = Field(min_length=1, max_length=10)
    average_speed_kmh: int = Field(ge=5, le=80, default=28)
    road_factor: float = Field(ge=1, le=2, default=1.25, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_references(self):
        for collection in (self.products, self.batches, self.orders, self.vehicles):
            ids = [item.id for item in collection]
            if len(ids) != len(set(ids)):
                raise ValueError("Identificadores repetidos na mesma coleção.")
        products = {p.id for p in self.products}
        if any(x.product_id not in products for x in [*self.orders, *self.batches]):
            raise ValueError("Pedido ou lote faz referência a produto inexistente.")
        return self


class UpdateScenario(Contract):
    expected_version: int = Field(ge=1)
    scenario: Scenario


class PlanRequest(Contract):
    expected_version: int = Field(ge=1)
    max_seconds: int = Field(ge=1, le=10, default=3)


class DispatchRequest(Contract):
    expected_scenario_version: int = Field(ge=1)
    idempotency_key: UUID
