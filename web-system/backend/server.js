"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { createStore, AppError } = require("./store");
const FRONTEND = path.resolve(__dirname, "../frontend");
const FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
};
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
function makeCsv(items) {
  return (
    "\uFEFF" +
    [
      [
        "ID",
        "Destino",
        "Produto",
        "Lote",
        "Quantidade",
        "Transportadora",
        "Prioridade",
        "Prazo",
        "Status",
        "Custo (BRL)",
      ],
      ...items.map((i) => [
        i.id,
        i.destino,
        i.medicamento,
        i.lote,
        i.quantidade,
        i.transportadora,
        i.prioridade,
        i.prazo,
        i.status,
        i.custo.toFixed(2),
      ]),
    ]
      .map((row) => row.map(csvCell).join(";"))
      .join("\r\n")
  );
}
async function readJson(req) {
  if (
    !(req.headers["content-type"] || "")
      .toLowerCase()
      .startsWith("application/json")
  )
    throw new AppError("Envie os dados como application/json.", 415);
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 16384) throw new AppError("Requisição muito grande.", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("JSON inválido.");
  }
}
function createApp(store) {
  return http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    const send = (code, body) => {
      res.writeHead(code, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url, "http://localhost"),
        filters = Object.fromEntries(url.searchParams);
      if (!["GET", "HEAD"].includes(req.method)) {
        if (
          req.headers["sec-fetch-site"] === "cross-site" ||
          (req.headers.origin &&
            new URL(req.headers.origin).host !== req.headers.host)
        )
          throw new AppError("Origem não permitida.", 403);
      }
      if (req.method === "GET" && url.pathname === "/api/health")
        return send(200, { status: "ok" });
      if (req.method === "GET" && url.pathname === "/api/indicadores")
        return send(200, { data: store.overview() });
      if (req.method === "GET" && url.pathname === "/api/entregas/exportar") {
        const csv = makeCsv(store.list(filters));
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="logistics-entregas.csv"',
        });
        return res.end(csv);
      }
      if (url.pathname === "/api/entregas") {
        if (req.method === "GET") {
          const data = store.list(filters);
          return send(200, { data, meta: { total: data.length } });
        }
        if (req.method === "POST")
          return send(201, { data: store.add(await readJson(req)) });
      }
      const match = url.pathname.match(
        /^\/api\/entregas\/([1-9]\d*)(\/status)?$/,
      );
      if (match) {
        const id = Number(match[1]);
        if (!Number.isSafeInteger(id))
          throw new AppError("Identificador inválido.");
        if (req.method === "GET" && !match[2])
          return send(200, { data: store.detail(id) });
        if (req.method === "PATCH" && match[2])
          return send(200, {
            data: store.changeStatus(id, await readJson(req)),
          });
      }
      if (["GET", "HEAD"].includes(req.method) && FILES[url.pathname]) {
        const [file, type] = FILES[url.pathname];
        res.writeHead(200, { "Content-Type": type });
        return res.end(
          req.method === "HEAD"
            ? undefined
            : fs.readFileSync(path.join(FRONTEND, file)),
        );
      }
      return send(404, { error: "Recurso não encontrado." });
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (!(error instanceof AppError)) console.error(error);
      send(error instanceof AppError ? error.status : 500, {
        error:
          error instanceof AppError
            ? error.message
            : "Falha interna. Tente novamente.",
      });
    }
  });
}
if (require.main === module) {
  const store = createStore(
    process.env.DB_PATH || path.join(__dirname, "../data/logistics.sqlite"),
    { seed: process.env.SEED_DEMO !== "0" },
  );
  const server = createApp(store),
    port = Number(process.env.PORT || 3000),
    host = process.env.HOST || "127.0.0.1";
  server.listen(port, host, () =>
    console.log(`Logistics Solution: http://${host}:${port}`),
  );
  const stop = () =>
    server.close(() => {
      store.close();
      process.exit(0);
    });
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
module.exports = { createApp, makeCsv };
