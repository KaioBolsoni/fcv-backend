import db from "../database/db";
import { listarRecurso } from "../queries/recursos";

const TABELA = "beneficio_campanha_conveniado";

export class VinculoCampanhaInvalido extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
    this.name = "VinculoCampanhaInvalido";
  }
}

export const beneficioCampanhaConveniadoModel = {
  listar(consulta: unknown = {}) {
    return listarRecurso(db, "ofertas-campanha", consulta);
  },

  async validarVinculos(id: number) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new VinculoCampanhaInvalido("Identificador da oferta inválido", 400);
    }

    const vinculo = await db(`${TABELA} as oferta`)
      .leftJoin("beneficio_campanha as beneficio", "beneficio.id", "oferta.beneficio_campanha_id")
      .leftJoin("campanha_evento as campanha", "campanha.id", "beneficio.campanha_id")
      .where("oferta.id", id)
      .select(
        "oferta.id as oferta_id",
        "oferta.beneficio_campanha_id as beneficio_campanha_id_oferta",
        "beneficio.id as beneficio_campanha_id_encontrado",
        "beneficio.campanha_id as campanha_id_beneficio",
        "campanha.id as campanha_id_encontrada",
      )
      .first();

    if (!vinculo) {
      throw new VinculoCampanhaInvalido("Oferta de campanha não encontrada", 404);
    }
    if (
      !vinculo.beneficio_campanha_id_encontrado ||
      !vinculo.campanha_id_encontrada ||
      Number(vinculo.beneficio_campanha_id_oferta) !== Number(vinculo.beneficio_campanha_id_encontrado) ||
      Number(vinculo.campanha_id_beneficio) !== Number(vinculo.campanha_id_encontrada)
    ) {
      throw new VinculoCampanhaInvalido("Vínculo entre oferta, benefício e campanha inválido", 400);
    }

    return vinculo;
  },

  buscarPorId(id: number) {
    return db(TABELA).where({ id }).first();
  },

  async criar(dados: any) {
    const [id] = await db(TABELA).insert(dados);
    return id;
  },

  atualizar(id: number, dados: any) {
    return db(TABELA).where({ id }).update(dados);
  },

  excluir(id: number) {
    return db(TABELA).where({ id }).del();
  },
};
