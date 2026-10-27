"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");
async function until(fn) {
  const end = Date.now() + 4000;
  while (!fn()) {
    if (Date.now() > end)
      throw new Error("Prévia não carregou o resultado registrado.");
    await new Promise((r) => setTimeout(r, 20));
  }
}
test("standalone preview renders recorded solver output and rejects mutations", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "planner-preview-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = path.join(dir, "preview.html");
  const build = spawnSync(
    process.execPath,
    ["scripts/build-preview.mjs", out],
    { encoding: "utf8" },
  );
  assert.equal(build.status, 0, build.stderr);
  const html = readFileSync(out, "utf8");
  const dom = new JSDOM(html, {
    url: "file:///preview.html",
    runScripts: "dangerously",
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.Response = Response;
      w.structuredClone = structuredClone;
    },
  });
  t.after(() => dom.window.close());
  const $ = (selector) => dom.window.document.querySelector(selector);
  await until(
    () => dom.window.document.querySelectorAll(".route-card").length > 0,
  );
  assert.equal(dom.window.document.querySelectorAll(".map-point").length, 18);
  assert.match($(".preview-note").textContent, /SOMENTE LEITURA/);
  assert.equal(dom.window.document.querySelectorAll(".metric-card").length, 4);
  const optimize = [...dom.window.document.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === "Otimizar plano",
  );
  assert.equal(optimize.disabled, true);
  assert.equal($("[role=dialog]"), null);
  assert.match($(".public-demo-banner").textContent, /DEMONSTRAÇÃO/);
  const denied = await dom.window.fetch("/api/scenarios", { method: "POST" });
  assert.equal(denied.status, 403);
});
