"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { build } = require("esbuild");
const { JSDOM, VirtualConsole } = require("jsdom");
async function until(fn, timeout = 9000) {
  const deadline = Date.now() + timeout;
  while (!fn()) {
    if (Date.now() > deadline)
      throw new Error("Estado esperado não apareceu na integração React/API.");
    await new Promise((r) => setTimeout(r, 20));
  }
}
async function freePort() {
  const server = net.createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
}
function setInput(w, input, value) {
  Object.getOwnPropertyDescriptor(
    w.HTMLInputElement.prototype,
    "value",
  ).set.call(input, value);
  input.dispatchEvent(new w.Event("input", { bubbles: true }));
  input.dispatchEvent(new w.Event("change", { bubbles: true }));
}
test("React + FastAPI: solve, edit version, simulate, compare and reload immutable results", async (t) => {
  const { root, python } = await import("../../scripts/python-runtime.mjs");
  const port = await freePort(),
    origin = `http://127.0.0.1:${port}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-ui-"));
  const db = path.join(dir, "planner.db");
  const child = spawn(
    python,
    [
      "-m",
      "uvicorn",
      "planner.api:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_URL: "sqlite:///" + db,
        PLANNER_API_TOKEN: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  child.stderr.on("data", (chunk) => (logs += chunk));
  child.stdout.on("data", (chunk) => (logs += chunk));
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 60));
  }
  if (!ready) {
    child.kill();
    throw new Error("API de teste não iniciou: " + logs);
  }
  const compiled = await build({
    entryPoints: [path.join(root, "planner-ui/src/main.tsx")],
    bundle: true,
    format: "iife",
    write: false,
    platform: "browser",
    jsx: "automatic",
    loader: { ".css": "empty" },
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const html = fs.readFileSync(
    path.join(root, "planner-ui/index.html"),
    "utf8",
  );
  let dom;
  function render() {
    const console = new VirtualConsole();
    const failures = [];
    console.on("jsdomError", (error) => failures.push(error.message));
    const d = new JSDOM(html, {
      url: origin,
      runScripts: "outside-only",
      virtualConsole: console,
    });
    d.window.structuredClone = structuredClone;
    d.window.fetch = (url, options) => fetch(new URL(url, origin), options);
    d.window.HTMLElement.prototype.scrollIntoView = function () {};
    d.window.eval(compiled.outputFiles[0].text);
    return d;
  }
  t.after(async () => {
    dom?.window.close();
    child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", resolve);
    });
    fs.rmSync(dir, { recursive: true, force: true });
  });
  dom = render();
  let w = dom.window;
  let $ = (selector) => w.document.querySelector(selector);
  const buttons = () => [...w.document.querySelectorAll("button")];
  const button = (text) => buttons().find((b) => b.textContent.trim() === text);
  await until(() => $('select[aria-label="Cenário ativo"] option'));
  assert.equal(w.document.querySelectorAll(".metric-card").length, 4);
  button("Otimizar plano").click();
  await until(() => w.document.querySelectorAll(".route-card").length > 0);
  await until(() => $(".toast")?.textContent.includes("Plano calculado"));
  assert.equal(w.document.querySelectorAll(".map-point").length, 18);
  assert.ok($(".dispatch-footer").textContent.includes("verificados"));
  button("Editar dados").click();
  await until(() => $('[role="dialog"]'));
  button("Lotes e estoque").click();
  await until(() => $('input[aria-label="Quantidade SR-01"]'));
  setInput(w, $('input[aria-label="Quantidade SR-01"]'), "10");
  $('[role="dialog"] form').dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  await until(() => !$('[role="dialog"]'));
  let scenarios = (await (await fetch(origin + "/api/scenarios")).json()).data;
  assert.equal(scenarios[0].version, 2);
  assert.equal(scenarios[0].scenario.batches[0].quantity, 10);
  button("Simular cenário").click();
  await until(() => $('[role="dialog"]'));
  $('[role="dialog"] input[type="checkbox"]').click();
  $('[role="dialog"] form').dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  await until(
    () => $('select[aria-label="Cenário ativo"]').options.length === 2,
  );
  await until(() => w.document.querySelectorAll(".route-card").length > 0);
  await until(() => $(".toast")?.textContent.includes("Plano calculado"));
  scenarios = (await (await fetch(origin + "/api/scenarios")).json()).data;
  assert.equal(
    scenarios.find((s) => s.version === 2).scenario.vehicles.length,
    3,
  );
  assert.equal(
    scenarios.find((s) => s.version === 1).scenario.vehicles.length,
    4,
  );
  button("Cenários & histórico").click();
  await until(
    () => w.document.querySelectorAll(".history-panel tbody tr").length === 2,
  );
  const checkboxes = w.document.querySelectorAll(
    '.history-panel input[type="checkbox"]',
  );
  checkboxes[0].click();
  checkboxes[1].click();
  await until(() => $(".compare-history"));
  assert.equal(
    w.document.querySelectorAll(".compare-history tbody tr").length,
    6,
  );
  const oldRuns = (await (await fetch(origin + "/api/runs")).json()).data;
  const original = oldRuns.find(
    (r) =>
      r.scenario_version === 1 &&
      r.metrics.total_orders === 18 &&
      r.scenario_id === "demo-sp",
  );
  const oldSnapshot = (
    await (await fetch(origin + "/api/runs/" + original.id)).json()
  ).data;
  assert.equal(oldSnapshot.scenario_snapshot.batches[0].quantity, 300);
  dom.window.close();
  dom = render();
  w = dom.window;
  $ = (selector) => w.document.querySelector(selector);
  await until(() => w.document.querySelectorAll(".route-card").length > 0);
  assert.equal(
    (await (await fetch(origin + "/api/runs")).json()).data.length,
    2,
  );
  const activeId = $('select[aria-label="Cenário ativo"]').value;
  const beforeDispatch = (
    await (await fetch(origin + "/api/scenarios")).json()
  ).data.find((s) => s.id === activeId);
  button("Confirmar expedição").click();
  await until(() => $('[role="dialog"]'));
  $('[role="dialog"] input[type="checkbox"]').click();
  $('[role="dialog"] form').dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  await until(() => $(".dispatch-entry"));
  await until(() => !$('[role="dialog"]'));
  assert.ok(
    $(".dispatch-entry-body").textContent.includes("Saldo") ||
      $(".dispatch-entry-body").textContent.includes("SALDO"),
  );
  const dispatches = (await (await fetch(origin + "/api/dispatches")).json())
    .data;
  assert.equal(dispatches.length, 1);
  const afterDispatch = (
    await (await fetch(origin + "/api/scenarios")).json()
  ).data.find((s) => s.id === activeId);
  assert.equal(afterDispatch.version, beforeDispatch.version + 1);
  assert.equal(
    afterDispatch.scenario.orders.length,
    beforeDispatch.scenario.orders.length - dispatches[0].order_count,
  );
  const stockTotal = (record) =>
    record.scenario.batches.reduce((n, b) => n + b.quantity, 0);
  assert.equal(
    stockTotal(beforeDispatch) - stockTotal(afterDispatch),
    dispatches[0].unit_count,
  );
  assert.ok(afterDispatch.scenario.batches.every((b) => b.quantity >= 0));
  button("Estoque & frota").click();
  await until(() => !$(".dispatch-entry"));
  assert.equal($(".historical-banner"), null);
  assert.equal(button("Confirmar expedição"), undefined);
});
