// Schemas Zod reaproveitados entre Edge Functions (item #14 do SECURITY_CHECKLIST_20.md).
// Fica em _shared (nao em packages/validation) porque as Edge Functions rodam em Deno e so
// resolvem imports locais dentro da arvore supabase/functions -- packages/* e consumido pelos
// apps front-end via npm workspaces/Vite, um resolvedor de modulos diferente.
import { z } from 'https://esm.sh/zod@3.23.8';

export { z };

// Body das 3 functions de seguranca de login (security-check-login-lock, security-log-failed-login,
// security-log-login-success): todas sao fail-open por design (nunca devem bloquear um login
// legitimo por erro/formato inesperado) -- o schema so formaliza a forma esperada do body; campos
// ausentes ou de tipo errado viram undefined em vez de rejeitar a requisicao.
export const loginTelemetryBodySchema = z
  .object({
    email: z.string().optional().catch(undefined),
    sistema_slug: z.string().optional().catch(undefined),
  })
  .catch({});

// Body de admin-create-user (action: create/delete/update_password/update_email/unlink_assignments).
// Campos usam .nullish() (aceita string, null ou undefined) porque varios sao selects opcionais no
// front que podem mandar null explicito ao limpar o campo -- o objetivo aqui e barrar tipos
// claramente errados (array, objeto, numero) na porta de entrada, nao remodelar a obrigatoriedade
// de campo por acao, que ja e tratada com mensagens especificas mais abaixo no handler.
export const adminCreateUserBodySchema = z.object({
  action: z.string().nullish(),
  id: z.string().nullish(),
  email: z.string().nullish(),
  password: z.string().nullish(),
  reset_password: z.boolean().nullish(),
  nome: z.string().nullish(),
  funcao: z.string().nullish(),
  cpf: z.string().nullish(),
  telefone: z.string().nullish(),
  departamento_id: z.string().nullish(),
  cargo_id: z.string().nullish(),
  cargo: z.string().nullish(),
  data_nascimento: z.string().nullish(),
  data_admissao: z.string().nullish(),
  status: z.string().nullish(),
  unidade_id: z.string().nullish(),
  empresa_id: z.string().nullish(),
});

// Body do dispatcher generico action+entity, compartilhado por plataforma-api, central-api e
// relatorios-api (mesma "core" surface). `payload`/`filters` ficam como record generico aqui porque
// cada handler ja faz sua propria sanitizacao campo a campo por tipo (sanitizeSystemAccessPayload,
// sanitizeCollaboratorAccessPayload, sanitizePayload/ENTITY_CONFIG em central-api/relatorios-api) --
// este schema so barra o formato geral do body (ex: payload/filters vindo como array ou string em vez
// de objeto, ou action/entity/id vindo com tipo errado) antes de qualquer handler rodar. Em
// central-api/relatorios-api isso substitui casts `as` sem checagem alguma em runtime (`entity as
// keyof typeof ENTITY_CONFIG`, `payload as Record<string, unknown>`).
export const coreDispatcherBodySchema = z.object({
  action: z.string().nullish(),
  entity: z.string().nullish(),
  id: z.string().nullish(),
  system_slug: z.string().nullish(),
  app_context: z.string().nullish(),
  password: z.string().nullish(),
  email: z.string().nullish(),
  reset_password: z.boolean().nullish(),
  payload: z.record(z.unknown()).nullish(),
  filters: z.record(z.unknown()).nullish(),
  limit: z.union([z.number(), z.string()]).nullish(),
  offset: z.union([z.number(), z.string()]).nullish(),
});

// Registry de schemas Zod por entidade (passo 3 parte 2 do item #14), usado nos fallbacks
// genericos create/update de central-api/relatorios-api DEPOIS de sanitizePayload/ENTITY_CONFIG
// (que ja filtra quais campos existem) -- aqui so valida o TIPO de cada campo restante antes do
// insert/update, entidade por entidade, comecando por `colaboradores` (maior volume de escrita).
// Reaproveita o mesmo shape de campos ja usado em adminCreateUserBodySchema (passo 2) via .pick(),
// pra nao duplicar a definicao dos 12 campos de colaborador em dois lugares.
export const colaboradorFullFieldsSchema = adminCreateUserBodySchema.pick({
  nome: true,
  email: true,
  funcao: true,
  cpf: true,
  telefone: true,
  departamento_id: true,
  cargo_id: true,
  cargo: true,
  data_nascimento: true,
  data_admissao: true,
  status: true,
  unidade_id: true,
  empresa_id: true,
});

// Variante restrita usada no bloco reports-admin de relatorios-api/central-api (contexto de
// gestao de relatorios, onde so nome/unidade_id do colaborador podem ser editados por ali).
export const colaboradorReportsFieldsSchema = adminCreateUserBodySchema.pick({
  nome: true,
  unidade_id: true,
});

// `ativos` (ENTITY_CONFIG.allowedFields: nome, categoria, marca, modelo, numero_serie, patrimonio,
// unidade_id, localizacao_interna, observacao, status, estado, usuario_id) -- todos string/uuid,
// `status` e derivado server-side em normalizeAtivosPayload (nao vem do client), mas mantido aqui
// pra nao rejeitar se algum caller antigo mandar.
export const ativosFieldsSchema = z.object({
  nome: z.string().nullish(),
  categoria: z.string().nullish(),
  marca: z.string().nullish(),
  modelo: z.string().nullish(),
  numero_serie: z.string().nullish(),
  patrimonio: z.string().nullish(),
  unidade_id: z.string().nullish(),
  localizacao_interna: z.string().nullish(),
  observacao: z.string().nullish(),
  status: z.string().nullish(),
  estado: z.string().nullish(),
  usuario_id: z.string().nullish(),
});

// `linhas_corporativas` (ENTITY_CONFIG.allowedFields: tipo, nome, numero, operadora, status,
// unidade_id, colaborador_id, observacao) -- todos string/uuid.
export const linhasCorporativasFieldsSchema = z.object({
  tipo: z.string().nullish(),
  nome: z.string().nullish(),
  numero: z.string().nullish(),
  operadora: z.string().nullish(),
  status: z.string().nullish(),
  unidade_id: z.string().nullish(),
  colaborador_id: z.string().nullish(),
  observacao: z.string().nullish(),
});

// `contatos` (ENTITY_CONFIG.allowedFields: tipo, nome, identificador, nome_contato, telefone,
// email, descricao, unidade_id) -- todos string/uuid.
export const contatosFieldsSchema = z.object({
  tipo: z.string().nullish(),
  nome: z.string().nullish(),
  identificador: z.string().nullish(),
  nome_contato: z.string().nullish(),
  telefone: z.string().nullish(),
  email: z.string().nullish(),
  descricao: z.string().nullish(),
  unidade_id: z.string().nullish(),
});

// Demais entidades do ENTITY_CONFIG (menor volume de escrita), tipos confirmados nas migrations
// (supabase/migrations/) -- boolean/numeric/data onde a coluna real e boolean/integer/numeric/
// timestamptz, nao string, pra nao rejeitar payload legitimo por tipo errado.
export const unidadesFieldsSchema = z.object({
  nome: z.string().nullish(),
  cnpj: z.string().nullish(),
  cidade: z.string().nullish(),
  endereco: z.string().nullish(),
  telefone: z.string().nullish(),
  responsavel: z.string().nullish(),
  ativo: z.boolean().nullish(),
  empresa_id: z.string().nullish(),
});

export const infraEstruturaFieldsSchema = z.object({
  tipo: z.string().nullish(),
  nome: z.string().nullish(),
  valor_identificador: z.string().nullish(),
  descricao: z.string().nullish(),
  unidade_id: z.string().nullish(),
});

export const sistemasFieldsSchema = z.object({
  slug: z.string().nullish(),
  nome: z.string().nullish(),
  descricao: z.string().nullish(),
  ativo: z.boolean().nullish(),
});

export const contratosDocumentosFieldsSchema = z.object({
  titulo: z.string().nullish(),
  tipo: z.string().nullish(),
  fornecedor: z.string().nullish(),
  sistema_id: z.string().nullish(),
  unidade_id: z.string().nullish(),
  data_inicio: z.string().nullish(),
  data_vencimento: z.string().nullish(),
  valor: z.number().nullish(),
  status: z.string().nullish(),
  responsavel_colaborador_id: z.string().nullish(),
  observacoes: z.string().nullish(),
  arquivo_path: z.string().nullish(),
  arquivo_nome: z.string().nullish(),
  arquivo_tipo: z.string().nullish(),
  arquivo_tamanho: z.number().nullish(),
  link_externo: z.string().nullish(),
  criado_por: z.string().nullish(),
});

export const termosPosseFieldsSchema = z.object({
  codigo: z.string().nullish(),
  ativo_id: z.string().nullish(),
  colaborador_id: z.string().nullish(),
  status: z.string().nullish(),
  conteudo: z.string().nullish(),
  arquivo_path: z.string().nullish(),
  arquivo_nome: z.string().nullish(),
  arquivo_tipo: z.string().nullish(),
  arquivo_tamanho: z.number().nullish(),
  observacoes: z.string().nullish(),
  assinado_em: z.string().nullish(),
  devolvido_em: z.string().nullish(),
});

export const filaEmailsFieldsSchema = z.object({
  tipo: z.string().nullish(),
  destinatario: z.string().nullish(),
  assunto: z.string().nullish(),
  payload: z.unknown().nullish(),
  status: z.string().nullish(),
  tentativas: z.number().nullish(),
  max_tentativas: z.number().nullish(),
  agendado_em: z.string().nullish(),
  erro: z.string().nullish(),
  enviado_em: z.string().nullish(),
  processado_em: z.string().nullish(),
});

export const relatoriosFieldsSchema = z.object({
  id: z.string().nullish(),
  titulo: z.string().nullish(),
  descricao: z.string().nullish(),
  embed_code: z.string().nullish(),
  unidade_id: z.string().nullish(),
  todas_unidades: z.boolean().nullish(),
  categoria: z.string().nullish(),
  icone: z.string().nullish(),
  ativo: z.boolean().nullish(),
});

export const relatoriosUnidadesFieldsSchema = z.object({
  id: z.string().nullish(),
  relatorio_id: z.string().nullish(),
  unidade_id: z.string().nullish(),
});

export const permissoesRelatoriosFieldsSchema = z.object({
  id: z.string().nullish(),
  colaborador_id: z.string().nullish(),
  relatorio_id: z.string().nullish(),
});

export const permissoesFuncoesRelatoriosFieldsSchema = z.object({
  id: z.string().nullish(),
  nivel_acesso: z.string().nullish(),
  modulo: z.string().nullish(),
  permissao: z.string().nullish(),
});

export const avisosRelatoriosFieldsSchema = z.object({
  id: z.string().nullish(),
  relatorio_id: z.string().nullish(),
  titulo: z.string().nullish(),
  mensagem: z.string().nullish(),
  versao: z.number().nullish(),
  obrigatorio: z.boolean().nullish(),
  ativo: z.boolean().nullish(),
  criado_por: z.string().nullish(),
});

export const avisosRelatoriosAceitesFieldsSchema = z.object({
  id: z.string().nullish(),
  aviso_id: z.string().nullish(),
  relatorio_id: z.string().nullish(),
  colaborador_id: z.string().nullish(),
  versao_aceita: z.number().nullish(),
  aceito_em: z.string().nullish(),
});

export const logsAuditoriaRelatoriosFieldsSchema = z.object({
  entidade: z.string().nullish(),
  acao: z.string().nullish(),
  registro_id: z.string().nullish(),
  actor_colaborador_id: z.string().nullish(),
});

export const logsAuditoriaFieldsSchema = z.object({
  entidade: z.string().nullish(),
  acao: z.string().nullish(),
  registro_id: z.string().nullish(),
  responsavel_colaborador_id: z.string().nullish(),
});

export const permissoesCentralFieldsSchema = z.object({
  id: z.string().nullish(),
  funcao: z.string().nullish(),
  modulo: z.string().nullish(),
  nivel_acesso: z.string().nullish(),
});

// servicos-api (modulo Financeiro) -- fornecedores/categorias. `extrairDadosFornecedor` no
// arquivo ja normaliza/trunca tudo com String(valor ?? ''), entao o schema aqui so precisa barrar
// tipos claramente errados (numero, array, objeto) chegando nesses campos -- nao remodela a
// obrigatoriedade de `nome`/`id`, que continua sendo checada com as mensagens especificas atuais.
export const fornecedorContatoFieldsSchema = z.object({
  tipo_pessoa: z.string().nullish(),
  documento: z.string().nullish(),
  inscricao_estadual: z.string().nullish(),
  email: z.string().nullish(),
  telefone: z.string().nullish(),
  endereco: z.string().nullish(),
  cidade: z.string().nullish(),
  uf: z.string().nullish(),
  cep: z.string().nullish(),
});

export const criarFornecedorBodySchema = fornecedorContatoFieldsSchema.extend({
  nome: z.string().nullish(),
});

export const atualizarFornecedorBodySchema = fornecedorContatoFieldsSchema.extend({
  id: z.string().nullish(),
  nome: z.string().nullish(),
  ativo: z.boolean().nullish(),
});

export const criarCategoriaBodySchema = z.object({
  nome: z.string().nullish(),
});

export const atualizarCategoriaBodySchema = z.object({
  id: z.string().nullish(),
  nome: z.string().nullish(),
  ativo: z.boolean().nullish(),
});

// servicos-api -- set_permissao/marcar_pendencia/liberar_pendencia/atualizar_configuracao_modulo.
// `modulo`/`papel` continuam validados contra SERVICOS_MODULOS_CONFIG no handler (enum dinamico,
// nao fixo o bastante pra travar aqui em z.enum) -- o schema so garante que sao strings.
export const setPermissaoBodySchema = z.object({
  colaborador_id: z.string().nullish(),
  modulo: z.string().nullish(),
  papel: z.string().nullish(),
});

export const marcarPendenciaBodySchema = z.object({
  id: z.string().nullish(),
  motivo: z.string().nullish(),
});

export const liberarPendenciaBodySchema = z.object({
  id: z.string().nullish(),
  observacao: z.string().nullish(),
});

export const atualizarConfiguracaoModuloBodySchema = z.object({
  restringir_visibilidade_pagamento_dinheiro: z.boolean().nullish(),
  suprimento_caixa_sem_aprovador: z.boolean().nullish(),
  suprimento_caixa_auto_aprovar: z.boolean().nullish(),
  suprimento_caixa_departamentos_permitidos: z.array(z.string().uuid()).nullish(),
  restringir_reprovacao_contas_a_pagar: z.boolean().nullish(),
});

// Coordenadas fracionarias do carimbo de assinatura (mesmo formato de stampSignature em
// @macom/pdf-signature), usadas tanto em assinar_anexo quanto no `assinatura` opcional de
// registrar_anexo (PDF unico ja gerado com o carimbo embutido).
const posicaoAssinaturaSchema = z.object({
  pageIndex: z.number(),
  xFrac: z.number(),
  yFrac: z.number(),
  widthFrac: z.number(),
  heightFrac: z.number(),
});

// servicos-api -- registrar_anexo/criar_parcelas/registrar_pagamento_parcela. Enum de anexo
// (tipo_anexo) continua validado no handler contra ANEXO_TIPOS -- o schema so garante tipo string.
// `assinatura` e opcional: usado quando o arquivo enviado (ex. PDF unico) ja foi carimbado no
// client antes do upload, pra tambem gravar o evento de assinatura (assinaturas_anexo) no mesmo
// request que cria o anexo.
export const registrarAnexoBodySchema = z.object({
  solicitacao_id: z.string().nullish(),
  tipo_anexo: z.string().nullish(),
  nome_arquivo: z.string().nullish(),
  tipo_mime: z.string().nullish(),
  storage_path: z.string().nullish(),
  parcela_id: z.string().nullish(),
  sigiloso: z.boolean().nullish(),
  tamanho_bytes: z.number().nullish(),
  assinaturas_necessarias: z.number().int().min(1).max(2).nullish(),
  assinatura: posicaoAssinaturaSchema.nullish(),
});

// servicos-api -- assinar_anexo. `posicao` guarda as coordenadas fracionarias usadas no
// carimbo (mesmo formato de stampSignature em @macom/pdf-signature), so pra auditoria/replay.
export const assinarAnexoBodySchema = z.object({
  id: z.string().nullish(),
  storage_path: z.string().nullish(),
  nome_arquivo: z.string().nullish(),
  tamanho_bytes: z.number().nullish(),
  posicao: posicaoAssinaturaSchema.nullish(),
});

export const parcelaItemSchema = z.object({
  valor: z.number().nullish(),
  data_vencimento: z.string().nullish(),
});

export const criarParcelasBodySchema = z.object({
  solicitacao_id: z.string().nullish(),
  parcelas: z.array(parcelaItemSchema).nullish(),
});

export const registrarPagamentoParcelaBodySchema = z.object({
  id: z.string().nullish(),
});

// servicos-api -- create/update/reenviar_solicitacao (trio principal do modulo Financeiro,
// grava solicitacoes_pagamento). Os campos batem com CREATE_FIELDS/UPDATE_FIELDS do arquivo;
// `sanitizePayload` la continua sendo quem decide qual campo e aceito por acao (create vs update
// aceitam os mesmos campos, so a obrigatoriedade muda) -- o schema aqui so tipa. `forma_pagamento`
// continua validado contra FORMAS_PAGAMENTO em validateCreatePayload (enum fica no handler, mesmo
// padrao das outras actions). `comprovante_file_size` e `parcelas` sao lidos direto de
// body.payload (nao passam por sanitizePayload), por isso entram no schema tambem.
export const solicitacaoPagamentoPayloadFieldsSchema = z.object({
  titulo: z.string().nullish(),
  tipo_beneficiario: z.enum(['fornecedor', 'colaborador']).nullish(),
  fornecedor_id: z.string().nullish(),
  colaborador_beneficiario_id: z.string().nullish(),
  descricao: z.string().nullish(),
  valor: z.number().nullish(),
  categoria_id: z.string().nullish(),
  comprovante_path: z.string().nullish(),
  comprovante_file_size: z.number().nullish(),
  data_vencimento: z.string().nullish(),
  forma_pagamento: z.string().nullish(),
  empresa_id: z.string().nullish(),
  unidade_id: z.string().nullish(),
  departamento_id: z.string().nullish(),
  observacao: z.string().nullish(),
  aprovador_destino_id: z.string().nullish(),
  parcelas: z.array(parcelaItemSchema).nullish(),
  // Só usado em `create`, e só honrado se quem chama for admin (checado no handler) -- não faz
  // parte de CREATE_FIELDS/sanitizePayload, por isso precisa entrar aqui explicitamente, mesmo
  // padrão de comprovante_file_size/parcelas acima.
  eh_teste: z.boolean().nullish(),
});

export const criarSolicitacaoBodySchema = z.object({
  payload: solicitacaoPagamentoPayloadFieldsSchema.nullish(),
});

export const atualizarSolicitacaoBodySchema = z.object({
  id: z.string().nullish(),
  payload: solicitacaoPagamentoPayloadFieldsSchema.nullish(),
});

export const reenviarSolicitacaoBodySchema = atualizarSolicitacaoBodySchema;

export const deletarSolicitacaoBodySchema = z.object({
  id: z.string().nullish(),
});

export const marcarTesteBodySchema = z.object({
  id: z.string().nullish(),
  eh_teste: z.boolean().nullish(),
});

// servicos-api -- atualizar_vencimento/atualizar_vencimento_parcela. Schemas propositalmente
// minimos (so `id`+`data_vencimento`): diferente de atualizarSolicitacaoBodySchema, que aceita
// qualquer campo de solicitacaoPagamentoPayloadFieldsSchema, essas duas actions existem
// justamente para permitir editar vencimento numa janela de status mais ampla (inclui
// 'aprovado') sem abrir a porta para editar mais nada nessa janela.
export const atualizarVencimentoBodySchema = z.object({
  id: z.string().nullish(),
  data_vencimento: z.string().nullish(),
});

export const atualizarVencimentoParcelaBodySchema = z.object({
  id: z.string().nullish(),
  data_vencimento: z.string().nullish(),
});

export const setStatusBodySchema = z.object({
  id: z.string().nullish(),
  status: z.string().nullish(),
  observacao_analise: z.string().nullish(),
});

export const entitySchemas = {
  colaboradores: colaboradorFullFieldsSchema,
  ativos: ativosFieldsSchema,
  linhas_corporativas: linhasCorporativasFieldsSchema,
  contatos: contatosFieldsSchema,
  unidades: unidadesFieldsSchema,
  infra_estrutura: infraEstruturaFieldsSchema,
  sistemas: sistemasFieldsSchema,
  contratos_documentos: contratosDocumentosFieldsSchema,
  termos_posse: termosPosseFieldsSchema,
  fila_emails: filaEmailsFieldsSchema,
  relatorios: relatoriosFieldsSchema,
  relatorios_unidades: relatoriosUnidadesFieldsSchema,
  permissoes_relatorios: permissoesRelatoriosFieldsSchema,
  permissoes_funcoes_relatorios: permissoesFuncoesRelatoriosFieldsSchema,
  avisos_relatorios: avisosRelatoriosFieldsSchema,
  avisos_relatorios_aceites: avisosRelatoriosAceitesFieldsSchema,
  logs_auditoria_relatorios: logsAuditoriaRelatoriosFieldsSchema,
  logs_auditoria: logsAuditoriaFieldsSchema,
  permissoes_central: permissoesCentralFieldsSchema,
};
