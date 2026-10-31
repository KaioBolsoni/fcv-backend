import db from "../database/db";
import { listarRecurso } from "../queries/recursos";

const TABELA = "beneficio_campanha_conveniado";

function formatarDataSaoPaulo(data: Date): string {
  if (Number.isNaN(data.getTime())) {
    throw new VinculoCampanhaInvalido("Data de referência inválida", 400);
  }
  const partes = new Intl.DateTimeFormat("en", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(data);
  const parte = (tipo: string) => partes.find((item) => item.type === tipo)!.value;
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

function dataBancoValida(data: unknown): data is string {
  if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const [ano, mes, dia] = data.split("-").map(Number);
  return ano >= 1000 && new Date(Date.UTC(ano, mes - 1, dia)).toISOString().slice(0, 10) === data;
}

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

  async validarVinculos(id: number, dataReferencia = new Date()) {
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
        "oferta.status as status_oferta",
        "beneficio.status as status_beneficio",
        "campanha.status as status_campanha",
        "campanha.data_inicio as data_inicio_campanha",
        "campanha.data_fim as data_fim_campanha",
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
    if (vinculo.status_oferta !== "ATIVO") {
      throw new VinculoCampanhaInvalido("Oferta de campanha inativa", 400);
    }
    if (vinculo.status_beneficio !== "ATIVO") {
      throw new VinculoCampanhaInvalido("Benefício de campanha inativo", 400);
    }
    if (vinculo.status_campanha !== "ATIVA") {
      throw new VinculoCampanhaInvalido("Campanha ou evento não está ativo", 400);
    }
    if (!dataBancoValida(vinculo.data_inicio_campanha) || !dataBancoValida(vinculo.data_fim_campanha)) {
      throw new VinculoCampanhaInvalido("Período da campanha inválido", 400);
    }
    const hoje = formatarDataSaoPaulo(dataReferencia);
    if (hoje < vinculo.data_inicio_campanha || hoje > vinculo.data_fim_campanha) {
      throw new VinculoCampanhaInvalido("Campanha ou evento fora do período de vigência", 400);
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

export function validarUtilizacaoOfertaCampanha(
  id: number,
  dataReferencia?: Date,
) {
  return beneficioCampanhaConveniadoModel.validarVinculos(id, dataReferencia);
}
