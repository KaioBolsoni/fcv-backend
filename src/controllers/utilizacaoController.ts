import { Request, Response } from "express";
import {
  beneficioCampanhaConveniadoModel,
  VinculoCampanhaInvalido,
} from "../models/beneficioCampanhaConveniadoModel";
import { utilizacaoModel } from "../models/utilizacaoModel";

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
    if (req.body?.beneficio_campanha_conveniado_id != null) {
      try {
        await beneficioCampanhaConveniadoModel.validarVinculos(
          Number(req.body.beneficio_campanha_conveniado_id),
        );
      } catch (erro) {
        if (!(erro instanceof VinculoCampanhaInvalido)) {
          throw erro;
        }
        res.status(erro.status).json({ erro: erro.message });
        return;
      }
    }

    const id = await utilizacaoModel.criar(req.body);
    const novo = await utilizacaoModel.buscarPorId(id);
    res.status(201).json(novo);
  },

  async atualizar(req: Request, res: Response) {
    const id = Number(req.params.id);
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
