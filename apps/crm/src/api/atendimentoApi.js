import { crmApi } from '@macom/api-client/crmApi';

// Camada de dados do módulo "Atendimento" (chat WhatsApp + IA).
// Quem grava as conversas/mensagens é a Edge Function whatsapp-api (desacoplada, sem JWT de
// usuário -- ver supabase/functions/whatsapp-api/README.md), mas a leitura/escrita do frontend
// passa pelo crm-api, igual a todas as outras entidades de gestao_crm (crmDataClient.js):
// gestao_crm nunca foi exposto no PostgREST de produção, então .schema('gestao_crm') direto no
// Supabase client não funciona (erro 406) -- crm-api já resolve isso com conexão direta Postgres.

function mapConversaRow(row = {}) {
  return {
    id: row.id,
    cliente_id: row.cliente_id || '',
    lead_id: row.lead_id || '',
    telefone_normalizado: row.telefone_normalizado || '',
    canal: row.canal || 'whatsapp',
    status: row.status || 'aberta',
    ultima_mensagem_em: row.ultima_mensagem_em || null,
    ultima_mensagem_preview: row.ultima_mensagem_preview || '',
    nao_lida: Boolean(row.nao_lida),
    cliente_nome: row.cliente?.nome || '',
    created_date: row.criado_em || null,
    updated_date: row.atualizado_em || null,
  };
}

function mapMensagemRow(row = {}) {
  return {
    id: row.id,
    conversa_id: row.conversa_id,
    direcao: row.direcao,
    autor: row.autor,
    colaborador_id: row.colaborador_id || '',
    conteudo: row.conteudo || '',
    metadados: row.metadados || {},
    created_date: row.criado_em || null,
  };
}

async function listConversas({ status } = {}) {
  const rows = await crmApi.conversas_atendimento.list({
    filters: status ? { status } : {},
    orderBy: 'ultima_mensagem_em',
    ascending: false,
    limit: 200,
  });

  return rows.map(mapConversaRow);
}

async function listMensagens(conversaId) {
  if (!conversaId) return [];

  const rows = await crmApi.mensagens_atendimento.list({
    filters: { conversa_id: conversaId },
    orderBy: 'criado_em',
    ascending: true,
    limit: 500,
  });

  return rows.map(mapMensagemRow);
}

async function assumirConversa(conversaId) {
  await crmApi.conversas_atendimento.update(conversaId, { status: 'aguardando_humano' });
}

async function encerrarConversa(conversaId) {
  await crmApi.conversas_atendimento.update(conversaId, { status: 'encerrada' });
}

async function marcarConversaLida(conversaId) {
  if (!conversaId) return;
  await crmApi.conversas_atendimento.update(conversaId, { nao_lida: false });
}

// Envia de fato pelo WhatsApp (Meta ou Evolution API, conforme integracao ativa -- ver
// send_atendimento_mensagem em crm-api/index.ts) e so grava a mensagem/atualiza a conversa
// depois do envio ter sucesso.
async function enviarMensagemManual({ conversaId, texto }) {
  if (!conversaId || !texto?.trim()) {
    throw new Error('Conversa e texto da mensagem sao obrigatorios.');
  }

  const row = await crmApi.conversas_atendimento.sendMensagem({
    conversaId,
    texto: texto.trim(),
  });

  return mapMensagemRow(row);
}

export const atendimentoApi = {
  listConversas,
  listMensagens,
  assumirConversa,
  encerrarConversa,
  enviarMensagemManual,
  marcarConversaLida,
};
