"use strict";
const { DatabaseSync } = require("node:sqlite");
const { mkdirSync } = require("node:fs");
const { dirname } = require("node:path");
const STATUSES = ["Pendente", "Em trânsito", "Entregue", "Cancelada"];
const TRANSITIONS = {
  Pendente: ["Em trânsito", "Cancelada"],
  "Em trânsito": ["Entregue", "Cancelada"],
  Entregue: [],
  Cancelada: [],
};
class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
function validateShipment(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AppError("Informe os dados da entrega.");
  const result = {};
  for (const [field, max] of Object.entries({
    destino: 100,
    medicamento: 100,
    lote: 40,
    transportadora: 80,
  })) {
    if (
      typeof body[field] !== "string" ||
      !body[field].trim() ||
      body[field].trim().length > max ||
      /[\u0000-\u001f]/.test(body[field])
    )
      throw new AppError(
        `O campo ${field} é obrigatório e deve ter até ${max} caracteres.`,
      );
    result[field] = body[field].trim();
  }
  if (
    !Number.isInteger(body.quantidade) ||
    body.quantidade < 1 ||
    body.quantidade > 1000000
  )
    throw new AppError("Quantidade deve ser um inteiro entre 1 e 1.000.000.");
  if (
    typeof body.custo !== "number" ||
    !Number.isFinite(body.custo) ||
    body.custo < 0 ||
    body.custo > 1000000
  )
    throw new AppError("Informe um custo entre R$ 0 e R$ 1.000.000.");
  if (!["Normal", "Alta", "Urgente"].includes(body.prioridade))
    throw new AppError("Prioridade inválida.");
  if (
    typeof body.prazo !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(body.prazo) ||
    !Number.isFinite(Date.parse(`${body.prazo}T12:00:00Z`)) ||
    new Date(`${body.prazo}T12:00:00Z`).toISOString().slice(0, 10) !==
      body.prazo ||
    body.prazo < "2000-01-01" ||
    body.prazo > "2100-12-31"
  )
    throw new AppError("Informe uma data de prazo válida.");
  return {
    ...result,
    quantidade: body.quantidade,
    custo_centavos: Math.round(body.custo * 100),
    prioridade: body.prioridade,
    prazo: body.prazo,
  };
}
function createStore(filename, { seed = true, now = () => new Date() } = {}) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS entregas (id INTEGER PRIMARY KEY,destino TEXT NOT NULL,medicamento TEXT NOT NULL,lote TEXT NOT NULL,transportadora TEXT NOT NULL,quantidade INTEGER NOT NULL CHECK(quantidade>0),custo_centavos INTEGER NOT NULL CHECK(custo_centavos>=0),prioridade TEXT NOT NULL,prazo TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Pendente',criado_em TEXT NOT NULL,atualizado_em TEXT NOT NULL,entregue_em TEXT,versao INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS eventos (id INTEGER PRIMARY KEY,entrega_id INTEGER NOT NULL REFERENCES entregas(id),status TEXT NOT NULL,descricao TEXT NOT NULL,criado_em TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS entregas_status_prazo ON entregas(status,prazo);
    CREATE TABLE IF NOT EXISTS meta(chave TEXT PRIMARY KEY,valor TEXT NOT NULL);`);
  const localDate = (value) =>
    value.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const date = () => localDate(now());
  const row = (value) =>
    value && {
      ...value,
      custo: value.custo_centavos / 100,
      atrasada:
        !["Entregue", "Cancelada"].includes(value.status) &&
        value.prazo < date(),
    };
  function transaction(fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  function detail(id) {
    const item = row(db.prepare("SELECT * FROM entregas WHERE id=?").get(id));
    if (!item) throw new AppError("Entrega não encontrada.", 404);
    return {
      ...item,
      eventos: db
        .prepare(
          "SELECT status,descricao,criado_em FROM eventos WHERE entrega_id=? ORDER BY id DESC",
        )
        .all(id),
    };
  }
  function add(input) {
    const v = validateShipment(input),
      stamp = now().toISOString();
    return transaction(() => {
      const info = db
        .prepare(
          "INSERT INTO entregas(destino,medicamento,lote,transportadora,quantidade,custo_centavos,prioridade,prazo,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          v.destino,
          v.medicamento,
          v.lote,
          v.transportadora,
          v.quantidade,
          v.custo_centavos,
          v.prioridade,
          v.prazo,
          stamp,
          stamp,
        );
      const id = Number(info.lastInsertRowid);
      db.prepare(
        "INSERT INTO eventos(entrega_id,status,descricao,criado_em) VALUES(?,?,?,?)",
      ).run(id, "Pendente", "Entrega cadastrada na operação.", stamp);
      return detail(id);
    });
  }
  function changeStatus(id, input) {
    if (
      !input ||
      !STATUSES.includes(input.status) ||
      !Number.isInteger(input.versao)
    )
      throw new AppError("Informe status e versão válidos.");
    return transaction(() => {
      const current = detail(id);
      if (current.versao !== input.versao)
        throw new AppError(
          "Esta entrega foi alterada. Atualize os dados antes de continuar.",
          409,
        );
      if (!TRANSITIONS[current.status].includes(input.status))
        throw new AppError(
          `Transição de ${current.status} para ${input.status} não permitida.`,
          409,
        );
      const stamp = now().toISOString();
      db.prepare(
        "UPDATE entregas SET status=?,atualizado_em=?,entregue_em=?,versao=versao+1 WHERE id=?",
      ).run(
        input.status,
        stamp,
        input.status === "Entregue" ? stamp : null,
        id,
      );
      db.prepare(
        "INSERT INTO eventos(entrega_id,status,descricao,criado_em) VALUES(?,?,?,?)",
      ).run(
        id,
        input.status,
        `Status alterado de ${current.status} para ${input.status}.`,
        stamp,
      );
      return detail(id);
    });
  }
  function list({ q = "", status = "", prioridade = "", atraso = "" } = {}) {
    if (status && !STATUSES.includes(status))
      throw new AppError("Filtro de status inválido.");
    if (prioridade && !["Normal", "Alta", "Urgente"].includes(prioridade))
      throw new AppError("Filtro de prioridade inválido.");
    if (q.length > 100)
      throw new AppError("Busca deve ter até 100 caracteres.");
    const query = q.toLocaleLowerCase("pt-BR");
    return db
      .prepare("SELECT * FROM entregas ORDER BY id DESC")
      .all()
      .map(row)
      .filter(
        (i) =>
          (!status || i.status === status) &&
          (!prioridade || i.prioridade === prioridade) &&
          (atraso !== "1" || i.atrasada) &&
          (!q ||
            `${i.id} ${i.destino} ${i.medicamento} ${i.lote} ${i.transportadora}`
              .toLocaleLowerCase("pt-BR")
              .includes(query)),
      );
  }
  function overview() {
    const all = list(),
      active = all.filter((i) => !["Entregue", "Cancelada"].includes(i.status)),
      delivered = all.filter((i) => i.status === "Entregue");
    const onTime = delivered.filter(
      (i) => localDate(new Date(i.entregue_em)) <= i.prazo,
    ).length;
    return {
      total: all.length,
      em_transito: all.filter((i) => i.status === "Em trânsito").length,
      pendentes: all.filter((i) => i.status === "Pendente").length,
      entregues: delivered.length,
      atrasadas: active.filter((i) => i.atrasada).length,
      unidades: all
        .filter((i) => i.status !== "Cancelada")
        .reduce((s, i) => s + i.quantidade, 0),
      custo_total:
        all
          .filter((i) => i.status !== "Cancelada")
          .reduce((s, i) => s + i.custo_centavos, 0) / 100,
      pontualidade: delivered.length
        ? Math.round((onTime / delivered.length) * 100)
        : null,
      por_status: STATUSES.map((status) => ({
        status,
        total: all.filter((i) => i.status === status).length,
      })),
      transportadoras: [...new Set(all.map((i) => i.transportadora))].map(
        (nome) => {
          const items = all.filter((i) => i.transportadora === nome);
          return {
            nome,
            total: items.length,
            entregues: items.filter((i) => i.status === "Entregue").length,
            atrasadas: items.filter((i) => i.atrasada).length,
          };
        },
      ),
      data_referencia: date(),
      demonstracao:
        db.prepare("SELECT valor FROM meta WHERE chave='demo'").get()?.valor ===
        "1",
    };
  }
  if (!db.prepare("SELECT valor FROM meta WHERE chave='initialized'").get())
    transaction(() => {
      db.prepare("INSERT INTO meta VALUES(?,?)").run("initialized", "1");
      db.prepare("INSERT INTO meta VALUES(?,?)").run("demo", seed ? "1" : "0");
      if (!seed) return;
      const names = [
        "Hospital Aurora",
        "UBS Jardim Sul",
        "Clínica Horizonte",
        "Hospital Santa Clara",
        "Centro de Saúde Vila Nova",
        "Farmácia Central",
      ];
      const products = [
        "Soro fisiológico 500 ml",
        "Paracetamol 500 mg",
        "Amoxicilina 500 mg",
        "Luvas descartáveis",
        "Dipirona 500 mg",
        "Gaze estéril",
      ];
      for (let i = 0; i < 18; i++) {
        const deadline = new Date(now());
        deadline.setUTCDate(deadline.getUTCDate() + (i % 7) - 3);
        const created = new Date(now());
        created.setUTCDate(created.getUTCDate() - 5);
        const status = [
          "Pendente",
          "Em trânsito",
          "Entregue",
          "Entregue",
          "Em trânsito",
          "Cancelada",
        ][i % 6];
        const delivered =
          status === "Entregue"
            ? new Date(now().getTime() - (i % 4) * 86400000).toISOString()
            : null;
        const info = db
          .prepare(
            "INSERT INTO entregas(destino,medicamento,lote,transportadora,quantidade,custo_centavos,prioridade,prazo,status,criado_em,atualizado_em,entregue_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            names[i % 6],
            products[(i + 2) % 6],
            `LT-2026-${String(i + 1).padStart(3, "0")}`,
            ["Via Saúde", "Rota Express", "MedLog"][i % 3],
            (i + 1) * 24,
            12000 + i * 1750,
            ["Normal", "Alta", "Urgente"][i % 3],
            localDate(deadline),
            status,
            created.toISOString(),
            now().toISOString(),
            delivered,
          );
        db.prepare(
          "INSERT INTO eventos(entrega_id,status,descricao,criado_em) VALUES(?,?,?,?)",
        ).run(
          Number(info.lastInsertRowid),
          status,
          "Registro fictício para demonstração do portfólio.",
          created.toISOString(),
        );
      }
    });
  return { add, detail, changeStatus, list, overview, close: () => db.close() };
}
module.exports = { createStore, AppError, STATUSES, TRANSITIONS };
