import assert from "node:assert/strict";
import test from "node:test";
import knex, { type Knex } from "knex";
import {
  beneficioModel,
  obterIntervalosData,
  baseConsultaUtilizacaoBeneficio,
} from "../src/models/beneficioModel";
import {
  validarRegrasBeneficio,
  beneficioController,
  RegraBeneficioErro,
} from "../src/controllers/beneficioController";

test("obterIntervalosData: formata corretamente os limites de hoje e do mês", () => {
  const data = new Date(2026, 2, 15, 14, 30, 0);
  const intervalos = obterIntervalosData(data);

  assert.equal(intervalos.inicioHoje, "2026-03-15 00:00:00");
  assert.equal(intervalos.inicioAmanha, "2026-03-16 00:00:00");
  assert.equal(intervalos.inicioMes, "2026-03-01 00:00:00");
});

test("obterIntervalosData: lida com virada de mês", () => {
  const data = new Date(2026, 9, 31, 23, 59, 59);
  const intervalos = obterIntervalosData(data);

  assert.equal(intervalos.inicioHoje, "2026-10-31 00:00:00");
  assert.equal(intervalos.inicioAmanha, "2026-11-01 00:00:00");
  assert.equal(intervalos.inicioMes, "2026-10-01 00:00:00");
});

test("baseConsultaUtilizacaoBeneficio: compila query com joins e filtros corretos", () => {
  const banco = knex({ client: "mysql2" });
  try {
    const query = baseConsultaUtilizacaoBeneficio(10, 5, banco).toSQL();
    assert.match(query.sql, /select \* from `utilizacao`/i);
    assert.match(query.sql, /join `beneficio_conveniado` as `bc` on `bc`\.`id` = `utilizacao`\.`beneficio_conveniado_id`/i);
    assert.match(query.sql, /left join `colaborador` as `c` on `c`\.`id` = `utilizacao`\.`colaborador_id`/i);
    assert.match(query.sql, /`bc`\.`beneficio_id` = \?/i);
    assert.match(query.sql, /`c`\.`usuario_id` = \?/i);
    assert.match(query.sql, /`utilizacao`\.`status` not in \(\?, \?\)/i);
    assert.ok(query.bindings.includes(5));
    assert.ok(query.bindings.includes(10));
    assert.ok(query.bindings.includes("REPROVADA"));
    assert.ok(query.bindings.includes("ESTORNADA"));
  } finally {
    banco.destroy();
  }
});

test("contarUsosHoje e contarUsosMesAtual: geram SQL com restrições temporais adequadas", async () => {
  const banco = knex({ client: "mysql2" });
  const consultas: Knex.Sql[] = [];
  (banco.client as any).runner = (builder: Knex.QueryBuilder) => ({
    async run() {
      const sql = builder.toSQL();
      consultas.push(sql);
      return { total: 0 };
    },
  });

  try {
    const dataRef = new Date(2026, 9, 20, 10, 0, 0);
    await beneficioModel.contarUsosHoje(1, 2, dataRef, banco);
    await beneficioModel.contarUsosMesAtual(1, 2, dataRef, banco);

    assert.equal(consultas.length, 2);

    assert.match(consultas[0].sql, /count\(`utilizacao`\.`id`\) as `total`/i);
    assert.match(consultas[0].sql, /`utilizacao`\.`data_solicitacao` >= \?/);
    assert.match(consultas[0].sql, /`utilizacao`\.`data_solicitacao` < \?/);
    assert.ok(consultas[0].bindings.includes("2026-10-20 00:00:00"));
    assert.ok(consultas[0].bindings.includes("2026-10-21 00:00:00"));

    assert.match(consultas[1].sql, /`utilizacao`\.`data_solicitacao` >= \?/);
    assert.match(consultas[1].sql, /`utilizacao`\.`data_solicitacao` < \?/);
    assert.ok(consultas[1].bindings.includes("2026-10-01 00:00:00"));
    assert.ok(consultas[1].bindings.includes("2026-10-21 00:00:00"));
  } finally {
    await banco.destroy();
  }
});

test("validarRegrasBeneficio: dispara erro quando benefício já foi utilizado hoje", async () => {
  const originalContarHoje = beneficioModel.contarUsosHoje;
  try {
    beneficioModel.contarUsosHoje = async () => 1;

    await assert.rejects(
      async () => {
        await validarRegrasBeneficio(1, 2);
      },
      (erro: any) => {
        assert.ok(erro instanceof Error);
        assert.equal(erro.message, "Benefício já utilizado hoje");
        return true;
      }
    );
  } finally {
    beneficioModel.contarUsosHoje = originalContarHoje;
  }
});

test("validarRegrasBeneficio: dispara erro quando limite mensal é atingido", async () => {
  const originalContarHoje = beneficioModel.contarUsosHoje;
  const originalContarMes = beneficioModel.contarUsosMesAtual;
  const originalBuscarConfig = beneficioModel.buscarConfiguracao;

  try {
    beneficioModel.contarUsosHoje = async () => 0;
    beneficioModel.buscarConfiguracao = async () => ({
      id: 2,
      nome: "Vale Alimentação",
      quantidade_maxima_utilizacoes: 4,
    } as any);
    beneficioModel.contarUsosMesAtual = async () => 4;

    await assert.rejects(
      async () => {
        await validarRegrasBeneficio(1, 2);
      },
      (erro: any) => {
        assert.ok(erro instanceof Error);
        assert.equal(erro.message, "Limite mensal de utilizações atingido");
        return true;
      }
    );
  } finally {
    beneficioModel.contarUsosHoje = originalContarHoje;
    beneficioModel.contarUsosMesAtual = originalContarMes;
    beneficioModel.buscarConfiguracao = originalBuscarConfig;
  }
});

test("validarRegrasBeneficio: dispara erro quando limite mensal é ultrapassado", async () => {
  const originalContarHoje = beneficioModel.contarUsosHoje;
  const originalContarMes = beneficioModel.contarUsosMesAtual;
  const originalBuscarConfig = beneficioModel.buscarConfiguracao;

  try {
    beneficioModel.contarUsosHoje = async () => 0;
    beneficioModel.buscarConfiguracao = async () => ({
      id: 2,
      nome: "Vale Alimentação",
      quantidade_maxima_utilizacoes: 4,
    } as any);
    beneficioModel.contarUsosMesAtual = async () => 5;

    await assert.rejects(
      async () => {
        await validarRegrasBeneficio(1, 2);
      },
      (erro: any) => {
        assert.ok(erro instanceof Error);
        assert.equal(erro.message, "Limite mensal de utilizações atingido");
        return true;
      }
    );
  } finally {
    beneficioModel.contarUsosHoje = originalContarHoje;
    beneficioModel.contarUsosMesAtual = originalContarMes;
    beneficioModel.buscarConfiguracao = originalBuscarConfig;
  }
});

test("validarRegrasBeneficio: retorna true quando não usou hoje e não atingiu limite mensal", async () => {
  const originalContarHoje = beneficioModel.contarUsosHoje;
  const originalContarMes = beneficioModel.contarUsosMesAtual;
  const originalBuscarConfig = beneficioModel.buscarConfiguracao;

  try {
    beneficioModel.contarUsosHoje = async () => 0;
    beneficioModel.buscarConfiguracao = async () => ({
      id: 2,
      nome: "Vale Alimentação",
      quantidade_maxima_utilizacoes: 4,
    } as any);
    beneficioModel.contarUsosMesAtual = async () => 2;

    const resultado = await validarRegrasBeneficio("1", "2");
    assert.equal(resultado, true);

    const resultadoController = await beneficioController.validarRegrasBeneficio(1, 2);
    assert.equal(resultadoController, true);
  } finally {
    beneficioModel.contarUsosHoje = originalContarHoje;
    beneficioModel.contarUsosMesAtual = originalContarMes;
    beneficioModel.buscarConfiguracao = originalBuscarConfig;
  }
});

test("validarRegrasBeneficio: dispara erro quando benefício não existe", async () => {
  const originalContarHoje = beneficioModel.contarUsosHoje;
  const originalBuscarConfig = beneficioModel.buscarConfiguracao;
  const originalBuscarPorId = beneficioModel.buscarPorId;

  try {
    beneficioModel.contarUsosHoje = async () => 0;
    beneficioModel.buscarConfiguracao = async () => undefined as any;
    beneficioModel.buscarPorId = async () => undefined as any;

    await assert.rejects(
      async () => {
        await validarRegrasBeneficio(1, 9999);
      },
      (erro: any) => {
        assert.ok(erro instanceof Error);
        assert.equal(erro.message, "Benefício não encontrado");
        return true;
      }
    );
  } finally {
    beneficioModel.contarUsosHoje = originalContarHoje;
    beneficioModel.buscarConfiguracao = originalBuscarConfig;
    beneficioModel.buscarPorId = originalBuscarPorId;
  }
});

test("validarRegrasBeneficio: rejeita IDs inválidos", async () => {
  await assert.rejects(
    async () => {
      await validarRegrasBeneficio(0, 1);
    },
    /Identificadores de usuário e benefício são obrigatórios/
  );

  await assert.rejects(
    async () => {
      await validarRegrasBeneficio("abc", 1);
    },
    /Identificadores de usuário e benefício são obrigatórios/
  );
});
