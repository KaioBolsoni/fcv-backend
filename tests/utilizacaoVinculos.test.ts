import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import test from "node:test";
import type { Knex } from "knex";
import type { Request, Response } from "express";
import db from "../src/database/db";
import { utilizacaoController } from "../src/controllers/utilizacaoController";
import { acessoModel } from "../src/models/acessoModel";
import {
  beneficioCampanhaConveniadoModel,
  validarUtilizacaoOfertaCampanha,
} from "../src/models/beneficioCampanhaConveniadoModel";
import { beneficioConveniadoModel } from "../src/models/beneficioConveniadoModel";
import { beneficioModel } from "../src/models/beneficioModel";
import { utilizacaoModel } from "../src/models/utilizacaoModel";
import utilizacaoRoutes from "../src/routes/utilizacaoRoutes";

test("validarVinculos consulta e confere a cadeia completa", async () => {
  const cliente = db.client as unknown as {
    runner: (builder: Knex.QueryBuilder) => { run(): Promise<unknown> };
  };
  const runnerOriginal = cliente.runner;
  const valido = {
    oferta_id: 12,
    beneficio_campanha_id_oferta: 3,
    beneficio_campanha_id_encontrado: 3,
    campanha_id_beneficio: 5,
    campanha_id_encontrada: 5,
    status_oferta: "ATIVO",
    status_beneficio: "ATIVO",
    status_campanha: "ATIVA",
    data_inicio_campanha: "2026-10-01",
    data_fim_campanha: "2026-10-31",
  };
  const validar = (data: Date) => validarUtilizacaoOfertaCampanha(12, data);
  const referencia = new Date(Date.UTC(2026, 9, 15, 12));
  let resultado: unknown = valido;
  let consulta: Knex.Sql | undefined;
  cliente.runner = (builder) => ({
    async run() {
      const sql = builder.toSQL();
      assert.ok(!Array.isArray(sql));
      consulta = sql;
      return resultado;
    },
  });
  try {
    await assert.rejects(
      validarUtilizacaoOfertaCampanha(0, referencia),
      { status: 400 },
    );
    assert.deepEqual(await validar(referencia), valido);
    assert.match(consulta!.sql, /left join `beneficio_campanha` as `beneficio`/);
    assert.match(consulta!.sql, /left join `campanha_evento` as `campanha`/);
    assert.match(consulta!.sql, /`oferta`\.`status`/);
    assert.match(consulta!.sql, /`beneficio`\.`status`/);
    assert.match(consulta!.sql, /`campanha`\.`status`/);
    assert.match(consulta!.sql, /`campanha`\.`data_inicio`/);
    assert.match(consulta!.sql, /`campanha`\.`data_fim`/);
    assert.ok(consulta!.bindings.includes(12));
    resultado = undefined;
    await assert.rejects(validar(referencia), { status: 404 });
    for (const inconsistente of [
      { ...valido, beneficio_campanha_id_encontrado: null },
      { ...valido, beneficio_campanha_id_encontrado: 4 },
      { ...valido, campanha_id_encontrada: 6 },
      { ...valido, campanha_id_encontrada: null },
    ]) {
      resultado = inconsistente;
      await assert.rejects(validar(referencia), { status: 400 });
    }
    for (const [campo, status] of [
      ["status_oferta", "INATIVO"],
      ["status_beneficio", "INATIVO"],
      ["status_campanha", "PLANEJADA"],
      ["status_campanha", "ENCERRADA"],
      ["status_campanha", "CANCELADA"],
    ] as const) {
      resultado = { ...valido, [campo]: status };
      await assert.rejects(validar(referencia), { status: 400 });
    }
    resultado = valido;
    for (const data of [
      new Date(Date.UTC(2026, 9, 1, 3)),
      new Date(Date.UTC(2026, 9, 15, 12)),
      new Date(Date.UTC(2026, 10, 1, 2, 59, 59, 999)),
    ]) {
      assert.deepEqual(await validar(data), valido);
    }
    for (const data of [
      new Date(Date.UTC(2026, 9, 1, 2, 59, 59, 999)),
      new Date(Date.UTC(2026, 10, 1, 3)),
    ]) {
      await assert.rejects(validar(data), { status: 400 });
    }
    await assert.rejects(validar(new Date(Number.NaN)), { status: 400 });
    resultado = { ...valido, data_fim_campanha: "2026-02-30" };
    await assert.rejects(validar(referencia), { status: 400 });
  } finally {
    cliente.runner = runnerOriginal;
  }
});

function resposta(usuario = { id: 1, escopo: "FCV" }) {
  const estado: { status?: number; corpo?: unknown } = {};
  const res = {
    locals: { usuario },
    status(codigo: number) { estado.status = codigo; return this; },
    json(corpo: unknown) { estado.corpo = corpo; return this; },
  } as unknown as Response;
  return { estado, res };
}

test("criar usa o colaborador autenticado e ignora colaborador_id do corpo", async () => {
  const buscarDados = acessoModel.buscarDados;
  const buscarOferta = beneficioConveniadoModel.buscarPorId;
  const contarHoje = beneficioModel.contarUsosHoje;
  const buscarConfiguracao = beneficioModel.buscarConfiguracao;
  const contarMes = beneficioModel.contarUsosMesAtual;
  const criar = utilizacaoModel.criar;
  const buscar = Object.getOwnPropertyDescriptor(utilizacaoModel, "buscarPorId");
  let dadosCriados: Record<string, unknown> | undefined;
  try {
    acessoModel.buscarDados = async () => ({ colaborador: { id: 42 }, conveniado: null });
    beneficioConveniadoModel.buscarPorId = async () => ({ id: 8, beneficio_id: 5 });
    beneficioModel.contarUsosHoje = async (usuarioId, beneficioId) => {
      assert.equal(usuarioId, 20);
      assert.equal(beneficioId, 5);
      return 0;
    };
    beneficioModel.buscarConfiguracao = async () => ({
      id: 5, nome: "Benefício teste", quantidade_maxima_utilizacoes: 4,
    } as any);
    beneficioModel.contarUsosMesAtual = async () => 0;
    utilizacaoModel.criar = async (dados) => { dadosCriados = dados; return 7; };
    Object.defineProperty(utilizacaoModel, "buscarPorId", { configurable: true, value: async () => ({ id: 7 }) });
    const { estado, res } = resposta({ id: 20, escopo: "COLABORADOR" });
    await utilizacaoController.criar({
      body: {
        id: 100, colaborador_id: 999, beneficio_conveniado_id: 8, valor_aplicado: 10, status: "APROVADA",
        data_solicitacao: "2020-01-01", data_confirmacao: "2020-01-01",
        canal_validacao: "TERMINAL_IOT", token_qrcode: "forjado",
      },
    } as unknown as Request, res);
    assert.equal(dadosCriados?.colaborador_id, 42);
    assert.equal(dadosCriados?.beneficio_conveniado_id, 8);
    assert.equal(dadosCriados?.valor_aplicado, 10);
    for (const campo of ["id", "status", "data_solicitacao", "data_confirmacao", "canal_validacao", "token_qrcode"]) {
      assert.equal(Object.hasOwn(dadosCriados!, campo), false);
    }
    assert.equal(estado.status, 201);
  } finally {
    acessoModel.buscarDados = buscarDados;
    beneficioConveniadoModel.buscarPorId = buscarOferta;
    beneficioModel.contarUsosHoje = contarHoje;
    beneficioModel.buscarConfiguracao = buscarConfiguracao;
    beneficioModel.contarUsosMesAtual = contarMes;
    utilizacaoModel.criar = criar;
    if (buscar) Object.defineProperty(utilizacaoModel, "buscarPorId", buscar);
  }
});

test("criar bloqueia benefício comum que viola periodicidade sem persistir", async () => {
  const buscarDados = acessoModel.buscarDados;
  const buscarOferta = beneficioConveniadoModel.buscarPorId;
  const contarHoje = beneficioModel.contarUsosHoje;
  const criar = utilizacaoModel.criar;
  let tentativasDeCriacao = 0;
  try {
    acessoModel.buscarDados = async () => ({ colaborador: { id: 42 }, conveniado: null });
    beneficioConveniadoModel.buscarPorId = async () => ({ id: 8, beneficio_id: 5 });
    beneficioModel.contarUsosHoje = async () => 1;
    utilizacaoModel.criar = async () => { tentativasDeCriacao++; return 1; };
    const { estado, res } = resposta({ id: 20, escopo: "COLABORADOR" });
    await utilizacaoController.criar({
      body: { beneficio_conveniado_id: 8, valor_aplicado: 10 },
    } as Request, res);
    assert.equal(estado.status, 400);
    assert.deepEqual(estado.corpo, { erro: "Benefício já utilizado hoje" });
    assert.equal(tentativasDeCriacao, 0);
  } finally {
    acessoModel.buscarDados = buscarDados;
    beneficioConveniadoModel.buscarPorId = buscarOferta;
    beneficioModel.contarUsosHoje = contarHoje;
    utilizacaoModel.criar = criar;
  }
});

test("criar bloqueia colaborador autenticado sem cadastro", async () => {
  const buscarDados = acessoModel.buscarDados;
  const criar = utilizacaoModel.criar;
  let tentativasDeCriacao = 0;
  try {
    acessoModel.buscarDados = async () => ({ colaborador: null, conveniado: null });
    utilizacaoModel.criar = async () => { tentativasDeCriacao++; return 1; };
    const { estado, res } = resposta({ id: 20, escopo: "COLABORADOR" });
    await utilizacaoController.criar({ body: { colaborador_id: 42 } } as unknown as Request, res);
    assert.equal(estado.status, 404);
    assert.equal(tentativasDeCriacao, 0);
  } finally {
    acessoModel.buscarDados = buscarDados;
    utilizacaoModel.criar = criar;
  }
});

test("criar valida vínculo de campanha antes de persistir", async () => {
  const validar = beneficioCampanhaConveniadoModel.validarVinculos;
  const criar = utilizacaoModel.criar;
  const buscar = Object.getOwnPropertyDescriptor(utilizacaoModel, "buscarPorId");
  let validado = false;
  let persistido = false;
  try {
    beneficioCampanhaConveniadoModel.validarVinculos = async (id) => {
      assert.equal(id, 12);
      validado = true;
      return {
        oferta_id: 12,
        beneficio_campanha_id_oferta: 3,
        beneficio_campanha_id_encontrado: 3,
        campanha_id_beneficio: 5,
        campanha_id_encontrada: 5,
      };
    };
    utilizacaoModel.criar = async () => {
      assert.ok(validado);
      persistido = true;
      return 7;
    };
    Object.defineProperty(utilizacaoModel, "buscarPorId", { configurable: true, value: async () => ({ id: 7 }) });
    const { estado, res } = resposta();
    await utilizacaoController.criar({
      body: { beneficio_campanha_conveniado_id: 12, valor_aplicado: 10 },
    } as Request, res);
    assert.equal(persistido, true);
    assert.equal(estado.status, 201);
  } finally {
    beneficioCampanhaConveniadoModel.validarVinculos = validar;
    utilizacaoModel.criar = criar;
    if (buscar) Object.defineProperty(utilizacaoModel, "buscarPorId", buscar);
  }
});

test("criar bloqueia rejeição da função pública sem persistir", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: new Date(Date.UTC(2026, 9, 15, 12)) });
  const cliente = db.client as unknown as {
    runner: (builder: Knex.QueryBuilder) => { run(): Promise<unknown> };
  };
  const runnerOriginal = cliente.runner;
  const criar = utilizacaoModel.criar;
  let tentativasDeCriacao = 0;
  const vinculo = {
    beneficio_campanha_id_oferta: 3, beneficio_campanha_id_encontrado: 3,
    campanha_id_beneficio: 5, campanha_id_encontrada: 5,
    status_oferta: "ATIVO", status_beneficio: "ATIVO", status_campanha: "ATIVA",
    data_inicio_campanha: "", data_fim_campanha: "",
  };
  const partes = new Intl.DateTimeFormat("en", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const hoje = `${partes.find(p => p.type === "year")!.value}-${partes.find(p => p.type === "month")!.value}-${partes.find(p => p.type === "day")!.value}`;
  const deslocarDia = (dias: number) => {
    const data = new Date(`${hoje}T00:00:00Z`);
    data.setUTCDate(data.getUTCDate() + dias);
    return data.toISOString().slice(0, 10);
  };
  const casos = [
    { resultado: undefined, status: 404 },
    { resultado: { ...vinculo, beneficio_campanha_id_encontrado: null }, status: 400 },
    { resultado: { ...vinculo, beneficio_campanha_id_encontrado: 4 }, status: 400 },
    { resultado: { ...vinculo, campanha_id_encontrada: null }, status: 400 },
    { resultado: { ...vinculo, status_oferta: "INATIVO" }, status: 400 },
    { resultado: { ...vinculo, status_beneficio: "INATIVO" }, status: 400 },
    ...["PLANEJADA", "ENCERRADA", "CANCELADA"].map(status => ({ resultado: { ...vinculo, status_campanha: status }, status: 400 })),
    { resultado: { ...vinculo, data_inicio_campanha: deslocarDia(1), data_fim_campanha: deslocarDia(2) }, status: 400 },
    { resultado: { ...vinculo, data_inicio_campanha: deslocarDia(-2), data_fim_campanha: deslocarDia(-1) }, status: 400 },
  ];
  cliente.runner = () => ({
    async run() { return resultadoAtual; },
  });
  let resultadoAtual: unknown;
  try {
    utilizacaoModel.criar = async () => { tentativasDeCriacao++; return 1; };
    for (const caso of casos) {
      resultadoAtual = caso.resultado;
      const { estado, res } = resposta();
      await utilizacaoController.criar({
        body: { beneficio_campanha_conveniado_id: 12, valor_aplicado: 10 },
      } as Request, res);
      assert.equal(estado.status, caso.status);
      assert.equal(tentativasDeCriacao, 0);
    }
  } finally {
    cliente.runner = runnerOriginal;
    utilizacaoModel.criar = criar;
  }
});

test("atualizar bloqueia mudança para oferta inválida antes de persistir", async () => {
  const cliente = db.client as unknown as {
    runner: (builder: Knex.QueryBuilder) => { run(): Promise<unknown> };
  };
  const runnerOriginal = cliente.runner;
  const atualizar = Object.getOwnPropertyDescriptor(utilizacaoModel, "atualizar");
  let tentativasDeAtualizacao = 0;
  cliente.runner = () => ({
    async run() {
      return {
        beneficio_campanha_id_oferta: 3, beneficio_campanha_id_encontrado: 3,
        campanha_id_beneficio: 5, campanha_id_encontrada: 5,
        status_oferta: "INATIVO", status_beneficio: "ATIVO", status_campanha: "ATIVA",
        data_inicio_campanha: "2026-10-01", data_fim_campanha: "2026-10-31",
      };
    },
  });
  try {
    Object.defineProperty(utilizacaoModel, "atualizar", {
      configurable: true,
      value: async () => { tentativasDeAtualizacao++; return 1; },
    });
    const { estado, res } = resposta();
    await utilizacaoController.atualizar(
      { params: { id: "1" }, body: { beneficio_campanha_conveniado_id: 12 } } as unknown as Request,
      res,
    );
    assert.equal(estado.status, 400);
    assert.equal(tentativasDeAtualizacao, 0);
  } finally {
    cliente.runner = runnerOriginal;
    if (atualizar) Object.defineProperty(utilizacaoModel, "atualizar", atualizar);
  }
});

test("rota permite POST do colaborador e mantém GET restrito a FCV", async () => {
  const buscarDados = acessoModel.buscarDados;
  const buscarOferta = beneficioConveniadoModel.buscarPorId;
  const contarHoje = beneficioModel.contarUsosHoje;
  const buscarConfiguracao = beneficioModel.buscarConfiguracao;
  const contarMes = beneficioModel.contarUsosMesAtual;
  const criar = utilizacaoModel.criar;
  const buscar = Object.getOwnPropertyDescriptor(utilizacaoModel, "buscarPorId");
  let colaboradorCriado: number | undefined;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.usuario = { id: 20, escopo: req.header("x-escopo") ?? "COLABORADOR" };
    next();
  });
  app.use("/", utilizacaoRoutes);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    acessoModel.buscarDados = async () => ({ colaborador: { id: 42 }, conveniado: null });
    beneficioConveniadoModel.buscarPorId = async () => ({ id: 8, beneficio_id: 5 });
    beneficioModel.contarUsosHoje = async () => 0;
    beneficioModel.buscarConfiguracao = async () => ({
      id: 5, nome: "Benefício teste", quantidade_maxima_utilizacoes: 4,
    } as any);
    beneficioModel.contarUsosMesAtual = async () => 0;
    utilizacaoModel.criar = async (dados) => { colaboradorCriado = dados.colaborador_id; return 7; };
    Object.defineProperty(utilizacaoModel, "buscarPorId", { configurable: true, value: async () => ({ id: 7 }) });
    const base = `http://127.0.0.1:${address.port}`;
    const post = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", "x-escopo": "COLABORADOR" },
      body: JSON.stringify({ colaborador_id: 999, beneficio_conveniado_id: 8, valor_aplicado: 10 }),
    });
    const leitura = await fetch(base, { headers: { "x-escopo": "COLABORADOR" } });
    assert.equal(post.status, 201);
    assert.equal(colaboradorCriado, 42);
    assert.equal(leitura.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    acessoModel.buscarDados = buscarDados;
    beneficioConveniadoModel.buscarPorId = buscarOferta;
    beneficioModel.contarUsosHoje = contarHoje;
    beneficioModel.buscarConfiguracao = buscarConfiguracao;
    beneficioModel.contarUsosMesAtual = contarMes;
    utilizacaoModel.criar = criar;
    if (buscar) Object.defineProperty(utilizacaoModel, "buscarPorId", buscar);
  }
});
