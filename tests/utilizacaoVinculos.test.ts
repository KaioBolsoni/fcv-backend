import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import { utilizacaoController } from "../src/controllers/utilizacaoController";
import {
  beneficioCampanhaConveniadoModel,
  VinculoCampanhaInvalido,
} from "../src/models/beneficioCampanhaConveniadoModel";
import { utilizacaoModel } from "../src/models/utilizacaoModel";

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
