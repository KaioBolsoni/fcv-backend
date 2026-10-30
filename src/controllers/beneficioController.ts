
import { Request, Response } from "express";
import { beneficioModel } from "../models/beneficioModel";

export class RegraBeneficioErro extends Error {
  readonly status: number;

  constructor(mensagem: string, status = 400) {
    super(mensagem);
    this.name = "RegraBeneficioErro";
    this.status = status;
  }
}

export async function validarRegrasBeneficio(
  usuarioId: string | number,
  beneficioId: string | number,
  dataReferencia: Date = new Date()
): Promise<boolean> {
  const idUsuario = Number(usuarioId);
  const idBeneficio = Number(beneficioId);

  if (!idUsuario || !idBeneficio) {
    throw new RegraBeneficioErro(
      "Identificadores de usuário e benefício são obrigatórios e devem ser válidos"
    );
  }

  const usosHoje = await beneficioModel.contarUsosHoje(
    idUsuario,
    idBeneficio,
    dataReferencia
  );

  if (usosHoje > 0) {
    throw new RegraBeneficioErro("Benefício já utilizado hoje");
  }

  const beneficio =
    (await beneficioModel.buscarConfiguracao(idBeneficio)) ??
    (await beneficioModel.buscarPorId(idBeneficio));

  if (!beneficio) {
    throw new RegraBeneficioErro("Benefício não encontrado", 404);
  }

  const limiteMensal = Number(
    beneficio.quantidade_maxima_utilizacoes ??
      (beneficio as any).limiteMensal ??
      (beneficio as any).limite
  );

  if (isNaN(limiteMensal) || limiteMensal <= 0) {
    throw new RegraBeneficioErro(
      "Benefício não possui limite mensal de utilizações válido configurado"
    );
  }

  const usosMesAtual = await beneficioModel.contarUsosMesAtual(
    idUsuario,
    idBeneficio,
    dataReferencia
  );

  if (usosMesAtual >= limiteMensal) {
    throw new RegraBeneficioErro("Limite mensal de utilizações atingido");
  }

  return true;
}

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

