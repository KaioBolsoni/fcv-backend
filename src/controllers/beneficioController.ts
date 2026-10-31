
import { Request, Response } from "express";
import { beneficioModel, validarRegrasBeneficio } from "../models/beneficioModel";
export { RegraBeneficioErro, validarRegrasBeneficio } from "../models/beneficioModel";

export const beneficioController = {
  async listar(req: Request, res: Response) {
    const lista = await beneficioModel.listar(req.query);
    res.json(lista);
  },

  async buscar(req: Request, res: Response) {
    const item = await beneficioModel.buscarPorId(Number(req.params.id));
    if (!item) {
      res.status(404).json({ erro: "Benefício não encontrado" });
      return;
    }
    res.json(item);
  },

  async criar(req: Request, res: Response) {
    const id = await beneficioModel.criar(req.body);
    const novo = await beneficioModel.buscarPorId(id);
    res.status(201).json(novo);
  },

  async atualizar(req: Request, res: Response) {
    const id = Number(req.params.id);
    const alterados = await beneficioModel.atualizar(id, req.body);
    if (!alterados) {
      res.status(404).json({ erro: "Benefício não encontrado" });
      return;
    }
    const atualizado = await beneficioModel.buscarPorId(id);
    res.json(atualizado);
  },

  async excluir(req: Request, res: Response) {
    const excluidos = await beneficioModel.excluir(Number(req.params.id));
    if (!excluidos) {
      res.status(404).json({ erro: "Benefício não encontrado" });
      return;
    }
    res.status(204).send();
  },

  validarRegrasBeneficio,
};
