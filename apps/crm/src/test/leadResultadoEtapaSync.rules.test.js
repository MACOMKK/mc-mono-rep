import { describe, expect, it } from 'vitest';
import { isLeadEligibleForResultadoEtapa, resolveEtapaAlvoResultado } from '@/lib/leadStatus';

// Nivel 2 (item 8) da auditoria do CRM (2026-10-20): gestao_crm.apply_activity_outcome() (banco,
// supabase/migrations/20261008150000_crm_apply_activity_outcome_automacoes.sql) e
// resolveEtapaAlvoResultado/isLeadEligibleForResultadoEtapa (apps/crm/src/lib/leadStatus.js)
// implementam a MESMA regra de negocio duas vezes, em runtimes diferentes, sincronizadas so por
// convencao (comentario "mantenha em sincronia com..." nos dois arquivos) -- nao por teste. Este
// arquivo e a rede de seguranca: `simulateApplyActivityOutcomeSql` abaixo e um port independente,
// linha a linha, do corpo em PL/pgSQL da trigger (nao chama nenhuma funcao de leadStatus.js) --
// se o SQL mudar e leadStatus.js nao acompanhar (ou vice-versa), os dois lados divergem para
// algum caso de teste abaixo e o teste quebra. Ao alterar qualquer um dos dois lados, atualize
// `simulateApplyActivityOutcomeSql` ou os helpers de leadStatus.js juntos, e rode este arquivo.

// Port 1:1 de gestao_crm.apply_activity_outcome() (so o branch pos "new.status = 'concluida'" e
// "lead_pipeline_id is not null" -- o resto da funcao e side-effect de banco, fora do escopo
// desta regra). etapas/automacoes ja vem filtradas para o pipeline do lead, como o frontend
// tambem assume.
function simulateApplyActivityOutcomeSql(resultado, etapaAtual, etapas, automacoes) {
  if (resultado === 'venda_realizada' || resultado === 'lead_perdido') {
    const alvoChave = resultado === 'venda_realizada' ? 'convertido' : 'perdido';
    const alvoTipo = resultado === 'venda_realizada' ? 'ganho' : 'perdido';

    let alvo = etapas.find((e) => e.chave_sistema === alvoChave) || null;
    if (!alvo) {
      alvo = [...etapas]
        .filter((e) => e.tipo === alvoTipo && e.ativo !== false)
        .sort((a, b) => Number(a.ordem) - Number(b.ordem))[0] || null;
    }
    // SQL: `if not found then raise exception` -- pipeline sem etapa do tipo nunca deveria
    // chegar aqui (trigger de integridade garante >=1 ganho e >=1 perdido por pipeline), omitido
    // aqui porque nao e um caso de regra de negocio, e um erro de configuracao.
    return { etapaAlvoId: alvo?.id ?? null, elegivel: Boolean(alvo) };
  }

  const alvo = automacoes.find((a) => a.resultado === resultado);
  if (!alvo) {
    return { etapaAlvoId: null, elegivel: false };
  }
  const etapaAlvo = etapas.find((e) => e.id === alvo.etapa_destino_id) || null;
  const move = etapaAtual?.tipo === 'em_andamento' && Number(etapaAtual.ordem) <= Number(etapaAlvo?.ordem);
  return { etapaAlvoId: etapaAlvo?.id ?? null, elegivel: Boolean(move) };
}

const etapa = (id, ordem, tipo, chave_sistema = null, extra = {}) => ({
  id, nome: id, cor: '#3b82f6', ordem, tipo, chave_sistema, ativo: true, exige_motivo: false, ...extra,
});

// Pipeline A: mesmo shape do Comercial (etapas de sistema completas).
const PIPELINE_A_ETAPAS = [
  etapa('a-novo', 0, 'em_andamento', 'novo'),
  etapa('a-tentativa', 1, 'em_andamento', 'tentativa_contato'),
  etapa('a-em_contato', 2, 'em_andamento', 'em_contato'),
  etapa('a-qualificado', 3, 'em_andamento', 'qualificado', { exige_motivo: true }),
  etapa('a-negociacao', 4, 'em_andamento', 'negociacao'),
  etapa('a-convertido', 5, 'ganho', 'convertido'),
  etapa('a-perdido', 6, 'perdido', 'perdido'),
];
const PIPELINE_A_AUTOMACOES = [
  { resultado: 'contato_realizado', etapa_destino_id: 'a-em_contato' },
  { resultado: 'sem_resposta', etapa_destino_id: 'a-tentativa' },
  { resultado: 'visita_agendada', etapa_destino_id: 'a-qualificado' },
  { resultado: 'test_drive', etapa_destino_id: 'a-qualificado' },
  { resultado: 'proposta_enviada', etapa_destino_id: 'a-negociacao' },
];

// Pipeline B: sem chave_sistema (pipeline novo tipo "Consorcio"), etapas livres, automacoes
// parciais (so 2 dos 5 resultados configurados), 2 etapas tipo ganho (pra exercitar o fallback
// por ordem quando nao ha chave_sistema='convertido').
const PIPELINE_B_ETAPAS = [
  etapa('b-entrada', 0, 'em_andamento'),
  etapa('b-analise', 1, 'em_andamento'),
  etapa('b-proposta', 2, 'em_andamento'),
  etapa('b-ganho-2', 4, 'ganho'),
  etapa('b-ganho-1', 3, 'ganho'),
  etapa('b-ganho-inativo', 2.5, 'ganho', null, { ativo: false }),
  etapa('b-perdido', 5, 'perdido'),
];
const PIPELINE_B_AUTOMACOES = [
  { resultado: 'contato_realizado', etapa_destino_id: 'b-analise' },
  { resultado: 'proposta_enviada', etapa_destino_id: 'b-proposta' },
];

const RESULTADOS = [
  'contato_realizado',
  'sem_resposta',
  'visita_agendada',
  'test_drive',
  'proposta_enviada',
  'venda_realizada',
  'lead_perdido',
  'resultado_invalido',
];

describe('sincronia apply_activity_outcome() (banco) x leadStatus.js (frontend)', () => {
  const cenarios = [
    { nome: 'Pipeline A (com chave_sistema)', etapas: PIPELINE_A_ETAPAS, automacoes: PIPELINE_A_AUTOMACOES },
    { nome: 'Pipeline B (sem chave_sistema, automacoes parciais)', etapas: PIPELINE_B_ETAPAS, automacoes: PIPELINE_B_AUTOMACOES },
  ];

  cenarios.forEach(({ nome, etapas, automacoes }) => {
    describe(nome, () => {
      etapas.forEach((etapaAtual) => {
        RESULTADOS.forEach((resultado) => {
          it(`resultado=${resultado}, etapa atual=${etapaAtual.id}`, () => {
            const sql = simulateApplyActivityOutcomeSql(resultado, etapaAtual, etapas, automacoes);
            const frontendAlvoId = resolveEtapaAlvoResultado(resultado, etapas, automacoes)?.id ?? null;
            const frontendElegivel = isLeadEligibleForResultadoEtapa(resultado, etapaAtual, etapas, automacoes);

            expect(frontendAlvoId).toBe(sql.etapaAlvoId);
            expect(frontendElegivel).toBe(sql.elegivel);
          });
        });
      });
    });
  });
});
