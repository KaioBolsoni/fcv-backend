import { Request, Response } from "express";
import {
  VinculoCampanhaInvalido,
  validarUtilizacaoOfertaCampanha,
} from "../models/beneficioCampanhaConveniadoModel";
import { acessoModel } from "../models/acessoModel";
import { colaboradorModel } from "../models/colaboradorModel";
import { beneficioConveniadoModel } from "../models/beneficioConveniadoModel";
import {
  RegraBeneficioErro,
  validarRegrasBeneficio,
} from "../models/beneficioModel";
import { utilizacaoModel } from "../models/utilizacaoModel";

async function obterDadosDaCriacao(req: Request, res: Response) {
  if (res.locals.usuario.escopo !== "COLABORADOR") return req.body;

  const { colaborador } = await acessoModel.buscarDados(Number(res.locals.usuario.id));
  if (!colaborador) {
    res.status(404).json({ erro: "Cadastro de colaborador não encontrado" });
    return null;
  }
  const dados: Record<string, unknown> = { colaborador_id: colaborador.id };
  for (const campo of [
    "beneficio_conveniado_id",
    "beneficio_campanha_conveniado_id",
    "valor_aplicado",
    "observacoes",
  ] as const) {
    if (req.body?.[campo] !== undefined) dados[campo] = req.body[campo];
  }
  return dados;
}

async function validarOfertaCampanha(id: number, res: Response): Promise<boolean> {
  try {
    await validarUtilizacaoOfertaCampanha(id);
    return true;
  } catch (erro) {
    if (!(erro instanceof VinculoCampanhaInvalido)) throw erro;
    res.status(erro.status).json({ erro: erro.message });
    return false;
  }
}

async function validarBeneficioComum(dados: any, res: Response): Promise<boolean> {
  const oferta = await beneficioConveniadoModel.buscarPorId(Number(dados.beneficio_conveniado_id));
  if (!oferta) {
    res.status(404).json({ erro: "Oferta de benefício não encontrada" });
    return false;
  }

  let usuarioId = Number(res.locals.usuario.id);
  if (res.locals.usuario.escopo !== "COLABORADOR") {
    const colaborador = await colaboradorModel.buscarPorId(Number(dados.colaborador_id));
    if (!colaborador) {
      res.status(404).json({ erro: "Cadastro de colaborador não encontrado" });
      return false;
    }
    usuarioId = Number(colaborador.usuario_id);
  }

  try {
    await validarRegrasBeneficio(usuarioId, Number(oferta.beneficio_id));
    return true;
  } catch (erro) {
    if (!(erro instanceof RegraBeneficioErro)) throw erro;
    res.status(erro.status).json({ erro: erro.message });
    return false;
  }
}

export const utilizacaoController = {
  async listar(req: Request, res: Response) {
    const lista = await utilizacaoModel.listar(req.query);
    res.json(lista);
  },

  async buscar(req: Request, res: Response) {
    const item = await utilizacaoModel.buscarPorId(Number(req.params.id));
    if (!item) {
      res.status(404).json({ erro: "Utilização não encontrada" });
      return;
    }
    res.json(item);
  },

  async criar(req: Request, res: Response) {
    const dados = await obterDadosDaCriacao(req, res);
    if (!dados) return;

    const valorAplicado = dados?.valor_aplicado;
    if (
      valorAplicado == null ||
      (typeof valorAplicado === "string" && !valorAplicado.trim()) ||
      !Number.isFinite(Number(valorAplicado))
    ) {
      res.status(400).json({ erro: "Valor aplicado inválido" });
      return;
    }

    const beneficioComum = dados?.beneficio_conveniado_id != null;
    const beneficioCampanha = dados?.beneficio_campanha_conveniado_id != null;
    if (beneficioComum === beneficioCampanha) {
      res.status(400).json({ erro: "Informe exatamente uma origem de benefício" });
      return;
    }

    if (beneficioComum) {
      const valida = await validarBeneficioComum(dados, res);
      if (!valida) return;
    } else {
      const valida = await validarOfertaCampanha(
        Number(dados.beneficio_campanha_conveniado_id), res,
      );
      if (!valida) return;
    }

    const id = await utilizacaoModel.criar(dados);
    const novo = await utilizacaoModel.buscarPorId(id);
    res.status(201).json(novo);
  },

  async atualizar(req: Request, res: Response) {
    const id = Number(req.params.id);
    if (req.body?.beneficio_campanha_conveniado_id != null) {
      const valida = await validarOfertaCampanha(
        Number(req.body.beneficio_campanha_conveniado_id), res,
      );
      if (!valida) return;
    }
    const alterados = await utilizacaoModel.atualizar(id, req.body);
    if (!alterados) {
      res.status(404).json({ erro: "Utilização não encontrada" });
      return;
    }
    const atualizado = await utilizacaoModel.buscarPorId(id);
    res.json(atualizado);
  },

  async excluir(req: Request, res: Response) {
    const excluidos = await utilizacaoModel.excluir(Number(req.params.id));
    if (!excluidos) {
      res.status(404).json({ erro: "Utilização não encontrada" });
      return;
    }
    res.status(204).send();
  },
};
