export type Location = { lat: number; lng: number };
export type Product = {
  id: string;
  name: string;
  weight_g: number;
  refrigerated: boolean;
};
export type Batch = {
  id: string;
  product_id: string;
  quantity: number;
  expires_on: string;
};
export type Order = {
  id: string;
  destination: string;
  location: Location;
  product_id: string;
  quantity: number;
  priority: "normal" | "high" | "urgent";
  window_start: number;
  window_end: number;
  service_minutes: number;
};
export type Vehicle = {
  id: string;
  name: string;
  capacity_kg: number;
  refrigerated: boolean;
  cost_per_km_cents: number;
  fixed_cost_cents: number;
  shift_start: number;
  shift_end: number;
};
export type Scenario = {
  name: string;
  planning_date: string;
  depot: Location;
  products: Product[];
  batches: Batch[];
  orders: Order[];
  vehicles: Vehicle[];
  average_speed_kmh: number;
  road_factor: number;
};
export type ScenarioRecord = {
  id: string;
  version: number;
  updated_at: string;
  scenario: Scenario;
};
export type Stop = {
  order_id: string;
  arrival_min: number;
  departure_min: number;
};
export type Route = {
  vehicle_id: string;
  vehicle_name: string;
  start_min: number;
  end_min: number;
  distance_m: number;
  cost_cents: number;
  load_g: number;
  capacity_g: number;
  refrigerated: boolean;
  stops: Stop[];
};
export type Metrics = {
  served: number;
  unserved: number;
  total_orders: number;
  cost_cents: number;
  distance_m: number;
  vehicles_used: number;
  load_g: number;
  utilization_pct: number;
  urgent_served: number;
  urgent_total: number;
  objective_cents: number;
};
export type Plan = {
  method: string;
  routes: Route[];
  served_order_ids: string[];
  unserved_order_ids: string[];
  metrics: Metrics;
};
export type Result = {
  plan: Plan;
  baseline: Plan;
  allocations: {
    order_id: string;
    batch_id: string;
    product_id: string;
    quantity: number;
    expires_on: string;
  }[];
  unserved: {
    order_id: string;
    destination: string;
    priority: string;
    reason_code: string;
    reason: string;
  }[];
  execution: {
    elapsed_ms: number;
    time_limit_seconds: number;
    solver_status: string;
    verified: boolean;
    optimality_proven: boolean;
  };
  assumptions: {
    distance_model: string;
    average_speed_kmh: number;
    road_factor: number;
    time_origin: string;
    stock_policy: string;
    objective: string;
    penalties_cents: Record<string, number>;
  };
};
export type Run = {
  id: string;
  scenario_id: string;
  scenario_version: number;
  created_at: string;
  scenario_snapshot: Scenario;
  result: Result;
};
export type RunSummary = {
  id: string;
  scenario_id: string;
  scenario_version: number;
  created_at: string;
  name: string;
  metrics: Metrics;
};

export type Dispatch = {
  id: string;
  run_id: string;
  scenario_id: string;
  scenario_name: string;
  scenario_version: number;
  resulting_version: number;
  created_at: string;
  orders: Order[];
  order_count: number;
  unit_count: number;
  movements: {
    batch_id: string;
    product_id: string;
    quantity: number;
    before: number;
    after: number;
    expires_on: string;
  }[];
  allocations: Result["allocations"];
  routes: Route[];
  metrics: Metrics;
};
