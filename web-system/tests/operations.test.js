"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { createStore } = require("../backend/store");
const { createApp, makeCsv } = require("../backend/server");
const now = () => new Date("2026-10-26T02:30:00Z"); // Still October 25 in São Paulo.
const shipment = {
  destino: "Hospital de Teste",
  medicamento: "Gaze estéril",
  lote: "LT-001",
  transportadora: "Parceiro",
  quantidade: 20,
  custo: 125.35,
  prioridade: "Alta",
  prazo: "2026-10-25",
};
function fresh(t, options = {}) {
  const store = createStore(":memory:", { seed: false, now, ...options });
  t.after(() => store.close());
  return store;
}
test("empty operation has truthful zero metrics and no fabricated punctuality", (t) => {
  const s = fresh(t);
  assert.equal(s.overview().total, 0);
  assert.equal(s.overview().pontualidade, null);
  assert.deepEqual(s.list(), []);
});
test("data survives reopening the database and demo is seeded only once", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "logistics-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "data.sqlite");
  let s = createStore(file, { now });
  assert.equal(s.list().length, 18);
  s.add(shipment);
  s.close();
  s = createStore(file, { now });
  assert.equal(s.list().length, 19);
  assert.equal(s.detail(19).custo, 125.35);
  s.close();
});
test("invalid business inputs leave no partial delivery or history", (t) => {
  const s = fresh(t);
  for (const input of [
    { ...shipment, quantidade: -1 },
    { ...shipment, custo: "12" },
    { ...shipment, prazo: "2026-02-30" },
    { ...shipment, prioridade: "inexistente" },
    { ...shipment, destino: " " },
    null,
  ])
    assert.throws(() => s.add(input));
  assert.equal(s.list().length, 0);
});
test("shipment lifecycle is ordered, versioned, and audited atomically", (t) => {
  const s = fresh(t),
    item = s.add(shipment);
  assert.equal(item.eventos.length, 1);
  assert.throws(
    () => s.changeStatus(item.id, { status: "Entregue", versao: 1 }),
    (e) => e.status === 409,
  );
  const moving = s.changeStatus(item.id, { status: "Em trânsito", versao: 1 });
  assert.equal(moving.versao, 2);
  assert.throws(
    () => s.changeStatus(item.id, { status: "Cancelada", versao: 1 }),
    (e) => e.status === 409,
  );
  const delivered = s.changeStatus(item.id, { status: "Entregue", versao: 2 });
  assert.equal(delivered.eventos.length, 3);
  assert.equal(delivered.entregue_em, now().toISOString());
  assert.throws(
    () => s.changeStatus(item.id, { status: "Pendente", versao: 3 }),
    (e) => e.status === 409,
  );
  assert.equal(s.detail(item.id).eventos.length, 3);
  assert.equal(s.overview().pontualidade, 100);
});
test("deadline expires by São Paulo day and cancelled costs are excluded", (t) => {
  const s = fresh(t);
  const yesterday = s.add({ ...shipment, prazo: "2026-10-24" });
  s.add(shipment);
  assert.equal(s.list({ atraso: "1" }).length, 1);
  assert.equal(s.overview().data_referencia, "2026-10-25");
  s.changeStatus(yesterday.id, { status: "Cancelada", versao: 1 });
  assert.equal(s.overview().atrasadas, 0);
  assert.equal(s.overview().custo_total, 125.35);
  assert.equal(s.overview().unidades, 20);
});
test("filters combine and malicious search text remains data", (t) => {
  const s = fresh(t);
  s.add(shipment);
  s.add({ ...shipment, destino: "Outro destino", prioridade: "Normal" });
  assert.equal(
    s.list({ q: "HOSPITAL", prioridade: "Alta", status: "Pendente" }).length,
    1,
  );
  assert.equal(s.list({ q: "' OR 1=1 --" }).length, 0);
  assert.throws(() => s.list({ status: "unknown" }));
});
test("CSV preserves delimiters and neutralizes spreadsheet formulas", (t) => {
  const s = fresh(t);
  const item = s.add({ ...shipment, destino: "=1+1", lote: 'L;"1' });
  const csv = makeCsv([item]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"L;""1"'));
});
async function running(t) {
  const store = fresh(t),
    server = createApp(store);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, store };
}
test("HTTP contract supports create, list, detail, transition, filtered export and errors", async (t) => {
  const { url } = await running(t);
  let response = await fetch(`${url}/api/entregas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(shipment),
  });
  assert.equal(response.status, 201);
  const { data } = await response.json();
  response = await fetch(`${url}/api/entregas?q=Hospital`);
  assert.equal((await response.json()).meta.total, 1);
  response = await fetch(`${url}/api/entregas/${data.id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "Em trânsito", versao: 1 }),
  });
  assert.equal(response.status, 200);
  response = await fetch(`${url}/api/entregas/${data.id}`);
  assert.equal((await response.json()).data.status, "Em trânsito");
  response = await fetch(`${url}/api/entregas/exportar?status=Entregue`);
  assert.equal(response.status, 200);
  assert.equal((await response.text()).split("\r\n").length, 1);
  response = await fetch(`${url}/api/entregas/999`);
  assert.equal(response.status, 404);
  response = await fetch(`${url}/api/entregas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(response.status, 400);
});
test("HTTP rejects cross-site writes, non-JSON and oversized bodies", async (t) => {
  const { url } = await running(t);
  for (const [headers, body, status] of [
    [
      {
        Origin: "https://external.invalid",
        "Content-Type": "application/json",
      },
      JSON.stringify(shipment),
      403,
    ],
    [{ "Content-Type": "text/plain" }, "hello", 415],
    [
      { "Content-Type": "application/json" },
      JSON.stringify({ text: "x".repeat(17000) }),
      413,
    ],
  ]) {
    const response = await fetch(`${url}/api/entregas`, {
      method: "POST",
      headers,
      body,
    });
    assert.equal(response.status, status);
  }
});
test("frontend assets are served from same origin and database is not exposed", async (t) => {
  const { url } = await running(t);
  for (const asset of ["/", "/app.js", "/styles.css"]) {
    const r = await fetch(url + asset);
    assert.equal(r.status, 200);
    assert.match(
      r.headers.get("content-security-policy"),
      /frame-ancestors 'none'/,
    );
    assert.ok((await r.text()).length > 100);
  }
  assert.equal((await fetch(url + "/data/logistics.sqlite")).status, 404);
  assert.equal((await fetch(url + "/package.json")).status, 404);
});

test("empty database stays empty when later started with default seed", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "logistics-empty-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "data.sqlite");
  let s = createStore(file, { seed: false });
  s.close();
  s = createStore(file);
  assert.equal(s.list().length, 0);
  assert.equal(s.overview().demonstracao, false);
  s.close();
});
