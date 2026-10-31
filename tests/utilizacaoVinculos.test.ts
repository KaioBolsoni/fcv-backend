import assert from "node:assert/strict";
import test from "node:test";
import type { Knex } from "knex";
import type { Request, Response } from "express";
import db from "../src/database/db";
import { utilizacaoController } from "../src/controllers/utilizacaoController";
import {
  beneficioCampanhaConveniadoModel,
  VinculoCampanhaInvalido,
} from "../src/models/beneficioCampanhaConveniadoModel";
import { utilizacaoModel } from "../src/models/utilizacaoModel";

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
  };
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
    assert.deepEqual(await beneficioCampanhaConveniadoModel.validarVinculos(12), valido);
    assert.match(consulta!.sql, /left join `beneficio_campanha` as `beneficio`/);
    assert.match(consulta!.sql, /left join `campanha_evento` as `campanha`/);
    assert.ok(consulta!.bindings.includes(12));
    resultado = undefined;
    await assert.rejects(beneficioCampanhaConveniadoModel.validarVinculos(12), { status: 404 });
    for (const inconsistente of [
      { ...valido, beneficio_campanha_id_encontrado: 4 },
      { ...valido, campanha_id_encontrada: 6 },
      { ...valido, campanha_id_encontrada: null },
    ]) {
      resultado = inconsistente;
      await assert.rejects(beneficioCampanhaConveniadoModel.validarVinculos(12), { status: 400 });
    }
  } finally {
    cliente.runner = runnerOriginal;
  }
});

function resposta() {
  const estado: { status?: number; corpo?: unknown } = {};
  const res = {
    status(codigo: number) { estado.status = codigo; return this; },
    json(corpo: unknown) { estado.corpo = corpo; return this; },
  } as unknown as Response;
  return { estado, res };
}

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
    await utilizacaoController.criar({ body: { beneficio_campanha_conveniado_id: 12 } } as Request, res);
    assert.equal(persistido, true);
    assert.equal(estado.status, 201);
  } finally {
    beneficioCampanhaConveniadoModel.validarVinculos = validar;
    utilizacaoModel.criar = criar;
    if (buscar) Object.defineProperty(utilizacaoModel, "buscarPorId", buscar);
  }
});

test("criar bloqueia vínculo inexistente ou inconsistente sem persistir", async () => {
  const validar = beneficioCampanhaConveniadoModel.validarVinculos;
  const criar = utilizacaoModel.criar;
  try {
    utilizacaoModel.criar = async () => { throw new Error("Não deveria persistir"); };
    for (const [status, mensagem] of [[404, "Oferta ausente"], [400, "Vínculo inválido"]] as const) {
      beneficioCampanhaConveniadoModel.validarVinculos = async () => {
        throw new VinculoCampanhaInvalido(mensagem, status);
      };
      const { estado, res } = resposta();
      await utilizacaoController.criar({ body: { beneficio_campanha_conveniado_id: 12 } } as Request, res);
      assert.equal(estado.status, status);
      assert.deepEqual(estado.corpo, { erro: mensagem });
    }
  } finally {
    beneficioCampanhaConveniadoModel.validarVinculos = validar;
    utilizacaoModel.criar = criar;
  }
});
