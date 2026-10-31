
import db from "../database/db";
import { listarRecurso } from "../queries/recursos";

const TABELA = "beneficio";

export interface BeneficioConfiguracao {
  id: number;
  nome: string;
  descricao?: string | null;
  status: "ATIVO" | "INATIVO" | "DESCONTINUADO";
  tipo_beneficio: "PERCENTUAL" | "VALOR_FIXO";
  valor: number;
  quantidade_maxima_utilizacoes: number;
  tipo_janela: "CALENDARIO_FIXO" | "JANELA_MOVEL";
  unidade_ciclo?: "ANO" | "MES" | "SEMANA" | null;
  dia_reset?: string | null;
  intervalo_valor?: number | null;
  intervalo_unidade?: "DIA" | "MES" | null;
  referencia_contagem?: "ULTIMA_UTILIZACAO" | "DATA_ADMISSAO_COLABORADOR" | null;
}

export interface HistoricoUsoBeneficio {
  usosHoje: number;
  usosMesAtual: number;
}

export class RegraBeneficioErro extends Error {
  constructor(
    mensagem: string,
    readonly status = 400,
  ) {
    super(mensagem);
    this.name = "RegraBeneficioErro";
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

  const usosHoje = await beneficioModel.contarUsosHoje(idUsuario, idBeneficio, dataReferencia);
  if (usosHoje > 0) throw new RegraBeneficioErro("Benefício já utilizado hoje");

  const beneficio =
    (await beneficioModel.buscarConfiguracao(idBeneficio)) ??
    (await beneficioModel.buscarPorId(idBeneficio));
  if (!beneficio) throw new RegraBeneficioErro("Benefício não encontrado", 404);

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

  const usosMesAtual = await beneficioModel.contarUsosMesAtual(idUsuario, idBeneficio, dataReferencia);
  if (usosMesAtual >= limiteMensal) {
    throw new RegraBeneficioErro("Limite mensal de utilizações atingido");
  }
  return true;
}

export function obterIntervalosData(dataReferencia: Date = new Date()) {
  const ano = dataReferencia.getFullYear();
  const mes = dataReferencia.getMonth();
  const dia = dataReferencia.getDate();

  const mesFormatado = String(mes + 1).padStart(2, "0");
  const diaFormatado = String(dia).padStart(2, "0");

  const inicioHoje = `${ano}-${mesFormatado}-${diaFormatado} 00:00:00`;

  const proximoDia = new Date(ano, mes, dia + 1);
  const anoAmanha = proximoDia.getFullYear();
  const mesAmanha = String(proximoDia.getMonth() + 1).padStart(2, "0");
  const diaAmanha = String(proximoDia.getDate()).padStart(2, "0");
  const inicioAmanha = `${anoAmanha}-${mesAmanha}-${diaAmanha} 00:00:00`;

  const inicioMes = `${ano}-${mesFormatado}-01 00:00:00`;

  return { inicioHoje, inicioAmanha, inicioMes };
}

export function baseConsultaUtilizacaoBeneficio(
  usuarioId: number | string,
  beneficioId: number | string,
  conexaoBanco = db
) {
  const idUsuario = Number(usuarioId);
  const idBeneficio = Number(beneficioId);

  return conexaoBanco("utilizacao")
    .join(
      "beneficio_conveniado as bc",
      "bc.id",
      "utilizacao.beneficio_conveniado_id"
    )
    .leftJoin("colaborador as c", "c.id", "utilizacao.colaborador_id")
    .where("bc.beneficio_id", idBeneficio)
    .where("c.usuario_id", idUsuario)
    .whereNotIn("utilizacao.status", ["REPROVADA", "ESTORNADA"]);
}

export const beneficioModel = {
  listar(consulta: unknown = {}) {
    return listarRecurso(db, "beneficios", consulta);
  },

  async buscarPorId(id: number | string): Promise<BeneficioConfiguracao | undefined> {
    return db(TABELA).where({ id: Number(id) }).first();
  },

  async buscarConfiguracao(id: number | string): Promise<BeneficioConfiguracao | undefined> {
    return db(TABELA).where({ id: Number(id) }).first();
  },

  async buscarConfiguracoes(id: number | string): Promise<BeneficioConfiguracao | undefined> {
    return db(TABELA).where({ id: Number(id) }).first();
  },

  async buscarLimiteMensal(id: number | string): Promise<number | null> {
    const beneficio = await db(TABELA).where({ id: Number(id) }).first();
    if (!beneficio || beneficio.quantidade_maxima_utilizacoes == null) {
      return null;
    }
    return Number(beneficio.quantidade_maxima_utilizacoes);
  },

  async contarUsosHoje(
    usuarioId: number | string,
    beneficioId: number | string,
    dataReferencia: Date = new Date(),
    conexaoBanco = db
  ): Promise<number> {
    const { inicioHoje, inicioAmanha } = obterIntervalosData(dataReferencia);
    const resultado = await baseConsultaUtilizacaoBeneficio(
      usuarioId,
      beneficioId,
      conexaoBanco
    )
      .where("utilizacao.data_solicitacao", ">=", inicioHoje)
      .where("utilizacao.data_solicitacao", "<", inicioAmanha)
      .count<{ total: number | string }>({ total: "utilizacao.id" })
      .first();

    return Number(resultado?.total ?? 0);
  },

  async contarUsosMesAtual(
    usuarioId: number | string,
    beneficioId: number | string,
    dataReferencia: Date = new Date(),
    conexaoBanco = db
  ): Promise<number> {
    const { inicioMes, inicioAmanha } = obterIntervalosData(dataReferencia);
    const resultado = await baseConsultaUtilizacaoBeneficio(
      usuarioId,
      beneficioId,
      conexaoBanco
    )
      .where("utilizacao.data_solicitacao", ">=", inicioMes)
      .where("utilizacao.data_solicitacao", "<", inicioAmanha)
      .count<{ total: number | string }>({ total: "utilizacao.id" })
      .first();

    return Number(resultado?.total ?? 0);
  },

  async consultarHistoricoUso(
    usuarioId: number | string,
    beneficioId: number | string,
    dataReferencia: Date = new Date(),
    conexaoBanco = db
  ): Promise<HistoricoUsoBeneficio> {
    const [usosHoje, usosMesAtual] = await Promise.all([
      this.contarUsosHoje(usuarioId, beneficioId, dataReferencia, conexaoBanco),
      this.contarUsosMesAtual(usuarioId, beneficioId, dataReferencia, conexaoBanco),
    ]);

    return {
      usosHoje,
      usosMesAtual,
    };
  },

  async verificarUsoHoje(
    usuarioId: number | string,
    beneficioId: number | string,
    dataReferencia: Date = new Date(),
    conexaoBanco = db
  ): Promise<boolean> {
    const totalHoje = await this.contarUsosHoje(
      usuarioId,
      beneficioId,
      dataReferencia,
      conexaoBanco
    );
    return totalHoje > 0;
  },

  async criar(dados: any) {
    const [id] = await db(TABELA).insert(dados);
    return id;
  },

  atualizar(id: number | string, dados: any) {
    return db(TABELA).where({ id: Number(id) }).update(dados);
  },

  excluir(id: number | string) {
    return db(TABELA).where({ id: Number(id) }).del();
  },
};
