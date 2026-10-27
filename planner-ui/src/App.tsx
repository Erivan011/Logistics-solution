import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  FlaskConical,
  History,
  Layers3,
  LayoutDashboard,
  MapPin,
  PackageCheck,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Settings2,
  ShieldCheck,
  Snowflake,
  Truck,
  TriangleAlert,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import type {
  Scenario,
  ScenarioRecord,
  Run,
  RunSummary,
  Order,
  Route,
  Metrics,
  Dispatch,
} from "./types";
const COLORS = [
  "#228578",
  "#c88a48",
  "#707cc4",
  "#be6f88",
  "#428eb3",
  "#80a65f",
  "#a579c3",
  "#b28253",
  "#619fa2",
  "#8e8a68",
];
const BRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
const NUM = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
const KM = (m: number) =>
  (m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km";
const HOUR = (min: number) =>
  `${String(8 + Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const PRIORITY = { urgent: "Urgente", high: "Alta", normal: "Normal" };
function parseError(data: unknown): string {
  const d = data as {
    detail?: string | { loc: (string | number)[]; msg: string }[];
  };
  return typeof d.detail === "string"
    ? d.detail
    : Array.isArray(d.detail)
      ? d.detail
          .map((e) => `${e.loc.slice(1).join(" → ")}: ${e.msg}`)
          .join("\n")
      : "Não foi possível concluir a operação.";
}
function App() {
  const [records, setRecords] = useState<ScenarioRecord[]>([]),
    [selectedId, setSelectedId] = useState(""),
    [run, setRun] = useState<Run | null>(null),
    [history, setHistory] = useState<RunSummary[]>([]);
  const [tab, setTab] = useState("overview"),
    [loading, setLoading] = useState(true),
    [solving, setSolving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [activeRoute, setActiveRoute] = useState<string | null>(null),
    [activeOrder, setActiveOrder] = useState<string | null>(null),
    [query, setQuery] = useState("");
  const [modal, setModal] = useState<
      "edit" | "simulate" | "dispatch" | "auth" | null
    >(null),
    [draft, setDraft] = useState<Scenario | null>(null),
    [editTab, setEditTab] = useState("orders"),
    [saving, setSaving] = useState(false),
    [modalError, setModalError] = useState("");
  const [publicDemo, setPublicDemo] = useState(false);
  const [token, setToken] = useState(""),
    [authInput, setAuthInput] = useState(""),
    [compare, setCompare] = useState<string[]>([]),
    [allRuns, setAllRuns] = useState<Record<string, Run>>({});
  const [simulation, setSimulation] = useState({
      name: "",
      demand: 100,
      speed: 28,
      capacity: 100,
      extraCold: false,
    }),
    [searchStatus, setSearchStatus] = useState("all");
  const [dispatchRecords, setDispatchRecords] = useState<Dispatch[]>([]);
  const [dispatchKey, setDispatchKey] = useState("");
  const [expandedDispatch, setExpandedDispatch] = useState<string | null>(null);
  const selected = records.find((r) => r.id === selectedId);
  const scenario = run?.scenario_snapshot ?? selected?.scenario;
  const routes = run?.result.plan.routes ?? [],
    metrics = run?.result.plan.metrics;
  async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
    if (publicDemo && options.method && options.method !== "GET") {
      throw new Error(
        "A demonstração pública é somente leitura. Use o acesso administrativo para alterar a operação.",
      );
    }
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    if (response.status === 401) {
      setModal("auth");
      throw new Error("A operação exige um token de acesso.");
    }
    const body = await response.json();
    if (!response.ok) throw new Error(parseError(body));
    return body.data as T;
  }
  async function load() {
    setLoading(true);
    setError("");
    try {
      if (!token) {
        const healthResponse = await fetch("/api/health");
        if (!healthResponse.ok)
          throw new Error("Não foi possível verificar o acesso ao servidor.");
        const health: { authentication_required: boolean } =
          await healthResponse.json();
        if (health.authentication_required) {
          const demo = await api<Run>("/api/demo");
          setPublicDemo(true);
          setRecords([
            {
              id: demo.scenario_id,
              version: demo.scenario_version,
              updated_at: demo.created_at,
              scenario: demo.scenario_snapshot,
            },
          ]);
          setSelectedId(demo.scenario_id);
          setRun(demo);
          setHistory([
            {
              id: demo.id,
              scenario_id: demo.scenario_id,
              scenario_version: demo.scenario_version,
              created_at: demo.created_at,
              name: demo.scenario_snapshot.name,
              metrics: demo.result.plan.metrics,
            },
          ]);
          setAllRuns({ [demo.id]: demo });
          setDispatchRecords([]);
          return;
        }
      }
      const [items, runs, dispatchList] = await Promise.all([
        api<ScenarioRecord[]>("/api/scenarios"),
        api<RunSummary[]>("/api/runs"),
        api<Dispatch[]>("/api/dispatches"),
      ]);
      if (publicDemo) {
        setRun(null);
        setAllRuns({});
      }
      setPublicDemo(false);
      setRecords(items);
      setHistory(runs);
      setDispatchRecords(dispatchList);
      setSelectedId((current) =>
        items.some((r) => r.id === current) ? current : (items[0]?.id ?? ""),
      );
      if (!selectedId && items[0]) {
        const recent = runs.find(
          (r) =>
            r.scenario_id === items[0].id &&
            r.scenario_version === items[0].version,
        );
        if (recent) setRun(await api<Run>(`/api/runs/${recent.id}`));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [token]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>("[role=dialog]");
    dialog?.querySelector<HTMLElement>("input,button,select")?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setModal(null);
      if (event.key === "Tab" && dialog) {
        const nodes = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ),
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [modal, saving]);
  async function plan(record = selected) {
    if (!record || publicDemo) return;
    setSolving(true);
    setError("");
    setActiveRoute(null);
    setActiveOrder(null);
    try {
      const value = await api<Run>(`/api/scenarios/${record.id}/plan`, {
        method: "POST",
        body: JSON.stringify({
          expected_version: record.version,
          max_seconds: 3,
        }),
      });
      setRun(value);
      setAllRuns((prev) => ({ ...prev, [value.id]: value }));
      setHistory(await api<RunSummary[]>("/api/runs"));
      setNotice("Plano calculado, verificado e salvo no histórico.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSolving(false);
    }
  }
  function selectScenario(id: string) {
    setSelectedId(id);
    setRun(null);
    setActiveRoute(null);
    setActiveOrder(null);
    setQuery("");
    setSearchStatus("all");
  }
  async function openRun(id: string) {
    try {
      const value = allRuns[id] ?? (await api<Run>(`/api/runs/${id}`));
      setRun(value);
      setSelectedId(value.scenario_id);
      setAllRuns((prev) => ({ ...prev, [id]: value }));
      setActiveRoute(null);
      setActiveOrder(null);
      setTab("overview");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function openEditor() {
    if (!selected || publicDemo) return;
    setDraft(structuredClone(selected.scenario));
    setEditTab("orders");
    setModalError("");
    setModal("edit");
  }
  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!selected || !draft) return;
    setSaving(true);
    setModalError("");
    try {
      const value = await api<ScenarioRecord>(`/api/scenarios/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({
          expected_version: selected.version,
          scenario: draft,
        }),
      });
      setRecords((prev) => prev.map((r) => (r.id === value.id ? value : r)));
      setRun(null);
      setModal(null);
      setNotice(
        `Cenário salvo como versão ${value.version}. Gere um novo plano para os dados atualizados.`,
      );
    } catch (e) {
      setModalError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function simulate(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setModalError("");
    try {
      const copy = structuredClone(selected.scenario);
      copy.name = simulation.name.trim();
      copy.average_speed_kmh = simulation.speed;
      copy.orders = copy.orders.map((o) => ({
        ...o,
        quantity: Math.max(
          1,
          Math.round((o.quantity * simulation.demand) / 100),
        ),
      }));
      copy.vehicles = copy.vehicles.map((v) => ({
        ...v,
        capacity_kg: Math.max(
          1,
          Math.round((v.capacity_kg * simulation.capacity) / 100),
        ),
      }));
      if (simulation.extraCold) {
        if (copy.vehicles.length >= 10)
          throw new Error("O limite é de 10 veículos por cenário.");
        copy.vehicles.push({
          ...copy.vehicles[0],
          id: `EXTRA-${copy.vehicles.length}`,
          name: "Veículo refrigerado adicional",
          refrigerated: true,
        });
      }
      const value = await api<ScenarioRecord>("/api/scenarios", {
        method: "POST",
        body: JSON.stringify(copy),
      });
      setRecords((prev) => [value, ...prev]);
      selectScenario(value.id);
      setModal(null);
      setTab("overview");
      await plan(value);
    } catch (e) {
      setModalError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function exportRun(kind: "csv" | "json") {
    if (!run) return;
    try {
      let blob: Blob;
      if (kind === "csv") {
        const response = await fetch(
          publicDemo
            ? "/api/demo/export.csv"
            : `/api/runs/${run.id}/export.csv`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );
        if (!response.ok) throw new Error("Falha na exportação.");
        blob = await response.blob();
      } else
        blob = new Blob([JSON.stringify(run, null, 2)], {
          type: "application/json",
        });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `plano-${run.id.slice(0, 8)}.${kind}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const stock = useMemo(
    () =>
      scenario
        ? scenario.products.map((p) => {
            const batches = scenario.batches.filter(
              (b) => b.product_id === p.id,
            );
            const valid = batches
              .filter((b) => b.expires_on >= scenario.planning_date)
              .reduce((n, b) => n + b.quantity, 0);
            const demand = scenario.orders
              .filter((o) => o.product_id === p.id)
              .reduce((n, o) => n + o.quantity, 0);
            return {
              ...p,
              valid,
              demand,
              expired: batches
                .filter((b) => b.expires_on < scenario.planning_date)
                .reduce((n, b) => n + b.quantity, 0),
            };
          })
        : [],
    [scenario],
  );
  const expired = stock.reduce((n, p) => n + p.expired, 0),
    shortage = stock.filter((p) => p.demand > p.valid).length;
  const filteredOrders = (scenario?.orders ?? []).filter(
    (o) =>
      `${o.id} ${o.destination}`.toLowerCase().includes(query.toLowerCase()) &&
      (searchStatus === "all" ||
        (searchStatus === "served" &&
          run?.result.plan.served_order_ids.includes(o.id)) ||
        (searchStatus === "unserved" &&
          run?.result.plan.unserved_order_ids.includes(o.id))),
  );
  const selectedOrder = scenario?.orders.find((o) => o.id === activeOrder),
    selectedOrderRoute = routes.find((r) =>
      r.stops.some((s) => s.order_id === activeOrder),
    );
  function changeDraft(
    collection: "orders" | "vehicles" | "batches",
    index: number,
    key: string,
    value: unknown,
  ) {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            [collection]: prev[collection].map((item, i) =>
              i === index ? { ...item, [key]: value } : item,
            ),
          }
        : null,
    );
  }
  function addDraftItem() {
    setDraft((prev) => {
      if (!prev) return prev;
      const id = crypto.randomUUID().slice(0, 8);
      if (editTab === "orders")
        return {
          ...prev,
          orders: [
            ...prev.orders,
            {
              id: "PED-" + id,
              destination: "Novo destino",
              location: { ...prev.depot },
              product_id: prev.products[0].id,
              quantity: 10,
              priority: "normal",
              window_start: 0,
              window_end: 420,
              service_minutes: 10,
            },
          ],
        };
      if (editTab === "batches")
        return {
          ...prev,
          batches: [
            ...prev.batches,
            {
              id: "LT-" + id,
              product_id: prev.products[0].id,
              quantity: 100,
              expires_on: prev.planning_date,
            },
          ],
        };
      return {
        ...prev,
        vehicles: [
          ...prev.vehicles,
          {
            id: "V-" + id,
            name: "Novo veículo",
            capacity_kg: 150,
            refrigerated: false,
            cost_per_km_cents: 240,
            fixed_cost_cents: 5000,
            shift_start: 0,
            shift_end: 540,
          },
        ],
      };
    });
  }
  const todayInSaoPaulo = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  const alreadyDispatched = Boolean(
    run && dispatchRecords.some((d) => d.run_id === run.id),
  );
  const canDispatch = Boolean(
    !publicDemo &&
      run &&
      selected &&
      run.scenario_id === selected.id &&
      run.scenario_version === selected.version &&
      !alreadyDispatched &&
      run.result.plan.metrics.served > 0 &&
      run.scenario_snapshot.planning_date === todayInSaoPaulo,
  );
  const historical = Boolean(
    run && selected && run.scenario_version !== selected.version,
  );
  function openDispatch() {
    setDispatchKey(crypto.randomUUID());
    setModalError("");
    setModal("dispatch");
  }
  async function confirmDispatch(event: FormEvent) {
    event.preventDefault();
    if (!run || !selected || !dispatchKey) return;
    setSaving(true);
    setModalError("");
    try {
      const value = await api<{
        dispatch: Dispatch;
        scenario: ScenarioRecord;
        replayed: boolean;
      }>(`/api/runs/${run.id}/dispatch`, {
        method: "POST",
        body: JSON.stringify({
          expected_scenario_version: run.scenario_version,
          idempotency_key: dispatchKey,
        }),
      });
      setRecords((prev) =>
        prev.map((r) => (r.id === value.scenario.id ? value.scenario : r)),
      );
      setDispatchRecords((prev) => [
        value.dispatch,
        ...prev.filter((d) => d.id !== value.dispatch.id),
      ]);
      setRun(null);
      setModal(null);
      setExpandedDispatch(value.dispatch.id);
      setTab("dispatches");
      setNotice(
        value.replayed
          ? "Confirmação anterior recuperada. Nenhuma baixa foi repetida."
          : `Expedição registrada: ${value.dispatch.order_count} pedidos e ${NUM(value.dispatch.unit_count)} unidades.`,
      );
    } catch (e) {
      setModalError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const comparisonRuns = compare
    .map((id) => history.find((r) => r.id === id))
    .filter((r): r is RunSummary => Boolean(r));
  if (loading && !records.length)
    return (
      <div className="loading-screen">
        <div className="logo-icon">
          <Layers3 size={25} />
        </div>
        <h1>Logistics Intelligence</h1>
        <p>Carregando sua central de planejamento…</p>
      </div>
    );
  return (
    <div className="app-shell">
      <a className="skip" href="#content">
        Pular para o conteúdo
      </a>
      <aside className="sidebar">
        <a className="brand" href="/">
          <div className="logo-icon">
            <Layers3 size={24} />
          </div>
          <div>
            logistics<span>INTELLIGENCE</span>
          </div>
        </a>
        <div className="workspace-label">
          <span className="workspace-square">SP</span>
          <div>
            Operação São Paulo<small>Ambiente de demonstração</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <p className="nav-label">CENTRAL DE OPERAÇÕES</p>
        <nav aria-label="Navegação principal">
          {[
            ["overview", LayoutDashboard, "Visão geral"],
            ["orders", PackageCheck, "Pedidos"],
            ["inventory", Box, "Estoque & frota"],
            ["history", FlaskConical, "Cenários & histórico"],
            ["dispatches", Truck, "Expedições"],
          ].map(([id, Icon, label]) => {
            const I = Icon as typeof LayoutDashboard;
            return (
              <button
                key={id as string}
                className={`nav-item ${tab === id ? "active" : ""}`}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => setTab(id as string)}
              >
                <I size={18} />
                <span>{label as string}</span>
                {id === "orders" && (
                  <small>{scenario?.orders.length ?? 0}</small>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="solver-status">
            <i /> Motor de otimização disponível
            <small>OR-Tools · Restrições verificadas</small>
          </div>
          <div className="profile">
            <span className="avatar">ES</span>
            <div>
              Erivan Santos<small>Portfólio de engenharia</small>
            </div>
            <button
              aria-label="Configurar acesso"
              onClick={() => {
                setModalError("");
                setModal("auth");
              }}
            >
              <Settings2 size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="crumb">
            Workspace <ChevronRight size={12} />
            <strong>Planejamento logístico</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-tag">
              <i /> DADOS SINTÉTICOS
            </span>
            <span className="date-top">
              {scenario?.planning_date.split("-").reverse().join("/")}
            </span>
            <span className="avatar small">ES</span>
          </div>
        </header>
        <main id="content">
          {publicDemo && (
            <section
              className="public-demo-banner"
              aria-label="Demonstração pública"
            >
              <div>
                <span className="eyebrow">
                  DEMONSTRAÇÃO PÚBLICA · SEM CADASTRO
                </span>
                <h2>Explore uma operação planejada.</h2>
                <p>
                  Dados fictícios e resultado registrado em{" "}
                  {scenario?.planning_date.split("-").reverse().join("/")}.
                  Navegue pelas rotas, filtre pedidos, confira lotes FEFO e
                  exporte o plano. Edição, novos cálculos e expedição exigem
                  acesso administrativo.
                </p>
              </div>
              <div className="public-demo-links">
                <a
                  href="https://github.com/Erivan011/Logistics-solution"
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver código no GitHub <ArrowUpRight size={14} />
                </a>
                <button
                  className="text-button"
                  onClick={() => setModal("auth")}
                >
                  <ShieldCheck size={14} /> Acesso administrativo
                </button>
              </div>
            </section>
          )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">LOGÍSTICA QUE PENSA À FRENTE</p>
              <h1>
                {tab === "overview" ? (
                  <>
                    Menos incerteza.
                    <br className="mobile-br" /> Mais <span>inteligência.</span>
                  </>
                ) : tab === "orders" ? (
                  "Cada pedido, uma prioridade."
                ) : tab === "inventory" ? (
                  "Os recursos por trás da operação."
                ) : tab === "dispatches" ? (
                  "Cada baixa, um registro."
                ) : (
                  "Experimente. Compare. Decida."
                )}
              </h1>
              <p className="subtitle">
                {tab === "overview"
                  ? "Planeje rotas, proteja o estoque e encontre o melhor uso da sua frota."
                  : tab === "orders"
                    ? "Janelas de atendimento, quantidades e prioridades em um só lugar."
                    : tab === "inventory"
                      ? "Lotes, validade, refrigeração e capacidade de transporte."
                      : tab === "dispatches"
                        ? "Baixas por lote, pedidos expedidos e histórico de confirmação."
                        : "Simulações preservam o cenário original e ficam salvas para comparação."}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="secondary"
                onClick={() => {
                  if (selected) {
                    setSimulation({
                      name: `${selected.scenario.name} · alternativa`,
                      demand: 100,
                      speed: selected.scenario.average_speed_kmh,
                      capacity: 100,
                      extraCold: false,
                    });
                    setModalError("");
                    setModal("simulate");
                  }
                }}
                disabled={publicDemo || !selected || solving}
              >
                <FlaskConical size={15} /> Simular cenário
              </button>
              <button
                className="primary"
                disabled={publicDemo || !selected || solving}
                onClick={() => plan()}
              >
                <Zap size={15} />
                {solving ? "Calculando plano…" : "Otimizar plano"}
                {!solving && <ArrowUpRight size={15} />}
              </button>
            </div>
          </div>
          <div className="scenario-bar">
            <div className="scenario-choice">
              <span className="scenario-icon">
                <Layers3 size={16} />
              </span>
              <label>
                <span>CENÁRIO ATIVO</span>
                <select
                  value={selectedId}
                  onChange={(e) => selectScenario(e.target.value)}
                  aria-label="Cenário ativo"
                  disabled={solving}
                >
                  {records.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.scenario.name}
                    </option>
                  ))}
                </select>
              </label>
              <span className="version-tag">v{selected?.version ?? "—"}</span>
            </div>
            <div className="scenario-actions">
              {run ? (
                <span className="run-stamp">
                  <CheckCheck size={13} /> Plano salvo · v{run.scenario_version}{" "}
                  ·{" "}
                  {new Date(run.created_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : (
                <span className="run-stamp">Pronto para planejar</span>
              )}
              <button
                className="text-button"
                onClick={openEditor}
                disabled={publicDemo || !selected || solving}
              >
                <Settings2 size={14} /> Editar dados
              </button>
            </div>
          </div>
          {error && (
            <div className="error" role="alert">
              <TriangleAlert size={17} />
              <span>{error}</span>
              <button onClick={load}>Recarregar</button>
            </div>
          )}
          {solving && (
            <div className="progress-note" role="status">
              <span className="spinner" /> Comparando rotas com capacidade,
              estoque, janelas e refrigeração. O resultado será validado antes
              de ser salvo.
            </div>
          )}
          {!scenario ? (
            <section className="panel empty">
              <h2>Nenhum cenário disponível</h2>
              <p>
                Configure os dados de demonstração do servidor para começar.
              </p>
            </section>
          ) : (
            <>
              {historical && (
                <div className="historical-banner">
                  <History size={16} />
                  <span>
                    Plano histórico da versão {run!.scenario_version}. Os dados
                    abaixo são o snapshot dessa execução; a operação atual está
                    na versão {selected!.version}.
                  </span>
                  <button className="text-button" onClick={() => setRun(null)}>
                    Ver operação atual <ArrowRight size={13} />
                  </button>
                </div>
              )}
              <section
                className="metrics"
                aria-label="Indicadores do planejamento"
              >
                <Metric
                  title="Pedidos atendidos"
                  value={
                    metrics ? `${metrics.served}` : `${scenario.orders.length}`
                  }
                  suffix={metrics ? `/ ${metrics.total_orders}` : "pedidos"}
                  icon={<PackageCheck size={18} />}
                  foot={
                    metrics
                      ? `${metrics.unserved} não alocados · veja os motivos`
                      : "Disponíveis para o próximo plano"
                  }
                  positive={
                    metrics
                      ? `${Math.round((metrics.served / Math.max(1, metrics.total_orders)) * 100)}% de atendimento`
                      : undefined
                  }
                />
                <Metric
                  title="Custo estimado do plano"
                  value={metrics ? BRL(metrics.cost_cents) : "—"}
                  icon={<Wallet size={18} />}
                  foot={
                    run
                      ? `Referência simples: ${BRL(run.result.baseline.metrics.cost_cents)}`
                      : "Calcule o plano para comparar custos"
                  }
                  positive={
                    run &&
                    run.result.plan.metrics.served ===
                      run.result.baseline.metrics.served &&
                    run.result.baseline.metrics.cost_cents > metrics!.cost_cents
                      ? `${Math.round((1 - metrics!.cost_cents / run.result.baseline.metrics.cost_cents) * 100)}% menor`
                      : undefined
                  }
                />
                <Metric
                  title="Ocupação da frota utilizada"
                  value={metrics ? `${metrics.utilization_pct}%` : "—"}
                  icon={<Truck size={18} />}
                  foot={
                    metrics
                      ? `${metrics.vehicles_used} veículos · ${KM(metrics.distance_m)}`
                      : `${scenario.vehicles.length} veículos · ${scenario.vehicles.reduce((n, v) => n + v.capacity_kg, 0)} kg disponíveis`
                  }
                />
                <Metric
                  title="Prioridades urgentes"
                  value={
                    metrics
                      ? `${metrics.urgent_served}`
                      : `${scenario.orders.filter((o) => o.priority === "urgent").length}`
                  }
                  suffix={metrics ? `/ ${metrics.urgent_total}` : "pedidos"}
                  icon={<Activity size={18} />}
                  foot={
                    metrics
                      ? "Atendimento dentro da janela exigida"
                      : "Prioridade ponderada no planejamento"
                  }
                  positive={
                    metrics && metrics.urgent_served === metrics.urgent_total
                      ? "Todas atendidas"
                      : undefined
                  }
                />
              </section>
              {tab === "overview" && (
                <>
                  <div className="operations-grid">
                    <section className="panel map-panel">
                      <div className="panel-head">
                        <div>
                          <div className="section-title">
                            <span className="live-dot" />
                            <h2>Visão da distribuição</h2>
                          </div>
                          <p>
                            São Paulo ·{" "}
                            {routes.length
                              ? `${routes.length} rotas planejadas`
                              : "pontos de entrega do cenário"}
                          </p>
                        </div>
                        <span className="light-tag">
                          {run ? "PLANO VERIFICADO" : "AGUARDANDO PLANO"}
                        </span>
                      </div>
                      <RouteMap
                        scenario={scenario}
                        routes={routes}
                        active={activeRoute}
                        selectedOrder={activeOrder}
                        onSelect={setActiveOrder}
                      />
                      <div className="map-bottom">
                        <div className="legend">
                          <span>
                            <i className="depot-dot" /> Centro de distribuição
                          </span>
                          {routes.map((r, i) => (
                            <button
                              key={r.vehicle_id}
                              onClick={() =>
                                setActiveRoute(
                                  activeRoute === r.vehicle_id
                                    ? null
                                    : r.vehicle_id,
                                )
                              }
                              className={
                                activeRoute === r.vehicle_id ? "chosen" : ""
                              }
                            >
                              <i
                                style={{
                                  background: COLORS[i % COLORS.length],
                                }}
                              />
                              {r.vehicle_id}
                            </button>
                          ))}
                        </div>
                        <span>
                          Coordenadas demonstrativas · traçado esquemático
                        </span>
                      </div>
                    </section>
                    <section className="panel dispatch-panel">
                      <div className="panel-head">
                        <div>
                          <h2>Plano de expedição</h2>
                          <p>Da capacidade à última parada.</p>
                        </div>
                        <span className="count">{routes.length}</span>
                      </div>
                      <div className="route-list">
                        {routes.length ? (
                          routes.map((r, i) => (
                            <button
                              key={r.vehicle_id}
                              className={`route-card ${activeRoute === r.vehicle_id ? "selected" : ""}`}
                              onClick={() =>
                                setActiveRoute(
                                  activeRoute === r.vehicle_id
                                    ? null
                                    : r.vehicle_id,
                                )
                              }
                            >
                              <div className="route-card-top">
                                <span
                                  className="truck-symbol"
                                  style={{
                                    color: COLORS[i % COLORS.length],
                                    background:
                                      COLORS[i % COLORS.length] + "12",
                                  }}
                                >
                                  <Truck size={18} />
                                </span>
                                <div>
                                  <strong>{r.vehicle_name}</strong>
                                  <small>
                                    {r.vehicle_id} · {r.stops.length} paradas
                                    {r.refrigerated ? " · Refrigerado" : ""}
                                  </small>
                                </div>
                                <ArrowUpRight size={15} />
                              </div>
                              <div className="route-stats">
                                <span>
                                  {KM(r.distance_m)}
                                  <small>Distância estimada</small>
                                </span>
                                <span>
                                  {BRL(r.cost_cents)}
                                  <small>Custo da rota</small>
                                </span>
                                <span>
                                  {HOUR(r.end_min)}
                                  <small>Retorno previsto</small>
                                </span>
                              </div>
                              <div className="capacity-label">
                                <span>
                                  {(r.load_g / 1000).toLocaleString("pt-BR")} /{" "}
                                  {r.capacity_g / 1000} kg
                                </span>
                                <strong>
                                  {Math.round((r.load_g / r.capacity_g) * 100)}%
                                </strong>
                              </div>
                              <div className="capacity-track">
                                <i
                                  style={{
                                    width: `${(r.load_g / r.capacity_g) * 100}%`,
                                    background: COLORS[i % COLORS.length],
                                  }}
                                />
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="plan-empty">
                            <RouteIcon size={35} />
                            <h3>Seu próximo plano começa aqui.</h3>
                            <p>
                              Clique em Otimizar plano para distribuir os
                              pedidos e visualizar as rotas.
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="dispatch-footer">
                        <ShieldCheck size={14} />
                        {run
                          ? "Capacidade, estoque e horários verificados"
                          : "Restrições verificadas após o cálculo"}
                      </div>
                    </section>
                  </div>
                  {selectedOrder && (
                    <section className="panel selected-order">
                      <div>
                        <span className="eyebrow">
                          PONTO SELECIONADO · {selectedOrder.id}
                        </span>
                        <h3>{selectedOrder.destination}</h3>
                        <p>
                          {PRIORITY[selectedOrder.priority]} ·{" "}
                          {HOUR(selectedOrder.window_start)}–
                          {HOUR(selectedOrder.window_end)} ·{" "}
                          {selectedOrder.quantity} unidades
                        </p>
                      </div>
                      <span>
                        {selectedOrderRoute
                          ? `${selectedOrderRoute.vehicle_name} · chegada ${HOUR(selectedOrderRoute.stops.find((s) => s.order_id === activeOrder)!.arrival_min)}`
                          : run
                            ? "Pedido não alocado"
                            : "Aguardando planejamento"}
                      </span>
                      <button
                        className="icon-button"
                        aria-label="Fechar ponto selecionado"
                        onClick={() => setActiveOrder(null)}
                      >
                        <X size={16} />
                      </button>
                    </section>
                  )}
                  <section className="insight-grid">
                    <div className="insight-card">
                      <div className="insight-icon amber">
                        <TriangleAlert size={18} />
                      </div>
                      <div>
                        <span>ESTOQUE EM ATENÇÃO</span>
                        <h3>
                          {shortage}{" "}
                          {shortage === 1
                            ? "produto com demanda superior ao saldo"
                            : "produtos com demanda superior ao saldo"}
                        </h3>
                        <p>
                          O otimizador não aloca mais unidades do que o estoque
                          válido.
                        </p>
                      </div>
                      <button
                        aria-label="Ver estoque"
                        onClick={() => setTab("inventory")}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                    <div className="insight-card">
                      <div className="insight-icon teal">
                        <Layers3 size={18} />
                      </div>
                      <div>
                        <span>SEPARAÇÃO INTELIGENTE</span>
                        <h3>
                          {run
                            ? `${run.result.allocations.length} alocações de lote via FEFO`
                            : "Primeiro a vencer, primeiro a sair"}
                        </h3>
                        <p>
                          {expired
                            ? `${NUM(expired)} unidades vencidas excluídas do planejamento.`
                            : "Lotes válidos ordenados pela data de vencimento."}
                        </p>
                      </div>
                      <button
                        aria-label="Ver alocações"
                        onClick={() => setTab("inventory")}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                  </section>
                  {run && (
                    <section className="panel comparison-panel">
                      <div className="panel-head">
                        <div>
                          <h2>O que mudou com o planejamento?</h2>
                          <p>
                            Comparação com regra simples de prioridade, prazo e
                            menor custo de inclusão.
                          </p>
                        </div>
                        <span className="light-tag">MESMAS RESTRIÇÕES</span>
                      </div>
                      <div className="comparison-metrics">
                        {[
                          [
                            "Pedidos atendidos",
                            run.result.baseline.metrics.served,
                            metrics!.served,
                          ],
                          [
                            "Distância estimada",
                            KM(run.result.baseline.metrics.distance_m),
                            KM(metrics!.distance_m),
                          ],
                          [
                            "Custo de transporte",
                            BRL(run.result.baseline.metrics.cost_cents),
                            BRL(metrics!.cost_cents),
                          ],
                          [
                            "Urgentes atendidos",
                            run.result.baseline.metrics.urgent_served,
                            metrics!.urgent_served,
                          ],
                        ].map(([label, before, after]) => (
                          <div key={label as string}>
                            <span>{label}</span>
                            <p>
                              <del>{before}</del>
                              <ArrowRight size={14} />
                              <strong>{after}</strong>
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="method-note">
                        <FlaskConical size={14} />
                        <p>
                          Método escolhido:{" "}
                          {run.result.plan.method === "ortools_vrptw"
                            ? "OR-Tools com busca local"
                            : "regra simples (melhor objetivo encontrado)"}
                          . Busca limitada a{" "}
                          {run.result.execution.time_limit_seconds}s; ótimo
                          global não comprovado. Simulação não altera o estoque.
                        </p>
                      </div>
                    </section>
                  )}
                </>
              )}
              {(tab === "orders" || tab === "overview") && (
                <section className="panel orders-panel">
                  <div className="panel-head">
                    <div>
                      <h2>
                        {tab === "overview"
                          ? "Fila de atendimento"
                          : "Pedidos do cenário"}{" "}
                        <span className="count">{scenario.orders.length}</span>
                      </h2>
                      <p>
                        {run
                          ? "Resultado do plano salvo; clique no pedido para inspecionar."
                          : "Pedidos disponíveis para a próxima execução."}
                      </p>
                    </div>
                    <div className="inline-actions">
                      <button className="text-button" onClick={openEditor}>
                        <Plus size={14} /> Gerenciar pedidos
                      </button>
                      <button
                        className="secondary"
                        onClick={() => exportRun("csv")}
                        disabled={!run}
                      >
                        <ArrowDownToLine size={14} /> Exportar
                      </button>
                    </div>
                  </div>
                  <div className="filters">
                    <input
                      aria-label="Buscar pedidos"
                      placeholder="Buscar pedido ou destino…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <select
                      aria-label="Filtrar atendimento"
                      value={searchStatus}
                      onChange={(e) => setSearchStatus(e.target.value)}
                      disabled={!run}
                    >
                      <option value="all">Todos os pedidos</option>
                      <option value="served">Atendidos</option>
                      <option value="unserved">Não alocados</option>
                    </select>
                    <span>Janela = horário de chegada permitido</span>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>PEDIDO / DESTINO</th>
                          <th>PRODUTO · QUANTIDADE</th>
                          <th>JANELA</th>
                          <th>PRIORIDADE</th>
                          <th>ATENDIMENTO</th>
                          <th>CHEGADA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders
                          .slice(0, tab === "overview" ? 6 : 60)
                          .map((o) => {
                            const route = routes.find((r) =>
                                r.stops.some((stop) => stop.order_id === o.id),
                              ),
                              stop = route?.stops.find(
                                (s) => s.order_id === o.id,
                              );
                            return (
                              <tr
                                key={o.id}
                                className={
                                  activeOrder === o.id ? "selected-row" : ""
                                }
                                onClick={() => {
                                  setActiveOrder(o.id);
                                  setTab("overview");
                                }}
                              >
                                <td>
                                  <strong>{o.destination}</strong>
                                  <small>{o.id}</small>
                                </td>
                                <td>
                                  {
                                    scenario.products.find(
                                      (p) => p.id === o.product_id,
                                    )?.name
                                  }
                                  <small>
                                    {NUM(o.quantity)} unidades
                                    {scenario.products.find(
                                      (p) => p.id === o.product_id,
                                    )?.refrigerated
                                      ? " · Refrigeração exigida"
                                      : ""}
                                  </small>
                                </td>
                                <td>
                                  {HOUR(o.window_start)}–{HOUR(o.window_end)}
                                </td>
                                <td>
                                  <span className={`priority ${o.priority}`}>
                                    {PRIORITY[o.priority]}
                                  </span>
                                </td>
                                <td>
                                  <span
                                    className={`status-tag ${route ? "served" : run ? "unserved" : "pending"}`}
                                  >
                                    {route
                                      ? route.vehicle_id
                                      : run
                                        ? "Não alocado"
                                        : "A planejar"}
                                  </span>
                                </td>
                                <td>{stop ? HOUR(stop.arrival_min) : "—"}</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                    {!filteredOrders.length && (
                      <div className="empty">
                        Nenhum pedido corresponde à busca.
                      </div>
                    )}
                  </div>
                  <div className="table-footer">
                    <span>
                      {Math.min(
                        filteredOrders.length,
                        tab === "overview" ? 6 : 60,
                      )}{" "}
                      de {filteredOrders.length} pedidos exibidos
                    </span>
                    {tab === "overview" && (
                      <button
                        className="text-button"
                        onClick={() => setTab("orders")}
                      >
                        Ver todos os pedidos <ArrowRight size={13} />
                      </button>
                    )}
                  </div>
                </section>
              )}
              {run &&
                (tab === "overview" || tab === "orders") &&
                run.result.unserved.length > 0 && (
                  <section className="panel exception-panel">
                    <div className="panel-head">
                      <div>
                        <h2>
                          <TriangleAlert size={17} /> Pedidos não alocados
                        </h2>
                        <p>
                          Razões comprováveis são separadas de limitações
                          combinadas da solução.
                        </p>
                      </div>
                      <span className="count amber-count">
                        {run.result.unserved.length}
                      </span>
                    </div>
                    {run.result.unserved.map((o) => (
                      <div className="exception-row" key={o.order_id}>
                        <span>{o.order_id}</span>
                        <div>
                          <strong>{o.destination}</strong>
                          <p>{o.reason}</p>
                        </div>
                        <span className={`priority ${o.priority}`}>
                          {PRIORITY[o.priority as keyof typeof PRIORITY]}
                        </span>
                      </div>
                    ))}
                  </section>
                )}
              {tab === "inventory" && (
                <>
                  <section className="panel">
                    <div className="panel-head">
                      <div>
                        <h2>Disponibilidade por produto</h2>
                        <p>
                          Saldo válido em{" "}
                          {scenario.planning_date
                            .split("-")
                            .reverse()
                            .join("/")}{" "}
                          · simulações não baixam estoque.
                        </p>
                      </div>
                      <button
                        className="secondary"
                        onClick={() => {
                          openEditor();
                          setEditTab("batches");
                        }}
                      >
                        <Settings2 size={14} /> Editar lotes
                      </button>
                    </div>
                    <div className="stock-grid">
                      {stock.map((p) => (
                        <article key={p.id}>
                          <div>
                            <Box size={19} />
                            {p.refrigerated && (
                              <span className="cold-tag">
                                <Snowflake size={12} /> Refrigerado
                              </span>
                            )}
                          </div>
                          <h3>{p.name}</h3>
                          <strong>
                            {NUM(p.valid)} <small>unidades válidas</small>
                          </strong>
                          <div className="stock-demand">
                            Demanda: {NUM(p.demand)} un.
                            <span
                              className={
                                p.demand > p.valid ? "negative" : "positive"
                              }
                            >
                              {p.demand > p.valid
                                ? `Déficit de ${NUM(p.demand - p.valid)}`
                                : `Saldo de ${NUM(p.valid - p.demand)}`}
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="panel batches-panel">
                    <div className="panel-head">
                      <div>
                        <h2>Lotes & validade</h2>
                        <p>
                          Prioridade FEFO: o lote válido com vencimento mais
                          próximo é utilizado primeiro.
                        </p>
                      </div>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>LOTE</th>
                            <th>PRODUTO</th>
                            <th>VALIDADE</th>
                            <th>SALDO</th>
                            <th>ALOCADO NO PLANO</th>
                            <th>CONDIÇÃO</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...scenario.batches]
                            .sort((a, b) =>
                              a.expires_on.localeCompare(b.expires_on),
                            )
                            .map((b) => {
                              const expired =
                                  b.expires_on < scenario.planning_date,
                                allocated =
                                  run?.result.allocations
                                    .filter((a) => a.batch_id === b.id)
                                    .reduce((n, a) => n + a.quantity, 0) ?? 0;
                              return (
                                <tr key={b.id}>
                                  <td>
                                    <strong>{b.id}</strong>
                                  </td>
                                  <td>
                                    {
                                      scenario.products.find(
                                        (p) => p.id === b.product_id,
                                      )?.name
                                    }
                                  </td>
                                  <td>
                                    {b.expires_on
                                      .split("-")
                                      .reverse()
                                      .join("/")}
                                  </td>
                                  <td>{NUM(b.quantity)} un.</td>
                                  <td>{run ? `${NUM(allocated)} un.` : "—"}</td>
                                  <td>
                                    <span
                                      className={`status-tag ${expired ? "unserved" : "served"}`}
                                    >
                                      {expired
                                        ? "Vencido · excluído"
                                        : "Válido"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <section className="panel fleet-panel">
                    <div className="panel-head">
                      <div>
                        <h2>Frota disponível</h2>
                        <p>
                          Capacidade por viagem, turno e compatibilidade
                          térmica.
                        </p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => {
                          openEditor();
                          setEditTab("vehicles");
                        }}
                      >
                        Editar frota <ArrowRight size={13} />
                      </button>
                    </div>
                    <div className="fleet-grid">
                      {scenario.vehicles.map((v, i) => (
                        <article key={v.id}>
                          <span
                            className="truck-symbol"
                            style={{ color: COLORS[i % 10] }}
                          >
                            <Truck size={23} />
                          </span>
                          <h3>{v.name}</h3>
                          <p>
                            {v.id} {v.refrigerated && "· Refrigerado"}
                          </p>
                          <dl>
                            <div>
                              <dt>Capacidade</dt>
                              <dd>{v.capacity_kg} kg</dd>
                            </div>
                            <div>
                              <dt>Turno</dt>
                              <dd>
                                {HOUR(v.shift_start)}–{HOUR(v.shift_end)}
                              </dd>
                            </div>
                            <div>
                              <dt>Por km</dt>
                              <dd>{BRL(v.cost_per_km_cents)}</dd>
                            </div>
                            <div>
                              <dt>Ativação</dt>
                              <dd>{BRL(v.fixed_cost_cents)}</dd>
                            </div>
                          </dl>
                        </article>
                      ))}
                    </div>
                  </section>
                </>
              )}
              {tab === "history" && (
                <>
                  <section className="scenario-explainer">
                    <div>
                      <p className="eyebrow">LABORATÓRIO DE DECISÕES</p>
                      <h2>E se a demanda aumentar 20%?</h2>
                      <p>
                        Altere demanda, capacidade e velocidade média. Inclua um
                        veículo refrigerado e compare o impacto sem modificar o
                        cenário original.
                      </p>
                      <button
                        className="primary"
                        onClick={() => {
                          setSimulation({
                            name: "Simulação · demanda +20%",
                            demand: 120,
                            speed: scenario.average_speed_kmh,
                            capacity: 100,
                            extraCold: false,
                          });
                          setModalError("");
                          setModal("simulate");
                        }}
                      >
                        <FlaskConical size={15} /> Explorar cenário{" "}
                        <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <div className="simulation-visual" aria-hidden="true">
                      <span>DEMANDA</span>
                      <div>
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                      </div>
                      <strong>
                        +20<span>%</span>
                      </strong>
                      <small>
                        Mais possibilidades.
                        <br />
                        Decisões verificáveis.
                      </small>
                    </div>
                  </section>
                  <section className="panel history-panel">
                    <div className="panel-head">
                      <div>
                        <h2>Execuções salvas</h2>
                        <p>
                          Selecione de 2 a 3 planos para comparar. Cada execução
                          preserva uma cópia dos dados utilizados.
                        </p>
                      </div>
                      <button className="text-button" onClick={() => load()}>
                        <RefreshCw size={13} /> Atualizar
                      </button>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>COMPARAR</th>
                            <th>CENÁRIO / EXECUÇÃO</th>
                            <th>ATENDIMENTO</th>
                            <th>CUSTO ESTIMADO</th>
                            <th>DISTÂNCIA</th>
                            <th>VEÍCULOS</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((r) => (
                            <tr key={r.id}>
                              <td>
                                <input
                                  type="checkbox"
                                  aria-label={`Comparar ${r.name} ${r.id.slice(0, 8)}`}
                                  checked={compare.includes(r.id)}
                                  disabled={
                                    !compare.includes(r.id) &&
                                    compare.length >= 3
                                  }
                                  onChange={(e) =>
                                    setCompare((prev) =>
                                      e.target.checked
                                        ? [...prev, r.id]
                                        : prev.filter((id) => id !== r.id),
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <strong>{r.name}</strong>
                                <small>
                                  v{r.scenario_version} · {r.id.slice(0, 8)} ·{" "}
                                  {new Date(r.created_at).toLocaleString(
                                    "pt-BR",
                                    { dateStyle: "short", timeStyle: "short" },
                                  )}
                                </small>
                              </td>
                              <td>
                                {r.metrics.served}/{r.metrics.total_orders}
                              </td>
                              <td>{BRL(r.metrics.cost_cents)}</td>
                              <td>{KM(r.metrics.distance_m)}</td>
                              <td>{r.metrics.vehicles_used}</td>
                              <td>
                                <button
                                  className="row-action"
                                  aria-label={`Abrir execução ${r.id.slice(0, 8)}`}
                                  onClick={() => openRun(r.id)}
                                >
                                  <ArrowUpRight size={15} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!history.length && (
                        <div className="empty">
                          <History size={30} />
                          <p>
                            Gere o primeiro plano para começar seu histórico.
                          </p>
                        </div>
                      )}
                    </div>
                  </section>
                  {comparisonRuns.length >= 2 && (
                    <section className="panel compare-history">
                      <div className="panel-head">
                        <div>
                          <h2>Comparação de cenários</h2>
                          <p>
                            Compare atendimento junto com custo; um plano mais
                            barato pode atender menos pedidos.
                          </p>
                        </div>
                      </div>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>INDICADOR</th>
                              {comparisonRuns.map((r) => (
                                <th key={r.id}>
                                  {r.name}
                                  <small>
                                    {r.id.slice(0, 8)} · v{r.scenario_version}
                                  </small>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(
                              [
                                "served",
                                "unserved",
                                "cost_cents",
                                "distance_m",
                                "urgent_served",
                                "utilization_pct",
                              ] as const
                            ).map((key) => (
                              <tr key={key}>
                                <td>
                                  {
                                    {
                                      served: "Pedidos atendidos",
                                      unserved: "Não alocados",
                                      cost_cents: "Custo de transporte",
                                      distance_m: "Distância",
                                      urgent_served: "Urgentes atendidos",
                                      utilization_pct: "Ocupação da frota",
                                    }[key]
                                  }
                                </td>
                                {comparisonRuns.map((r) => (
                                  <td key={r.id}>
                                    {key === "cost_cents"
                                      ? BRL(r.metrics[key])
                                      : key === "distance_m"
                                        ? KM(r.metrics[key])
                                        : key === "utilization_pct"
                                          ? r.metrics[key] + "%"
                                          : r.metrics[key]}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}
                </>
              )}
              {tab === "dispatches" && (
                <section className="panel dispatch-history-panel">
                  <div className="panel-head">
                    <div>
                      <h2>
                        Expedições registradas{" "}
                        <span className="count">{dispatchRecords.length}</span>
                      </h2>
                      <p>
                        A confirmação baixa os lotes e retira os pedidos
                        atendidos da fila. Não aciona transportadoras externas.
                      </p>
                    </div>
                    <button className="text-button" onClick={load}>
                      <RefreshCw size={14} /> Atualizar
                    </button>
                  </div>
                  {dispatchRecords.length ? (
                    dispatchRecords.map((d) => (
                      <article key={d.id} className="dispatch-entry">
                        <button
                          className="dispatch-entry-head"
                          aria-expanded={expandedDispatch === d.id}
                          onClick={() =>
                            setExpandedDispatch(
                              expandedDispatch === d.id ? null : d.id,
                            )
                          }
                        >
                          <span className="dispatch-confirmed-icon">
                            <PackageCheck size={22} />
                          </span>
                          <div>
                            <strong>{d.scenario_name}</strong>
                            <small>
                              {new Date(d.created_at).toLocaleString("pt-BR", {
                                timeZone: "America/Sao_Paulo",
                              })}{" "}
                              · {d.id.slice(0, 8)} · versão {d.scenario_version}{" "}
                              → {d.resulting_version}
                            </small>
                          </div>
                          <span>
                            {d.order_count} pedidos
                            <small>{NUM(d.unit_count)} unidades</small>
                          </span>
                          <ChevronDown size={17} />
                        </button>
                        {expandedDispatch === d.id && (
                          <div className="dispatch-entry-body">
                            <div className="dispatch-summary">
                              <span>
                                <strong>{d.routes.length}</strong> veículos
                              </span>
                              <span>
                                <strong>{d.movements.length}</strong> lotes
                                movimentados
                              </span>
                              <span>
                                <strong>{BRL(d.metrics.cost_cents)}</strong>{" "}
                                custo estimado do plano
                              </span>
                            </div>
                            <h3>Movimentação de estoque</h3>
                            <div className="table-scroll">
                              <table>
                                <thead>
                                  <tr>
                                    <th>LOTE</th>
                                    <th>SALDO ANTERIOR</th>
                                    <th>UNIDADES EXPEDIDAS</th>
                                    <th>SALDO APÓS</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {d.movements.map((m) => (
                                    <tr key={m.batch_id}>
                                      <td>
                                        <strong>{m.batch_id}</strong>
                                      </td>
                                      <td>{NUM(m.before)}</td>
                                      <td className="movement-quantity">
                                        −{NUM(m.quantity)}
                                      </td>
                                      <td>{NUM(m.after)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <h3>Pedidos desta expedição</h3>
                            <div className="dispatch-order-list">
                              {d.orders.map((o) => (
                                <span key={o.id}>
                                  <Check size={12} />
                                  <strong>{o.id}</strong> {o.destination} ·{" "}
                                  {NUM(o.quantity)} un.
                                </span>
                              ))}
                            </div>
                            <p className="dispatch-note">
                              <ShieldCheck size={13} /> Confirmação única por
                              plano. O snapshot do planejamento permanece
                              preservado no histórico.
                            </p>
                          </div>
                        )}
                      </article>
                    ))
                  ) : (
                    <div className="empty">
                      <Truck size={32} />
                      <h3>Nenhuma expedição registrada.</h3>
                      <p>
                        Gere um plano para a data de hoje e use “Confirmar
                        expedição” para registrar os pedidos atendidos.
                      </p>
                    </div>
                  )}
                </section>
              )}
              {run && !publicDemo && (
                <section className="dispatch-callout">
                  <div>
                    <span className="eyebrow">PRÓXIMA ETAPA</span>
                    <h3>
                      {alreadyDispatched
                        ? "Expedição já registrada."
                        : "Plano pronto para conferência."}
                    </h3>
                    <p>
                      {alreadyDispatched
                        ? "A baixa deste plano já foi efetuada e não será repetida."
                        : historical
                          ? "Os dados mudaram após este cálculo. Gere um novo plano antes de confirmar."
                          : run.scenario_snapshot.planning_date !==
                              todayInSaoPaulo
                            ? "A confirmação fica disponível apenas na data do planejamento."
                            : run.result.plan.metrics.served === 0
                              ? "Não há pedidos atendidos para expedir neste plano."
                              : `${run.result.plan.metrics.served} pedidos selecionados. A confirmação baixa o estoque e atualiza a fila.`}
                    </p>
                  </div>
                  <button
                    className="primary"
                    onClick={openDispatch}
                    disabled={!canDispatch || saving || solving}
                  >
                    <PackageCheck size={16} />
                    {alreadyDispatched
                      ? "Já confirmado"
                      : "Confirmar expedição"}
                  </button>
                </section>
              )}
              {run && (
                <div className="export-bar">
                  <span>
                    <ShieldCheck size={15} /> Execução validada ·{" "}
                    {run.result.execution.elapsed_ms} ms · estoque preservado
                  </span>
                  <div>
                    <button
                      className="text-button"
                      onClick={() => exportRun("json")}
                    >
                      <ArrowDownToLine size={13} /> Dados e resultado JSON
                    </button>
                    <button
                      className="text-button"
                      onClick={() => exportRun("csv")}
                    >
                      <ArrowDownToLine size={13} /> Plano CSV
                    </button>
                  </div>
                </div>
              )}
              <div className="assumptions">
                <MapPin size={14} />
                <p>
                  Distâncias estimadas por coordenadas, fator viário{" "}
                  {scenario.road_factor} e velocidade média{" "}
                  {scenario.average_speed_kmh} km/h. Não utiliza trânsito ou
                  malha viária real. Refrigeração indica compatibilidade do
                  veículo; não há sensor de temperatura.
                </p>
              </div>
            </>
          )}
          <footer>
            <span>
              Logistics Intelligence <b>v3.1</b> · Erivan Santos Marques
            </span>
            <span>Engenharia de software · Pesquisa operacional · Dados</span>
          </footer>
        </main>
      </div>
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) setModal(null);
          }}
        >
          <section
            className={`modal ${modal === "edit" ? "editor-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modalTitle"
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">
                  {modal === "edit"
                    ? "DADOS VERSIONADOS"
                    : modal === "simulate"
                      ? "LABORATÓRIO DE CENÁRIOS"
                      : modal === "dispatch"
                        ? "CONFERÊNCIA DE EXPEDIÇÃO"
                        : "ACESSO À OPERAÇÃO"}
                </p>
                <h2 id="modalTitle">
                  {modal === "edit"
                    ? "Configurar operação"
                    : modal === "simulate"
                      ? "Simular uma alternativa"
                      : modal === "dispatch"
                        ? "Confirmar expedição"
                        : "Token de acesso"}
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setModal(null)}
                aria-label="Fechar"
                disabled={saving}
              >
                <X size={20} />
              </button>
            </div>
            {modal === "dispatch" && run && (
              <form onSubmit={confirmDispatch}>
                <p className="modal-description">
                  Confira os dados antes de registrar. Esta ação atualiza apenas
                  a operação do projeto; não envia solicitações a
                  transportadoras.
                </p>
                <div className="dispatch-review">
                  <div>
                    <span>Pedidos atendidos</span>
                    <strong>{run.result.plan.metrics.served}</strong>
                  </div>
                  <div>
                    <span>Unidades a baixar</span>
                    <strong>
                      {NUM(
                        run.result.allocations.reduce(
                          (n, a) => n + a.quantity,
                          0,
                        ),
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Versão após confirmar</span>
                    <strong>v{run.scenario_version + 1}</strong>
                  </div>
                </div>
                <ul className="dispatch-checklist">
                  <li>
                    <Check size={14} /> Baixa dos lotes conforme separação FEFO.
                  </li>
                  <li>
                    <Check size={14} /> Retirada dos pedidos atendidos da fila
                    de planejamento.
                  </li>
                  <li>
                    <Check size={14} /> Registro da expedição e das
                    movimentações no histórico.
                  </li>
                  <li>
                    <ShieldCheck size={14} /> Proteção contra repetição e contra
                    planos desatualizados.
                  </li>
                </ul>
                <label className="checkbox-label">
                  <input type="checkbox" required />
                  <span>
                    Conferi os dados e quero registrar a baixa de estoque.
                  </span>
                </label>
                {modalError && (
                  <p className="form-error" role="alert">
                    {modalError}
                  </p>
                )}
                <div className="modal-actions">
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setModal(null)}
                    disabled={saving}
                  >
                    Voltar à conferência
                  </button>
                  <button className="primary" disabled={saving || !canDispatch}>
                    <PackageCheck size={15} />
                    {saving ? "Registrando…" : "Registrar expedição"}
                  </button>
                </div>
              </form>
            )}
            {modal === "auth" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setToken(authInput);
                  setModal(null);
                }}
              >
                <p className="modal-description">
                  Visitantes podem explorar a demonstração sem token. Para
                  administrar a operação, informe o token do responsável. Ele
                  fica apenas na memória desta página.
                </p>
                <label>
                  Token
                  <input
                    type="password"
                    autoComplete="off"
                    value={authInput}
                    onChange={(e) => setAuthInput(e.target.value)}
                    autoFocus
                  />
                </label>
                <div className="modal-actions">
                  <button className="primary">
                    Conectar <ArrowRight size={14} />
                  </button>
                </div>
              </form>
            )}
            {modal === "simulate" && (
              <form onSubmit={simulate}>
                <p className="modal-description">
                  Uma cópia independente será salva e planejada. Quantidades são
                  arredondadas para unidades inteiras.
                </p>
                <label>
                  Nome do cenário
                  <input
                    required
                    maxLength={100}
                    value={simulation.name}
                    onChange={(e) =>
                      setSimulation({ ...simulation, name: e.target.value })
                    }
                    autoFocus
                  />
                </label>
                <div className="range-field">
                  <label htmlFor="demandRange">
                    Demanda de pedidos<strong>{simulation.demand}%</strong>
                  </label>
                  <input
                    id="demandRange"
                    type="range"
                    min="50"
                    max="200"
                    step="10"
                    value={simulation.demand}
                    onChange={(e) =>
                      setSimulation({ ...simulation, demand: +e.target.value })
                    }
                  />
                  <small>100% mantém as quantidades originais.</small>
                </div>
                <div className="range-field">
                  <label htmlFor="capacityRange">
                    Capacidade dos veículos
                    <strong>{simulation.capacity}%</strong>
                  </label>
                  <input
                    id="capacityRange"
                    type="range"
                    min="50"
                    max="150"
                    step="10"
                    value={simulation.capacity}
                    onChange={(e) =>
                      setSimulation({
                        ...simulation,
                        capacity: +e.target.value,
                      })
                    }
                  />
                </div>
                <label>
                  Velocidade média estimada (km/h)
                  <input
                    required
                    type="number"
                    min="5"
                    max="80"
                    value={simulation.speed}
                    onChange={(e) =>
                      setSimulation({ ...simulation, speed: +e.target.value })
                    }
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={simulation.extraCold}
                    onChange={(e) =>
                      setSimulation({
                        ...simulation,
                        extraCold: e.target.checked,
                      })
                    }
                  />
                  <span>
                    Adicionar veículo refrigerado
                    <small>
                      Usa capacidade e custos do primeiro veículo do cenário.
                    </small>
                  </span>
                </label>
                {modalError && (
                  <p className="form-error" role="alert">
                    {modalError}
                  </p>
                )}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setModal(null)}
                    disabled={saving}
                  >
                    Voltar
                  </button>
                  <button className="primary" disabled={saving}>
                    <FlaskConical size={14} />
                    {saving ? "Preparando cenário…" : "Criar e planejar"}
                  </button>
                </div>
              </form>
            )}
            {modal === "edit" && draft && (
              <form onSubmit={saveDraft}>
                <p className="modal-description">
                  Salvar gera uma nova versão. Planos antigos continuam
                  preservados no histórico.
                </p>
                <div className="editor-top">
                  <label>
                    Nome do cenário
                    <input
                      required
                      maxLength={100}
                      value={draft.name}
                      onChange={(e) =>
                        setDraft({ ...draft, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Data do planejamento
                    <input
                      type="date"
                      required
                      value={draft.planning_date}
                      onChange={(e) =>
                        setDraft({ ...draft, planning_date: e.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="editor-tabs">
                  {[
                    ["orders", "Pedidos"],
                    ["batches", "Lotes e estoque"],
                    ["vehicles", "Veículos"],
                  ].map(([id, label]) => (
                    <button
                      type="button"
                      className={editTab === id ? "active" : ""}
                      key={id}
                      onClick={() => setEditTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="editor-table table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {(editTab === "orders"
                          ? [
                              "PEDIDO / DESTINO",
                              "PRODUTO",
                              "QUANTIDADE",
                              "PRIORIDADE",
                              "INÍCIO (MIN APÓS 08H)",
                              "FIM (MIN APÓS 08H)",
                              "COORDENADAS",
                            ]
                          : editTab === "batches"
                            ? ["LOTE", "PRODUTO", "QUANTIDADE", "VALIDADE"]
                            : [
                                "VEÍCULO",
                                "CAPACIDADE KG",
                                "REFRIGERADO",
                                "R$/KM",
                                "TURNO ATÉ (MIN)",
                              ]
                        ).map((label) => (
                          <th key={label}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {editTab === "orders"
                        ? draft.orders.map((o, i) => (
                            <tr key={o.id}>
                              <td>
                                <input
                                  aria-label={`Destino ${o.id}`}
                                  required
                                  maxLength={100}
                                  value={o.destination}
                                  onChange={(e) =>
                                    changeDraft(
                                      "orders",
                                      i,
                                      "destination",
                                      e.target.value,
                                    )
                                  }
                                />
                                <small>{o.id}</small>
                              </td>
                              <td>
                                <select
                                  aria-label={`Produto ${o.id}`}
                                  value={o.product_id}
                                  onChange={(e) =>
                                    changeDraft(
                                      "orders",
                                      i,
                                      "product_id",
                                      e.target.value,
                                    )
                                  }
                                >
                                  {draft.products.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <input
                                  aria-label={`Quantidade ${o.id}`}
                                  required
                                  type="number"
                                  min="1"
                                  max="10000"
                                  value={o.quantity}
                                  onChange={(e) =>
                                    changeDraft(
                                      "orders",
                                      i,
                                      "quantity",
                                      +e.target.value,
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <select
                                  aria-label={`Prioridade ${o.id}`}
                                  value={o.priority}
                                  onChange={(e) =>
                                    changeDraft(
                                      "orders",
                                      i,
                                      "priority",
                                      e.target.value,
                                    )
                                  }
                                >
                                  <option value="normal">Normal</option>
                                  <option value="high">Alta</option>
                                  <option value="urgent">Urgente</option>
                                </select>
                              </td>
                              <td>
                                <input
                                  aria-label={`Início ${o.id}`}
                                  required
                                  type="number"
                                  min="0"
                                  max="720"
                                  value={o.window_start}
                                  onChange={(e) =>
                                    changeDraft(
                                      "orders",
                                      i,
                                      "window_start",
                                      +e.target.value,
                                    )
                                  }
                                />
                                <small>{HOUR(o.window_start)}</small>
                              </td>
                              <td>
                                <input
                                  aria-label={`Fim ${o.id}`}
                                  required
                                  type="number"
                                  min={o.window_start}
                                  max="720"
                                  value={o.window_end}
                                  onChange={(e) =>
                                    changeDraft(
                                      "orders",
                                      i,
                                      "window_end",
                                      +e.target.value,
                                    )
                                  }
                                />
                                <small>{HOUR(o.window_end)}</small>
                              </td>
                              <td>
                                <input
                                  aria-label={`Latitude ${o.id}`}
                                  type="number"
                                  required
                                  min="-90"
                                  max="90"
                                  step="0.000001"
                                  value={o.location.lat}
                                  onChange={(e) =>
                                    changeDraft("orders", i, "location", {
                                      ...o.location,
                                      lat: +e.target.value,
                                    })
                                  }
                                />
                                <input
                                  aria-label={`Longitude ${o.id}`}
                                  type="number"
                                  required
                                  min="-180"
                                  max="180"
                                  step="0.000001"
                                  value={o.location.lng}
                                  onChange={(e) =>
                                    changeDraft("orders", i, "location", {
                                      ...o.location,
                                      lng: +e.target.value,
                                    })
                                  }
                                />
                              </td>
                            </tr>
                          ))
                        : editTab === "batches"
                          ? draft.batches.map((b, i) => (
                              <tr key={b.id}>
                                <td>
                                  <strong>{b.id}</strong>
                                </td>
                                <td>
                                  <select
                                    aria-label={`Produto ${b.id}`}
                                    value={b.product_id}
                                    onChange={(e) =>
                                      changeDraft(
                                        "batches",
                                        i,
                                        "product_id",
                                        e.target.value,
                                      )
                                    }
                                  >
                                    {draft.products.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  <input
                                    aria-label={`Quantidade ${b.id}`}
                                    required
                                    type="number"
                                    min="0"
                                    max="1000000"
                                    value={b.quantity}
                                    onChange={(e) =>
                                      changeDraft(
                                        "batches",
                                        i,
                                        "quantity",
                                        +e.target.value,
                                      )
                                    }
                                  />
                                </td>
                                <td>
                                  <input
                                    aria-label={`Validade ${b.id}`}
                                    required
                                    type="date"
                                    value={b.expires_on}
                                    onChange={(e) =>
                                      changeDraft(
                                        "batches",
                                        i,
                                        "expires_on",
                                        e.target.value,
                                      )
                                    }
                                  />
                                </td>
                              </tr>
                            ))
                          : draft.vehicles.map((v, i) => (
                              <tr key={v.id}>
                                <td>
                                  <input
                                    aria-label={`Nome ${v.id}`}
                                    required
                                    maxLength={80}
                                    value={v.name}
                                    onChange={(e) =>
                                      changeDraft(
                                        "vehicles",
                                        i,
                                        "name",
                                        e.target.value,
                                      )
                                    }
                                  />
                                  <small>{v.id}</small>
                                </td>
                                <td>
                                  <input
                                    aria-label={`Capacidade ${v.id}`}
                                    required
                                    type="number"
                                    min="1"
                                    max="30000"
                                    value={v.capacity_kg}
                                    onChange={(e) =>
                                      changeDraft(
                                        "vehicles",
                                        i,
                                        "capacity_kg",
                                        +e.target.value,
                                      )
                                    }
                                  />
                                </td>
                                <td>
                                  <input
                                    aria-label={`Refrigerado ${v.id}`}
                                    type="checkbox"
                                    checked={v.refrigerated}
                                    onChange={(e) =>
                                      changeDraft(
                                        "vehicles",
                                        i,
                                        "refrigerated",
                                        e.target.checked,
                                      )
                                    }
                                  />
                                </td>
                                <td>
                                  <input
                                    aria-label={`Custo por km ${v.id}`}
                                    required
                                    type="number"
                                    min="0.01"
                                    max="100"
                                    step="0.01"
                                    value={v.cost_per_km_cents / 100}
                                    onChange={(e) =>
                                      changeDraft(
                                        "vehicles",
                                        i,
                                        "cost_per_km_cents",
                                        Math.round(+e.target.value * 100),
                                      )
                                    }
                                  />
                                </td>
                                <td>
                                  <input
                                    aria-label={`Fim do turno ${v.id}`}
                                    required
                                    type="number"
                                    min={v.shift_start + 1}
                                    max="720"
                                    value={v.shift_end}
                                    onChange={(e) =>
                                      changeDraft(
                                        "vehicles",
                                        i,
                                        "shift_end",
                                        +e.target.value,
                                      )
                                    }
                                  />
                                  <small>{HOUR(v.shift_end)}</small>
                                </td>
                              </tr>
                            ))}
                    </tbody>
                  </table>
                </div>
                <div className="editor-toolbar">
                  <button
                    type="button"
                    className="secondary"
                    onClick={addDraftItem}
                    disabled={
                      editTab === "orders"
                        ? draft.orders.length >= 60
                        : editTab === "batches"
                          ? draft.batches.length >= 200
                          : draft.vehicles.length >= 10
                    }
                  >
                    <Plus size={14} />
                    {editTab === "orders"
                      ? "Adicionar pedido"
                      : editTab === "batches"
                        ? "Adicionar lote"
                        : "Adicionar veículo"}
                  </button>
                  <span>
                    {editTab === "orders"
                      ? "Defina as coordenadas reais do destino; não há busca automática de endereço."
                      : editTab === "batches"
                        ? "Lotes vencidos continuam no cadastro, mas não são alocados."
                        : "A capacidade é o peso máximo da carga por viagem."}
                  </span>
                </div>
                {modalError && (
                  <p className="form-error" role="alert">
                    {modalError}
                  </p>
                )}
                <div className="modal-actions">
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setModal(null)}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <button className="primary" disabled={saving}>
                    <Check size={15} />
                    {saving ? "Salvando…" : "Salvar nova versão"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <CheckCheck size={16} />
          {notice}
        </div>
      )}
    </div>
  );
}
function Metric({
  title,
  value,
  suffix,
  icon,
  foot,
  positive,
}: {
  title: string;
  value: string;
  suffix?: string;
  icon: ReactNode;
  foot: string;
  positive?: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-title">
        <span>{title}</span>
        <i>{icon}</i>
      </div>
      <div className="metric-value">
        {value}
        <small>{suffix}</small>
      </div>
      <div className="metric-foot">
        {positive && <span>{positive}</span>}
        <small>{foot}</small>
      </div>
    </article>
  );
}
function RouteMap({
  scenario,
  routes,
  active,
  selectedOrder,
  onSelect,
}: {
  scenario: Scenario;
  routes: Route[];
  active: string | null;
  selectedOrder: string | null;
  onSelect: (id: string) => void;
}) {
  const points = [scenario.depot, ...scenario.orders.map((o) => o.location)];
  const lngs = points.map((p) => p.lng),
    lats = points.map((p) => p.lat);
  const minX = Math.min(...lngs) - 0.025,
    maxX = Math.max(...lngs) + 0.025,
    minY = Math.min(...lats) - 0.015,
    maxY = Math.max(...lats) + 0.015;
  const xy = (p: { lat: number; lng: number }) => [
    40 + ((p.lng - minX) / (maxX - minX)) * 630,
    335 - ((p.lat - minY) / (maxY - minY)) * 285,
  ];
  const depot = xy(scenario.depot),
    orderById = Object.fromEntries(scenario.orders.map((o) => [o.id, o]));
  return (
    <div className="map-wrap">
      <svg
        viewBox="0 0 720 390"
        role="img"
        aria-label="Distribuição geográfica esquemática dos pedidos e rotas propostas"
      >
        <defs>
          <pattern
            id="mapgrid"
            width="25"
            height="25"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 25 0 L 0 0 0 25"
              fill="none"
              stroke="#dce5df"
              strokeWidth=".7"
            />
          </pattern>
          <pattern
            id="mapblocks"
            width="90"
            height="65"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-22)"
          >
            <rect
              x="8"
              y="8"
              width="70"
              height="45"
              rx="6"
              fill="#e7ede7"
              opacity=".7"
            />
          </pattern>
        </defs>
        <rect width="720" height="390" fill="#f0f4ed" />
        <rect width="720" height="390" fill="url(#mapblocks)" />
        <rect width="720" height="390" fill="url(#mapgrid)" />
        <path
          d="M 80 0 C 190 90 130 200 350 270 S 510 330 650 390"
          fill="none"
          stroke="#d7e7e1"
          strokeWidth="27"
        />
        <path
          d="M 0 170 L 270 100 720 180 M 130 390 L 330 0 M 440 390 L 600 0"
          stroke="#fff"
          strokeWidth="5"
          fill="none"
        />
        <text x="395" y="39" className="map-region">
          SÃO PAULO
        </text>
        <text x="33" y="365" className="map-caption">
          DISTRIBUIÇÃO DEMONSTRATIVA · SEM MALHA VIÁRIA
        </text>
        {routes.map((route, i) => {
          const coordinates = [
            depot,
            ...route.stops.map((s) => xy(orderById[s.order_id].location)),
            depot,
          ];
          return (
            <g
              key={route.vehicle_id}
              opacity={active && active !== route.vehicle_id ? 0.25 : 1}
            >
              <polyline
                points={coordinates.map((p) => p.join(",")).join(" ")}
                fill="none"
                stroke="white"
                strokeWidth="6"
                strokeLinejoin="round"
              />
              <polyline
                points={coordinates.map((p) => p.join(",")).join(" ")}
                fill="none"
                stroke={COLORS[i % 10]}
                strokeWidth="2.7"
                strokeLinejoin="round"
                strokeDasharray="6 3"
              />
            </g>
          );
        })}
        {scenario.orders.map((order, index) => {
          const point = xy(order.location),
            routeIndex = routes.findIndex((r) =>
              r.stops.some((s) => s.order_id === order.id),
            ),
            route = routes[routeIndex],
            color = routeIndex >= 0 ? COLORS[routeIndex % 10] : "#94a49a",
            selected = selectedOrder === order.id;
          return (
            <g
              key={order.id}
              role="button"
              tabIndex={0}
              aria-label={`${order.id}, ${order.destination}, ${route ? "alocado" : "não alocado"}`}
              onClick={() => onSelect(order.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(order.id);
                }
              }}
              className="map-point"
              opacity={active && route?.vehicle_id !== active ? 0.35 : 1}
            >
              <title>{order.destination}</title>
              {selected && (
                <circle
                  cx={point[0]}
                  cy={point[1]}
                  r="17"
                  fill={color}
                  opacity=".18"
                />
              )}
              <circle
                cx={point[0]}
                cy={point[1]}
                r={selected ? 11 : 9}
                fill="white"
                stroke={color}
                strokeWidth="2"
              />
              <text
                x={point[0]}
                y={point[1] + 3}
                textAnchor="middle"
                fill={color}
                fontSize="8"
                fontWeight="700"
              >
                {index + 1}
              </text>
            </g>
          );
        })}
        <g>
          <rect
            x={depot[0] - 17}
            y={depot[1] - 17}
            width="34"
            height="34"
            rx="9"
            fill="#153e3e"
            stroke="white"
            strokeWidth="3"
          />
          <path
            d={`M ${depot[0] - 7} ${depot[1] - 2} l 7 -5 l 7 5 v 9 h -14 z`}
            stroke="white"
            fill="none"
            strokeWidth="1.5"
          />
          <text
            x={depot[0]}
            y={depot[1] + 32}
            textAnchor="middle"
            className="depot-label"
          >
            CENTRO DE DISTRIBUIÇÃO
          </text>
        </g>
      </svg>
    </div>
  );
}
export default App;
