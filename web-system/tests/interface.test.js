"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { createStore } = require("../backend/store");
const { createApp } = require("../backend/server");
async function until(condition) {
  const deadline = Date.now() + 3000;
  while (!condition()) {
    if (Date.now() > deadline)
      throw new Error("A interface não chegou ao estado esperado.");
    await new Promise((r) => setTimeout(r, 10));
  }
}
// DOM integration test. Dialog presentation/layout are not emulated by JSDOM.
test("interface integrates with real API: render, filter, paginate, create, status and safe text", async (t) => {
  const store = createStore(":memory:", {
    now: () => new Date("2026-10-26T14:00:00Z"),
  });
  const server = createApp(store);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const html = readFileSync(
    path.join(__dirname, "../frontend/index.html"),
    "utf8",
  );
  const dom = new JSDOM(html, { url: origin, runScripts: "outside-only" }),
    w = dom.window;
  t.after(async () => {
    w.close();
    await new Promise((r) => server.close(r));
    store.close();
  });
  w.fetch = (url, options) => fetch(new URL(url, origin), options);
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.eval(readFileSync(path.join(__dirname, "../frontend/app.js"), "utf8"));
  const $ = (selector) => w.document.querySelector(selector),
    click = (selector) => $(selector).click();
  await until(() => $("#resultCount").textContent === "18");
  assert.equal(w.document.querySelectorAll("#deliveryRows tr").length, 7);
  assert.equal($("#pageInfo").textContent, "1 / 3");
  click("#nextPage");
  assert.equal($("#pageInfo").textContent, "2 / 3");
  $("#statusFilter").value = "Entregue";
  $("#statusFilter").dispatchEvent(new w.Event("change"));
  await until(() => $("#resultCount").textContent === "6");
  assert.ok($("#exportLink").href.includes("status=Entregue"));
  click("#clearFilters");
  await until(() => $("#resultCount").textContent === "18");
  click("#newDelivery");
  assert.equal($("#newDialog").open, true);
  const values = {
    destino: "<img src=x onerror=alert(1)>",
    medicamento: "Teste de integração",
    lote: "LT-UI",
    transportadora: "Parceiro UI",
    quantidade: "20",
    custo: "99.90",
    prazo: "2026-10-27",
    prioridade: "Alta",
  };
  for (const [name, value] of Object.entries(values))
    $(`[name="${name}"]`).value = value;
  $("#deliveryForm").dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  await until(() => $("#resultCount").textContent === "19");
  assert.equal($("#newDialog").open, false);
  assert.equal($("#deliveryRows img"), null);
  assert.ok($("#deliveryRows").textContent.includes("<img src=x"));
  click('[data-detail="19"]');
  await until(() => $("#detailDialog").open);
  click('[data-status="Em trânsito"]');
  await until(() => $("#detailContent .badge").textContent === "Em trânsito");
  assert.equal(store.detail(19).eventos.length, 2);
  await until(() => $("#toast").textContent.includes("Status atualizado"));
  assert.ok(
    $("#detailContent").textContent.includes(
      "Status alterado de Pendente para Em trânsito.",
    ),
  );
});
test("empty/error interface reports failures and can recover", async (t) => {
  const html = readFileSync(
    path.join(__dirname, "../frontend/index.html"),
    "utf8",
  );
  const dom = new JSDOM(html, {
      url: "http://localhost",
      runScripts: "outside-only",
    }),
    w = dom.window;
  t.after(() => w.close());
  w.fetch = async () => {
    throw new Error("Sem conexão de teste");
  };
  w.eval(readFileSync(path.join(__dirname, "../frontend/app.js"), "utf8"));
  await until(() => !w.document.querySelector("#errorBanner").hidden);
  assert.match(
    w.document.querySelector("#errorBanner").textContent,
    /Sem conexão/,
  );
  const store = createStore(":memory:", { seed: false });
  t.after(() => store.close());
  w.fetch = async (url) => ({
    ok: true,
    json: async () =>
      url.startsWith("/api/indicadores")
        ? { data: store.overview() }
        : { data: [], meta: { total: 0 } },
  });
  w.document.querySelector("#refresh").click();
  await until(
    () => w.document.querySelector("#resultCount").textContent === "0",
  );
  assert.ok(
    w.document
      .querySelector("#deliveryRows")
      .textContent.includes("Nenhuma entrega encontrada"),
  );
  assert.equal(w.document.querySelector("#errorBanner").hidden, true);
});
