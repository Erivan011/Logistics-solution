"use strict";
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const money = (value) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );
const integer = (value) => new Intl.NumberFormat("pt-BR").format(value);
const dateLabel = (value) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  });
const state = {
  items: [],
  page: 1,
  pageSize: 7,
  late: false,
  request: 0,
  overview: null,
};
const statusClass = {
  Pendente: "pending",
  "Em trânsito": "transit",
  Entregue: "done",
  Cancelada: "cancelled",
};
const transitions = {
  Pendente: ["Em trânsito", "Cancelada"],
  "Em trânsito": ["Entregue", "Cancelada"],
  Entregue: [],
  Cancelada: [],
};
let toastTimeout;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => ($("#toast").hidden = true), 5000);
}
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "Não foi possível concluir a operação.");
  return body;
}
function showError(error) {
  $("#errorBanner").textContent =
    `${error.message} Use “Atualizar” para tentar novamente.`;
  $("#errorBanner").hidden = false;
}
function filters() {
  const params = new URLSearchParams();
  if ($("#search").value.trim()) params.set("q", $("#search").value.trim());
  if ($("#statusFilter").value) params.set("status", $("#statusFilter").value);
  if ($("#priorityFilter").value)
    params.set("prioridade", $("#priorityFilter").value);
  if (state.late) params.set("atraso", "1");
  return params;
}
function renderOverview(data) {
  state.overview = data;
  $("#today").textContent = new Date(
    `${data.data_referencia}T12:00:00Z`,
  ).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  });
  $("#demoLabel").textContent = data.demonstracao
    ? "DADOS DE DEMONSTRAÇÃO"
    : "PORTFÓLIO · LOCAL";
  $("#navCount").textContent = data.total;
  const cards = [
    [
      "Entregas na operação",
      integer(data.total),
      "⇄",
      `${data.pendentes} pendentes de expedição`,
    ],
    [
      "Em trânsito",
      integer(data.em_transito),
      "↗",
      "Acompanhamento das remessas",
    ],
    [
      "Entregas no prazo",
      data.pontualidade === null ? "—" : `${data.pontualidade}%`,
      "✓",
      data.entregues
        ? `${data.entregues} entregas concluídas`
        : "Sem entregas concluídas",
    ],
    [
      "Custo de transporte",
      money(data.custo_total),
      "＄",
      "Acumulado · exclui canceladas",
    ],
  ];
  $("#kpis").innerHTML = cards
    .map(
      ([title, value, icon, note]) =>
        `<article class="kpi"><div class="kpi-head"><span>${title}</span><span class="kpi-symbol" aria-hidden="true">${icon}</span></div><div class="kpi-value">${value}</div><div class="kpi-foot">${note}</div></article>`,
    )
    .join("");
  $("#statusFlow").innerHTML = data.por_status
    .map(
      (entry, index) =>
        `<div class="flow-card"><span class="flow-icon" aria-hidden="true">${["□", "⇄", "✓", "×"][index]}</span><span class="flow-value">${entry.total}</span><div class="flow-label">${entry.status}</div></div>`,
    )
    .join("");
  $("#lateCount").textContent = data.atrasadas;
  $("#carrierRows").innerHTML = data.transportadoras.length
    ? data.transportadoras
        .map(
          (c) =>
            `<div class="carrier-row"><strong>${escapeHtml(c.nome)}</strong><span>${c.total} remessas · ${c.entregues} concluídas · ${c.atrasadas} atrasadas</span></div>`,
        )
        .join("")
    : '<p class="empty">As transportadoras aparecerão após o primeiro cadastro.</p>';
}
function renderTable() {
  const pages = Math.max(1, Math.ceil(state.items.length / state.pageSize));
  state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * state.pageSize,
    items = state.items.slice(start, start + state.pageSize);
  $("#deliveryRows").innerHTML = items.length
    ? items
        .map(
          (item) =>
            `<tr><td><div class="destination"><span class="destination-icon" aria-hidden="true">▧</span><div><strong>${escapeHtml(item.destino)}</strong><small>LS-${String(item.id).padStart(4, "0")} · ${escapeHtml(item.transportadora)}</small></div></div></td><td class="product"><strong>${escapeHtml(item.medicamento)}</strong><small>${integer(item.quantidade)} un. · ${escapeHtml(item.lote)}</small></td><td class="${item.atrasada ? "late-date" : ""}">${dateLabel(item.prazo)}${item.atrasada ? "<small>Fora do prazo</small>" : ""}</td><td><span class="badge status-${statusClass[item.status]}">${item.status}</span></td><td><span class="priority ${item.prioridade === "Urgente" ? "urgent" : item.prioridade === "Alta" ? "high" : ""}">${item.prioridade}</span></td><td>${money(item.custo)}</td><td><button class="row-button" data-detail="${item.id}" aria-label="Ver entrega LS-${String(item.id).padStart(4, "0")}">↗</button></td></tr>`,
        )
        .join("")
    : '<tr><td colspan="7" class="empty">Nenhuma entrega encontrada. Ajuste os filtros ou cadastre uma nova remessa.</td></tr>';
  $("#resultCount").textContent = state.items.length;
  $("#tableSummary").textContent = items.length
    ? `Mostrando ${start + 1}–${start + items.length} de ${state.items.length} entregas`
    : "0 entregas encontradas";
  $("#pageInfo").textContent = `${state.page} / ${pages}`;
  $("#prevPage").disabled = state.page === 1;
  $("#nextPage").disabled = state.page === pages;
}
async function loadDeliveries() {
  const request = ++state.request,
    params = filters();
  $("#exportLink").href = `/api/entregas/exportar?${params}`;
  $("#clearFilters").hidden = !params.size;
  $("#lateFilter").setAttribute("aria-pressed", String(state.late));
  $("#deliveryRows").setAttribute("aria-busy", "true");
  try {
    const { data } = await api(`/api/entregas?${params}`);
    if (request !== state.request) return;
    state.items = data;
    renderTable();
    $("#errorBanner").hidden = true;
  } catch (error) {
    if (request === state.request) {
      showError(error);
      $("#deliveryRows").innerHTML =
        '<tr><td colspan="7" class="empty">Não foi possível carregar as entregas. Tente atualizar.</td></tr>';
    }
  } finally {
    if (request === state.request)
      $("#deliveryRows").removeAttribute("aria-busy");
  }
}
async function refresh() {
  await Promise.all([
    loadDeliveries(),
    api("/api/indicadores")
      .then(({ data }) => renderOverview(data))
      .catch(showError),
  ]);
}
function setView(view) {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.view === view);
    if (button.dataset.view === view)
      button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  const copy = {
    overview: [
      "Sua operação, em movimento.",
      "Acompanhe entregas, antecipe atrasos e mantenha tudo sob controle.",
    ],
    deliveries: [
      "Entregas sob controle.",
      "Consulte remessas, atualize status e acompanhe cada etapa.",
    ],
    insights: [
      "Dados que orientam decisões.",
      "Indicadores calculados a partir de toda a sua operação.",
    ],
  };
  $("#pageTitle").textContent = copy[view][0];
  $("#pageDescription").textContent = copy[view][1];
  $("#overviewContent").hidden = view === "deliveries";
  $("#deliveriesSection").hidden = view === "insights";
  $("#carrierPanel").hidden = view !== "insights";
}
async function showDetail(id) {
  try {
    const { data: item } = await api(`/api/entregas/${id}`);
    $("#detailContent").innerHTML =
      `<div class="dialog-heading"><div><p class="eyebrow">LS-${String(item.id).padStart(4, "0")}</p><h2 id="detailTitle">${escapeHtml(item.destino)}</h2></div><button class="icon-button" data-close="detailDialog" aria-label="Fechar detalhes">×</button></div><span class="badge status-${statusClass[item.status]}">${item.status}</span><dl class="detail-grid">${[
        ["Produto", item.medicamento],
        ["Lote", item.lote],
        ["Quantidade", `${integer(item.quantidade)} unidades`],
        ["Transportadora", item.transportadora],
        [
          "Prazo",
          dateLabel(item.prazo) + (item.atrasada ? " · Fora do prazo" : ""),
        ],
        ["Prioridade", item.prioridade],
        ["Custo", money(item.custo)],
      ]
        .map(
          ([label, value]) =>
            `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`,
        )
        .join(
          "",
        )}</dl><h2>Histórico da entrega</h2><ol class="timeline">${item.eventos.map((event) => `<li><strong>${event.status}</strong><p>${escapeHtml(event.descricao)}</p><small>${new Date(event.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · São Paulo</small></li>`).join("")}</ol><p id="detailError" class="form-error" role="alert"></p><div class="detail-actions">${transitions[item.status].map((status) => `<button class="${status === "Cancelada" ? "secondary danger" : "primary"}" data-status="${status}" data-id="${item.id}" data-version="${item.versao}">${status === "Cancelada" ? "Cancelar entrega" : status === "Entregue" ? "Confirmar recebimento" : "Iniciar transporte"}${status === "Cancelada" ? "" : " →"}</button>`).join("") || '<p class="muted">Entrega finalizada. O histórico permanece disponível para consulta.</p>'}</div>`;
    if (!$("#detailDialog").open) $("#detailDialog").showModal();
  } catch (error) {
    toast(error.message);
  }
}
$("#newDelivery").addEventListener("click", () => {
  $("#deliveryForm").reset();
  $("#formError").textContent = "";
  $("#newDialog").showModal();
});
document.addEventListener("click", async (event) => {
  const close = event.target.closest("[data-close]");
  if (close) {
    document.getElementById(close.dataset.close).close();
    return;
  }
  const detail = event.target.closest("[data-detail]");
  if (detail) {
    await showDetail(detail.dataset.detail);
    return;
  }
  const statusButton = event.target.closest("[data-status]");
  if (statusButton) {
    const buttons = $("#detailContent").querySelectorAll("[data-status]");
    buttons.forEach((button) => (button.disabled = true));
    try {
      await api(`/api/entregas/${statusButton.dataset.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: statusButton.dataset.status,
          versao: Number(statusButton.dataset.version),
        }),
      });
      await showDetail(statusButton.dataset.id);
      await refresh();
      toast("Status atualizado e registrado no histórico.");
    } catch (error) {
      $("#detailError").textContent = error.message;
      buttons.forEach((button) => (button.disabled = false));
    }
  }
});
$("#deliveryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const body = Object.fromEntries(new FormData(event.currentTarget));
  body.quantidade = Number(body.quantidade);
  body.custo = Number(body.custo);
  $("#saveDelivery").disabled = true;
  $("#formError").textContent = "";
  try {
    const { data } = await api("/api/entregas", {
      method: "POST",
      body: JSON.stringify(body),
    });
    $("#newDialog").close();
    clearFilters();
    await refresh();
    toast(
      `Entrega LS-${String(data.id).padStart(4, "0")} cadastrada com sucesso.`,
    );
  } catch (error) {
    $("#formError").textContent = error.message;
  } finally {
    $("#saveDelivery").disabled = false;
  }
});
let searchTimer;
$("#search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.page = 1;
    loadDeliveries();
  }, 250);
});
for (const id of ["statusFilter", "priorityFilter"])
  $(`#${id}`).addEventListener("change", () => {
    state.page = 1;
    loadDeliveries();
  });
function clearFilters() {
  $("#search").value = "";
  $("#statusFilter").value = "";
  $("#priorityFilter").value = "";
  state.late = false;
  state.page = 1;
  clearTimeout(searchTimer);
}
$("#clearFilters").addEventListener("click", () => {
  clearFilters();
  loadDeliveries();
});
$("#lateFilter").addEventListener("click", () => {
  state.late = !state.late;
  state.page = 1;
  loadDeliveries();
});
$("#showLate").addEventListener("click", () => {
  clearFilters();
  state.late = true;
  setView("deliveries");
  loadDeliveries();
  $("#deliveriesSection").scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
});
$("#prevPage").addEventListener("click", () => {
  state.page--;
  renderTable();
});
$("#nextPage").addEventListener("click", () => {
  state.page++;
  renderTable();
});
$("#refresh").addEventListener("click", refresh);
document
  .querySelectorAll("[data-view]")
  .forEach((button) =>
    button.addEventListener("click", () => setView(button.dataset.view)),
  );
setView("overview");
refresh();
