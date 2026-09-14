// Limita o titulo exibido nas colunas das tabelas de listagem (Minhas Solicitacoes, Aprovacoes,
// Contas a Pagar) pra nao estourar a largura da coluna com titulos muito longos -- o `truncate`
// via CSS ja corta visualmente, mas sem limite de caracteres o texto completo ainda fica no DOM
// e pode vazar em telas largas/zoom; cortar a string garante o limite em qualquer cenario.
export function truncarTitulo(titulo, max = 40) {
  const texto = titulo || '-';
  return texto.length > max ? `${texto.slice(0, max).trimEnd()}...` : texto;
}

export const STATUS_VARIANT = {
  pendente: 'warning',
  aprovado: 'success',
  reprovado: 'destructive',
  pago: 'info',
  cancelado: 'secondary',
};

export const STATUS_LABEL = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  pago: 'Pago',
  cancelado: 'Cancelado',
};

export const FORMA_PAGAMENTO_LABEL = {
  pix: 'Pix',
  boleto: 'Boleto',
  transferencia: 'Transferencia',
  cartao: 'Cartao',
  dinheiro: 'Dinheiro',
  cheque: 'Cheque',
  arquivo_bancario: 'Arquivo bancario',
  deposito_bancario: 'Deposito bancario',
  outros: 'Outros',
};

// Unifica os antigos eixos `categoria` (etapa do fluxo) + `tipo_documento` (natureza do arquivo)
// num unico campo -- ver 20260908130000_add_servicos_anexo_tipo_unificado.sql. Mantem
// consistencia com supabase/functions/servicos-api/index.ts (ANEXO_TIPOS).
export const TIPOS_ANEXO = [
  { value: 'orcamento', label: 'Orçamento' },
  { value: 'nota_fiscal', label: 'Nota fiscal' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'recibo', label: 'Recibo' },
  { value: 'comprovante_pix', label: 'Comprovante Pix' },
  { value: 'comprovante_pagamento', label: 'Comprovante de pagamento' },
  { value: 'documento_rh', label: 'Documento RH' },
  { value: 'pdf_unificado', label: 'PDF único (assinado)' },
  { value: 'fatura', label: 'Fatura' },
  { value: 'contrato', label: 'Contrato' },
  { value: 'comprovante_abastecimento', label: 'Comprovante de abastecimento' },
  { value: 'comprovante_hospedagem', label: 'Comprovante de hospedagem' },
  { value: 'comprovante_passagem', label: 'Comprovante de passagem / transporte' },
  { value: 'comprovante_pedagio', label: 'Comprovante de pedágio' },
  { value: 'conta_agua', label: 'Conta de água' },
  { value: 'conta_energia', label: 'Conta de energia elétrica' },
  { value: 'conta_telefone', label: 'Conta de telefone / internet' },
  { value: 'folha_comissao', label: 'Folha ou relação de comissão' },
  { value: 'comunicado_interno', label: 'Comunicado interno' },
  { value: 'outros', label: 'Outros' },
];

export const TIPO_ANEXO_LABEL = Object.fromEntries(
  TIPOS_ANEXO.map((item) => [item.value, item.label]),
);

// Heuristica por nome de arquivo para pre-selecionar o tipo do anexo -- so ajuda a acertar o
// caso comum (usuario nomeia o arquivo com base no que ele e), o select continua livre para o
// usuario corrigir. Ordem importa: regras mais especificas (boleto, nota fiscal) antes das mais
// genericas (comprovante), pra "boleto_nf_123.pdf" nao cair em "comprovante" por engano.
const REGRAS_CLASSIFICACAO_ANEXO = [
  { termos: ['boleto'], tipoAnexo: 'boleto' },
  { termos: ['nfe', 'nf-e', 'nota_fiscal', 'notafiscal', 'nota fiscal', 'danfe'], tipoAnexo: 'nota_fiscal' },
  { termos: ['pix'], tipoAnexo: 'comprovante_pix' },
  { termos: ['orcamento', 'orçamento', 'cotacao', 'cotação'], tipoAnexo: 'orcamento' },
  { termos: ['recibo'], tipoAnexo: 'recibo' },
];

export function inferirTipoAnexo(nomeArquivo) {
  const nome = (nomeArquivo || '').toLowerCase();
  const regra = REGRAS_CLASSIFICACAO_ANEXO.find(({ termos }) => termos.some((termo) => nome.includes(termo)));
  return regra ? regra.tipoAnexo : null;
}

// Solicitacao com plano de parcelas onde algumas ja foram pagas mas nao todas -- status da
// solicitacao continua 'aprovado' ate a ultima parcela ser quitada (so ai vira 'pago').
export function isParcialmentePago(row) {
  const total = Number(row.parcelas_total || 0);
  const pagas = Number(row.parcelas_pagas || 0);
  return total > 0 && pagas > 0 && pagas < total;
}

// Pendencia e um flag ortogonal ao status (nao um novo valor da maquina de estados) -- por isso
// nao entra em STATUS_LABEL/STATUS_VARIANT, ver CLAUDE.md do app. So se aplica a 'aprovado'.
export function isBloqueadaPorPendencia(row) {
  return Boolean(row.pendencia_bloqueio);
}

export const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
export const onlyLetters = (value) => String(value || '').replace(/[^a-zA-Z]/g, '');

export function formatDocumento(value) {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export function formatTelefone(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }
  return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

export function formatCep(value) {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.replace(/(\d{5})(\d{1,3})$/, '$1-$2');
}

// Campos de cadastro completo do fornecedor -- usado tanto na tela de gestao
// (Fornecedores.jsx) quanto no cadastro rapido dentro do NovaSolicitacaoDrawer.
export const FORNECEDOR_FORM_VAZIO = {
  nome: '',
  tipo_pessoa: '',
  documento: '',
  inscricao_estadual: '',
  email: '',
  telefone: '',
  endereco: '',
  cidade: '',
  uf: '',
  cep: '',
};

export function formatValor(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Usa pra timestamps de verdade (criado_em, analisado_em etc.) onde a hora importa -- o
// New Date(...) + toLocaleDateString ja converte corretamente pro fuso do navegador nesse caso.
export function formatData(data) {
  if (!data) return '-';
  return new Date(data).toLocaleDateString('pt-BR');
}

// Normaliza qualquer formato de data (Date, "YYYY-MM-DD" ou timestamp ISO) pra "YYYY-MM-DD",
// pra poder comparar/ordenar como string sem depender de timezone.
export function toDateOnly(data) {
  if (!data) return null;
  return String(data).slice(0, 10);
}

// Igual toDateOnly, mas devolve so o prefixo "YYYY-MM-DD" (via regex, sem passar por
// `new Date(...)`) quando `data` for string, e usa os getters locais quando for um objeto Date
// de verdade (ex. `new Date()` representando "agora"). Precisa ser assim porque colunas `date`
// puras (sem hora, ex. data_vencimento) chegam do backend como string -- e podem vir tanto
// "YYYY-MM-DD" quanto serializadas como timestamp UTC ("2026-08-14T00:00:00.000Z", se o driver
// SQL devolver um objeto Date que o JSON.stringify converte via toISOString). Passar essa string
// por `new Date(...)` reintroduz o bug: ECMA-262 trata string ISO so-de-data como meia-noite
// UTC, e em fuso negativo (Brasil, UTC-3) isso vira o dia anterior ao converter pro fuso local.
// Como a data literal (dia certo) ja esta nos 10 primeiros caracteres da string em qualquer um
// dos formatos, extrair direto por regex e a unica forma de nao introduzir esse offset.
export function toLocalDateOnly(data) {
  if (!data) return null;
  if (data instanceof Date) {
    if (Number.isNaN(data.getTime())) return null;
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
  }
  const match = String(data).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0] : null;
}

// Formata um campo que e conceitualmente so uma data de calendario (ex. data_vencimento,
// coluna `date` sem hora) sem passar pelo mesmo bug de formatData: nao usa `new Date(...)`,
// so reformata o prefixo "YYYY-MM-DD" (independente de vir puro ou como timestamp UTC) pra
// "DD/MM/YYYY" via string, sem nenhuma conversao de fuso -- ver comentario de toLocalDateOnly.
export function formatDataVencimento(data) {
  const iso = toLocalDateOnly(data);
  if (!iso) return '-';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

// Classifica o vencimento pra dar destaque visual (Badge) nas listagens/cards -- movido pra ca
// (era local a Pagamentos.jsx) pra Aprovacoes/SolicitacaoCard tambem poderem usar.
export function getVencimentoInfo(dataVencimento) {
  // toLocalDateOnly (nao toDateOnly): precisa bater com o dia que formatData mostra na tela,
  // que interpreta a data no fuso local do navegador -- se data_vencimento vier como timestamp
  // UTC (ex. "2026-08-14T00:00:00.000Z"), fatiar a string crua e comparar com um "hoje" tambem
  // em fuso local pode divergir em um dia perto da meia-noite.
  const dia = toLocalDateOnly(dataVencimento);
  if (!dia) return { key: 'sem_vencimento', label: 'Sem vencimento', variant: 'outline' };

  const agora = new Date();
  const hoje = toLocalDateOnly(agora);
  const amanhaDate = new Date(agora);
  amanhaDate.setDate(amanhaDate.getDate() + 1);
  const amanha = toLocalDateOnly(amanhaDate);

  if (dia < hoje) return { key: 'vencido', label: 'Vencido', variant: 'destructive' };
  if (dia === hoje) return { key: 'vence_hoje', label: 'Vence hoje', variant: 'warning' };
  if (dia === amanha) return { key: 'vence_amanha', label: 'Vence amanhã', variant: 'info' };
  return { key: 'no_prazo', label: 'No prazo', variant: 'success' };
}

export function formatDataHora(data) {
  if (!data) return '-';
  return new Date(data).toLocaleString('pt-BR');
}

// Junta os campos exibidos nas colunas das telas de solicitacoes (titulo, fornecedor,
// categoria, forma de pagamento, vencimento, aprovador, solicitante, status, valor) num
// unico texto, pra pesquisa cobrir qualquer coluna sem precisar de um input por campo.
// Descricao fica de fora de proposito: ela nao aparece mais nas colunas, so no drawer.
export function buildSolicitacaoSearchText(row) {
  return [
    row.numero,
    row.titulo,
    row.fornecedor,
    row.categoria,
    FORMA_PAGAMENTO_LABEL[row.forma_pagamento] || row.forma_pagamento,
    formatDataVencimento(row.vencimento_efetivo),
    row.solicitante_nome,
    row.aprovador_destino_nome,
    STATUS_LABEL[row.status] || row.status,
    formatValor(row.valor),
    row.pendencia_motivo,
  ]
    .filter(Boolean)
    .join(' ');
}
