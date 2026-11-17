import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createSql } from '../_shared/db.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { loadIntegracaoCredenciais } from '../_shared/integracoes.ts';
import {
  sendWhatsappMessageMeta,
  sendWhatsappMessageEvolution,
  extractWhatsappMessageId,
  type WhatsappProvider,
} from '../_shared/whatsapp.ts';
import { downloadMediaMeta, downloadMediaEvolution, uploadMedia, type MediaTipo } from '../_shared/whatsappMedia.ts';
import { normalizePhone, telefoneNacionalCandidatos } from '../_shared/phone.ts';

// gestao_crm nao e' exposto via PostgREST (so acessivel por conexao direta Postgres) --
// mesmo padrao ja usado em crm-api/index.ts. Nao usar supabase-js .schema(...).from(...)
// aqui, da erro "Invalid schema: gestao_crm" (schema nao esta na lista exposta do gateway).
const databaseUrl = Deno.env.get('DATABASE_URL');
const sql = databaseUrl
  ? createSql(databaseUrl, { max: 3 })
  : null;

// Edge Function desacoplada do crm-api: nao exige JWT de usuario do CRM.
// Autentica a requisicao pelo secret proprio do canal (verify token / assinatura HMAC
// da Meta, ou token de webhook da Evolution API), igual ao padrao ja usado em
// processa-fila-email/enviar-termo-gmail.
//
// Provedor e' escolhido em runtime, sem exigir redeploy: se existir uma integracao
// ativa "whatsapp_evolution" no Console (Integracoes), usa a Evolution API (nao-oficial,
// via Baileys); caso contrario usa a Meta Cloud API (oficial), lendo os secrets de sempre
// via Deno.env. Ver README.md desta function para o passo a passo de cada modo.

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Erro inesperado';
  }
}


function truncatePreview(text: string, maxLength = 140) {
  const trimmed = (text || '').trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string) {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expectedHex = signatureHeader.slice('sha256='.length);

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const computedHex = bytesToHex(signature);

  if (computedHex.length !== expectedHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computedHex.length; i += 1) {
    mismatch |= computedHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return mismatch === 0;
}

function timingSafeEquals(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// Evolution API nao assina o corpo (sem HMAC como a Meta) -- a autenticacao do webhook e'
// feita por um token compartilhado na querystring da URL cadastrada na propria Evolution
// (ex.: .../whatsapp-api?token=xxx), comparado contra o campo "webhook_token" configurado
// na integracao "whatsapp_evolution" (Console > Integracoes).
function verifyEvolutionWebhookToken(req: Request, expectedToken: string) {
  const url = new URL(req.url);
  const providedToken = url.searchParams.get('token');
  if (!providedToken) return false;
  return timingSafeEquals(providedToken, expectedToken);
}

type IncomingMedia = {
  tipo: MediaTipo;
  mimeType: string;
  nomeArquivo: string | null;
  // Meta: id a resolver via GET /{media-id}. Evolution: key da mensagem, usada em
  // POST /chat/getBase64FromMediaMessage.
  metaMediaId?: string;
  evolutionMessageKey?: unknown;
};

type IncomingLocation = {
  latitude: number;
  longitude: number;
  nome: string | null;
  endereco: string | null;
};

type IncomingMessage = {
  messageId: string;
  fromPhone: string;
  text: string;
  media?: IncomingMedia;
  // Cliente compartilhou a localizacao (voluntariamente ou em resposta a um pedido da Meta,
  // ver sendWhatsappLocationRequestMeta em _shared/whatsapp.ts) -- so' esse campo OU media vem
  // preenchido numa mesma mensagem, nunca os dois.
  location?: IncomingLocation;
  // Nome do contato tal como o proprio WhatsApp manda (sem edicao nossa) -- Meta: contacts[].profile.name
  // casado por wa_id; Evolution/Baileys: pushName no proprio objeto da mensagem. Usado so' como
  // fallback de exibicao pra contato ainda sem lead/cliente vinculado, ver contato_nome na migration.
  contactName?: string | null;
  // Diagnostico de origem (so' Meta Cloud API) -- usado apenas para log em
  // gestao_crm.logs_auditoria (entidade "whatsapp_webhook_origem"), nao afeta o fluxo da
  // conversa. "referral" so vem preenchido quando o cliente iniciou a conversa clicando num
  // anuncio (Facebook/Instagram) com "click to WhatsApp"; phoneNumberId/displayPhoneNumber
  // identificam qual numero da WABA recebeu a mensagem.
  referral?: Record<string, unknown> | null;
  phoneNumberId?: string | null;
  displayPhoneNumber?: string | null;
};

function extractIncomingMessagesMeta(payload: any): IncomingMessage[] {
  const messages: IncomingMessage[] = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      const waMessages = Array.isArray(value?.messages) ? value.messages : [];
      const waContacts = Array.isArray(value?.contacts) ? value.contacts : [];
      const phoneNumberId =
        typeof value?.metadata?.phone_number_id === 'string' ? value.metadata.phone_number_id : null;
      const displayPhoneNumber =
        typeof value?.metadata?.display_phone_number === 'string' ? value.metadata.display_phone_number : null;
      for (const message of waMessages) {
        if (!message?.id || !message?.from) continue;

        const contactName =
          waContacts.find((contact: any) => contact?.wa_id === message.from)?.profile?.name || null;
        const referral =
          message?.referral && typeof message.referral === 'object' ? message.referral : null;

        const text = message?.text?.body;
        if (typeof text === 'string') {
          messages.push({
            messageId: message.id,
            fromPhone: message.from,
            text,
            contactName,
            referral,
            phoneNumberId,
            displayPhoneNumber,
          });
          continue;
        }

        if (message?.type === 'location' && message?.location) {
          const { latitude, longitude, name, address } = message.location;
          if (typeof latitude === 'number' && typeof longitude === 'number') {
            messages.push({
              messageId: message.id,
              fromPhone: message.from,
              text: '',
              contactName,
              referral,
              phoneNumberId,
              displayPhoneNumber,
              location: { latitude, longitude, nome: name || null, endereco: address || null },
            });
          }
          continue;
        }

        const mediaTipo: MediaTipo | null =
          message?.type === 'image' ? 'imagem' : message?.type === 'audio' ? 'audio' : message?.type === 'document' ? 'documento' : null;
        const mediaNode = mediaTipo ? message?.[message.type] : null;
        if (mediaTipo && mediaNode?.id) {
          messages.push({
            messageId: message.id,
            fromPhone: message.from,
            text: mediaNode?.caption || '',
            contactName,
            referral,
            phoneNumberId,
            displayPhoneNumber,
            media: {
              tipo: mediaTipo,
              mimeType: mediaNode.mime_type || 'application/octet-stream',
              nomeArquivo: mediaNode.filename || null,
              metaMediaId: mediaNode.id,
            },
          });
        }
      }
    }
  }

  return messages;
}

// Formato Baileys (usado pela Evolution API): evento "messages.upsert", corpo em
// payload.data (objeto unico) ou payload.data (array), conforme a versao da instancia.
// Ignora mensagens enviadas por nos mesmos (key.fromMe) e figurinha/sticker/contato
// (fora de escopo). Midia (imagem/audio/documento) so' traz metadados criptografados aqui --
// o binario e' baixado depois via downloadMediaEvolution, ver whatsappMedia.ts.
function extractIncomingMessagesEvolution(payload: any): IncomingMessage[] {
  const messages: IncomingMessage[] = [];
  if (payload?.event !== 'messages.upsert') return messages;

  const rawData = payload?.data;
  const entries = Array.isArray(rawData) ? rawData : rawData ? [rawData] : [];

  for (const entry of entries) {
    const key = entry?.key;
    if (!key?.id || !key?.remoteJid || key?.fromMe) continue;

    const fromPhone = String(key.remoteJid).split('@')[0];
    const msg = entry?.message;
    const contactName = typeof entry?.pushName === 'string' && entry.pushName.trim() ? entry.pushName.trim() : null;

    const text = msg?.conversation ?? msg?.extendedTextMessage?.text;
    if (typeof text === 'string' && text) {
      messages.push({ messageId: String(key.id), fromPhone, text, contactName });
      continue;
    }

    const locationMessage = msg?.locationMessage;
    if (locationMessage && typeof locationMessage.degreesLatitude === 'number' && typeof locationMessage.degreesLongitude === 'number') {
      messages.push({
        messageId: String(key.id),
        fromPhone,
        text: '',
        contactName,
        location: {
          latitude: locationMessage.degreesLatitude,
          longitude: locationMessage.degreesLongitude,
          nome: locationMessage.name || null,
          endereco: locationMessage.address || null,
        },
      });
      continue;
    }

    const mediaNode = msg?.imageMessage
      ? { tipo: 'imagem' as MediaTipo, node: msg.imageMessage }
      : msg?.audioMessage
        ? { tipo: 'audio' as MediaTipo, node: msg.audioMessage }
        : msg?.documentMessage
          ? { tipo: 'documento' as MediaTipo, node: msg.documentMessage }
          : null;
    if (mediaNode) {
      messages.push({
        messageId: String(key.id),
        fromPhone,
        text: mediaNode.node?.caption || '',
        contactName,
        media: {
          tipo: mediaNode.tipo,
          mimeType: mediaNode.node?.mimetype || 'application/octet-stream',
          nomeArquivo: mediaNode.node?.fileName || null,
          evolutionMessageKey: key,
        },
      });
    }
  }

  return messages;
}

// Eventos de status (enviado/entregue/lido/falha) de cada provedor. Meta manda isso no formato
// value.statuses[]; Evolution (evoapicloud/evolution-api) manda no evento "messages.update", com
// "status" como string (nao numerico, nao e' o enum WAMessageStatus do Baileys como se assumiu
// antes) -- validado em 2026-11-06 via payload real capturado com ngrok (ver log temporario que
// existia aqui): {"event":"messages.update","data":{"keyId":"...","fromMe":true,"status":
// "DELIVERY_ACK"|"READ","messageId":"<id interno, nao usar>"}}.
const META_STATUS_MAP: Record<string, string> = {
  sent: 'enviado',
  delivered: 'entregue',
  read: 'lido',
  failed: 'falha',
};

const EVOLUTION_STATUS_MAP: Record<string, string> = {
  ERROR: 'falha',
  SERVER_ACK: 'enviado',
  DELIVERY_ACK: 'entregue',
  READ: 'lido',
  PLAYED: 'lido', // midia de audio reproduzida, sem status mais especifico no nosso schema
};

type StatusUpdate = { messageId: string; status: string };

function extractStatusUpdatesMeta(payload: any): StatusUpdate[] {
  const updates: StatusUpdate[] = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const waStatuses = Array.isArray(change?.value?.statuses) ? change.value.statuses : [];
      for (const item of waStatuses) {
        const status = META_STATUS_MAP[String(item?.status)];
        if (item?.id && status) {
          updates.push({ messageId: item.id, status });
        }
      }
    }
  }

  return updates;
}

// So processa mensagens nossas (fromMe) -- sao as unicas que tem whatsapp_message_id gravado
// do nosso lado (ver extractWhatsappMessageId em _shared/whatsapp.ts). "keyId" e' o id do
// protocolo WhatsApp (o mesmo que extractWhatsappMessageId captura no envio); "messageId" e'
// um id interno da Evolution (formato cuid) e NAO deve ser usado pra casar com
// metadados.whatsapp_message_id.
function extractStatusUpdatesEvolution(payload: any): StatusUpdate[] {
  const updates: StatusUpdate[] = [];
  if (payload?.event !== 'messages.update') return updates;

  const rawData = payload?.data;
  const entries = Array.isArray(rawData) ? rawData : rawData ? [rawData] : [];

  for (const entry of entries) {
    const keyId = entry?.keyId;
    if (!keyId || !entry?.fromMe) continue;

    const status = EVOLUTION_STATUS_MAP[String(entry?.status)];
    if (status) {
      updates.push({ messageId: String(keyId), status });
    }
  }

  return updates;
}

async function callAi(openaiApiKey: string, history: { autor: string; conteudo: string }[]) {
  const messages = [
    {
      role: 'system',
      content:
        'Voce e um assistente de atendimento via WhatsApp de uma concessionaria. Responda de forma breve, cordial e objetiva em portugues.',
    },
    ...history.map((item) => ({
      role: item.autor === 'cliente' ? 'user' : 'assistant',
      content: item.conteudo,
    })),
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.4,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Falha ao consultar a IA.');
  }

  const reply = data?.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) {
    throw new Error('Resposta vazia da IA.');
  }

  return reply.trim();
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  // Provedor ativo e' decidido em runtime pelas integracoes cadastradas no Console
  // (Integracoes), sem secrets fixos: "whatsapp_evolution" tem prioridade se ativa, senao usa
  // "whatsapp_meta" se ativa, senao nenhum provedor esta configurado. Trocar de conta/BM na
  // Meta ou migrar pra Evolution e' so editar o registro no Console -- sem CLI, sem redeploy.
  const integracoesCtx = { supabaseUrl: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY };
  const evolutionCredenciais = await loadIntegracaoCredenciais('whatsapp_evolution', integracoesCtx);
  const metaCredenciais = evolutionCredenciais
    ? null
    : await loadIntegracaoCredenciais('whatsapp_meta', integracoesCtx);
  const provider: WhatsappProvider | null = evolutionCredenciais ? 'evolution' : metaCredenciais ? 'meta' : null;

  // Verificacao do webhook exigida pela Meta Cloud API na configuracao inicial (a Evolution
  // API nao usa esse handshake, entao isso so importa quando o provedor ativo e' a Meta).
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const webhookVerifyToken = typeof metaCredenciais?.verify_token === 'string' ? metaCredenciais.verify_token : null;

    if (mode === 'subscribe' && token && webhookVerifyToken && token === webhookVerifyToken) {
      return new Response(challenge || '', { status: 200, headers: corsHeaders });
    }

    return new Response('Forbidden', { status: 403, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nao configurados.');
    }
    if (!sql) {
      throw new Error('DATABASE_URL nao configurada.');
    }
    if (!provider) {
      throw new Error('Nenhum provedor de WhatsApp configurado (cadastre "whatsapp_meta" ou "whatsapp_evolution" no Console).');
    }

    const rawBody = await req.text();

    if (provider === 'meta') {
      const appSecret = typeof metaCredenciais?.app_secret === 'string' ? metaCredenciais.app_secret : null;
      if (!appSecret) {
        throw new Error('Campo "app_secret" nao configurado na integracao whatsapp_meta.');
      }
      const signatureHeader = req.headers.get('x-hub-signature-256');
      const validSignature = await verifyMetaSignature(rawBody, signatureHeader, appSecret);
      if (!validSignature) {
        return new Response(JSON.stringify({ success: false, error: 'Assinatura invalida.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      const webhookToken = evolutionCredenciais?.webhook_token;
      if (typeof webhookToken !== 'string' || !webhookToken) {
        throw new Error('Campo "webhook_token" nao configurado na integracao whatsapp_evolution.');
      }
      if (!verifyEvolutionWebhookToken(req, webhookToken)) {
        return new Response(JSON.stringify({ success: false, error: 'Token invalido.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const payload = JSON.parse(rawBody);
    const incomingMessages =
      provider === 'meta' ? extractIncomingMessagesMeta(payload) : extractIncomingMessagesEvolution(payload);

    // Log de diagnostico (temporario, pra investigar de onde estao vindo contatos novos --
    // anuncio clicado "click to WhatsApp" preenche message.referral; se nao vier nada, a
    // mensagem foi iniciada organicamente pelo cliente). Consultar com:
    // select criado_em, metadados from gestao_crm.logs_auditoria
    // where entidade = 'whatsapp_webhook_origem' order by criado_em desc;
    if (provider === 'meta' && incomingMessages.length > 0) {
      await sql`
        insert into gestao_crm.logs_auditoria (entidade, acao, metadados)
        values ('whatsapp_webhook_origem', 'mensagem_recebida', ${sql.json({
          mensagens: incomingMessages.map((m) => ({
            fromPhone: m.fromPhone,
            contactName: m.contactName || null,
            phoneNumberId: m.phoneNumberId || null,
            displayPhoneNumber: m.displayPhoneNumber || null,
            referral: m.referral || null,
          })),
        })})
      `.catch((logError) => {
        console.error('Falha ao gravar log de origem do webhook:', getErrorMessage(logError));
      });
    }

    if (incomingMessages.length === 0) {
      // Webhooks de status (enviado/entregue/lido) tambem chegam aqui, sem nenhuma mensagem em
      // value.messages/messages.upsert -- ver extractStatusUpdatesMeta/extractStatusUpdatesEvolution.
      const statusUpdates =
        provider === 'meta' ? extractStatusUpdatesMeta(payload) : extractStatusUpdatesEvolution(payload);

      for (const update of statusUpdates) {
        // So avanca o status (nunca regride) -- evita que um reenvio fora de ordem do webhook
        // sobrescreva "lido" de volta para "entregue". "falha" sempre vence.
        await sql`
          update gestao_crm.mensagens_atendimento
          set status = ${update.status}, status_atualizado_em = now()
          where metadados->>'whatsapp_message_id' = ${update.messageId}
            and (
              ${update.status} = 'falha'
              or case status when 'enviado' then 1 when 'entregue' then 2 when 'lido' then 3 else 0 end
                 < case ${update.status} when 'enviado' then 1 when 'entregue' then 2 when 'lido' then 3 else 0 end
            )
        `;
      }

      return new Response(JSON.stringify({ success: true, processed: 0, statusUpdates: statusUpdates.length }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];

    for (const incoming of incomingMessages) {
      const telefoneNormalizado = normalizePhone(incoming.fromPhone);

      // Idempotencia: a Meta pode reenviar o mesmo webhook em caso de timeout.
      const [existingMessage] = await sql`
        select id from gestao_crm.mensagens_atendimento
        where metadados->>'whatsapp_message_id' = ${incoming.messageId}
        limit 1
      `;

      if (existingMessage) {
        results.push({ messageId: incoming.messageId, status: 'duplicado' });
        continue;
      }

      const [conversaExistente] = await sql`
        select id, status, contato_nome from gestao_crm.conversas_atendimento
        where telefone_normalizado = ${telefoneNormalizado}
        order by criado_em desc
        limit 1
      `;
      let conversa = conversaExistente ?? null;

      // Atualiza o nome se a conversa ainda nao tinha (ex.: primeira mensagem veio sem
      // contacts[]/pushName) ou se o WhatsApp mandou um nome diferente do que tinhamos --
      // nunca sobrescreve com null quando ja' tinhamos um nome.
      if (conversa && incoming.contactName && incoming.contactName !== conversa.contato_nome) {
        await sql`
          update gestao_crm.conversas_atendimento
          set contato_nome = ${incoming.contactName}
          where id = ${conversa.id}
        `;
        conversa = { ...conversa, contato_nome: incoming.contactName };
      }

      // Conversa encerrada do mesmo telefone e' reaberta (mesma linha/mesma thread de
      // mensagens) em vez de criar uma conversa nova -- evita duplicar o contato na lista
      // de Atendimento (uma linha por telefone, nao uma por "sessao" de atendimento).
      if (conversa && conversa.status === 'encerrada') {
        await sql`
          update gestao_crm.conversas_atendimento
          set status = 'aberta'
          where id = ${conversa.id}
        `;
        conversa = { ...conversa, status: 'aberta' };
      }

      if (!conversa) {
        // Lead tem prioridade sobre cliente: um contato que ja e' lead (oportunidade em aberto)
        // nao deve ser rebaixado a vinculo de cliente so porque o telefone tambem bateu la --
        // ver analise em apps/crm/CLAUDE.md, secao "Atendimento (WhatsApp + IA)".
        // leads/clientes guardam o telefone sem DDI (ver _shared/phone.ts) -- comparar com o
        // numero da conversa (com 55) direto nunca casava.
        const candidatos = telefoneNacionalCandidatos(telefoneNormalizado);
        const [lead] = await sql`
          select id from gestao_crm.leads
          where telefone_normalizado = any(string_to_array(${candidatos.join(',')}, ','))
          order by criado_em desc
          limit 1
        `;

        // Identidade (nome/telefone) mora em public.clientes desde a migration
        // 20260915120000_extract_public_clientes.sql -- gestao_crm.clientes_crm e' so a
        // extensao comercial (empresa, status_relacionamento etc.), sem telefone_normalizado.
        const [cliente] = lead
          ? [null]
          : await sql`
              select id from public.clientes
              where telefone_normalizado = any(string_to_array(${candidatos.join(',')}, ','))
              limit 1
            `;

        const [novaConversa] = await sql`
          insert into gestao_crm.conversas_atendimento (telefone_normalizado, lead_id, cliente_id, status, contato_nome)
          values (${telefoneNormalizado}, ${lead?.id ?? null}, ${cliente?.id ?? null}, 'aberta', ${incoming.contactName ?? null})
          returning id, status, contato_nome
        `;
        conversa = novaConversa;
      }

      let uploaded: { tipo: string; url: string; mimeType: string; nomeArquivo: string | null } | null = null;
      if (incoming.media) {
        try {
          const media = incoming.media;
          const mediaInfo =
            provider === 'meta'
              ? await downloadMediaMeta(
                  media.metaMediaId!,
                  media.mimeType,
                  media.tipo,
                  metaCredenciais!.access_token as string,
                )
              : await downloadMediaEvolution(
                  evolutionCredenciais!.instance_url as string,
                  evolutionCredenciais!.instance_name as string,
                  evolutionCredenciais!.api_key as string,
                  media.evolutionMessageKey,
                  media.mimeType,
                  media.tipo,
                  media.nomeArquivo,
                );
          uploaded = await uploadMedia(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, conversa.id, mediaInfo);
        } catch (mediaError) {
          console.error('Falha ao processar midia recebida:', getErrorMessage(mediaError));
          // Midia nao baixou -- ainda grava a mensagem (com o caption, se houver) pra nao perder
          // o evento, so sem anexo.
        }
      }

      const conteudoLocalizacao = incoming.location
        ? incoming.location.endereco || incoming.location.nome || 'Localização compartilhada'
        : null;
      const previewTexto = incoming.location
        ? `📍 Localização${incoming.location.endereco ? ` — ${incoming.location.endereco}` : incoming.location.nome ? ` — ${incoming.location.nome}` : ''}`
        : uploaded
          ? `[${uploaded.tipo === 'imagem' ? 'Imagem' : uploaded.tipo === 'audio' ? 'Áudio' : 'Documento'}]${incoming.text ? ` ${incoming.text}` : ''}`
          : incoming.text;

      await sql`
        insert into gestao_crm.mensagens_atendimento
          (conversa_id, direcao, autor, conteudo, metadados, tipo_conteudo, midia_url, midia_mime_type, midia_nome_arquivo)
        values (
          ${conversa.id},
          'entrada',
          'cliente',
          ${incoming.location ? conteudoLocalizacao : incoming.text},
          ${sql.json({
            whatsapp_message_id: incoming.messageId,
            ...(incoming.location ? { location: incoming.location } : {}),
          })},
          ${incoming.location ? 'localizacao' : (uploaded?.tipo ?? 'texto')},
          ${uploaded?.url ?? null},
          ${uploaded?.mimeType ?? null},
          ${uploaded?.nomeArquivo ?? null}
        )
      `;

      await sql`
        update gestao_crm.conversas_atendimento
        set ultima_mensagem_em = now(),
            ultima_mensagem_preview = ${truncatePreview(previewTexto)},
            nao_lida = true
        where id = ${conversa.id}
      `;

      // Conversa ja escalada para humano: nao responder automaticamente.
      if (conversa.status === 'aguardando_humano') {
        results.push({ messageId: incoming.messageId, status: 'aguardando_humano' });
        continue;
      }

      const metaToken = typeof metaCredenciais?.access_token === 'string' ? metaCredenciais.access_token.trim() : null;
      const metaPhoneNumberId =
        typeof metaCredenciais?.phone_number_id === 'string' ? metaCredenciais.phone_number_id.trim() : null;
      const canSendViaMeta = provider === 'meta' && Boolean(metaToken) && Boolean(metaPhoneNumberId);
      const canSendViaEvolution =
        provider === 'evolution' &&
        typeof evolutionCredenciais?.instance_url === 'string' &&
        typeof evolutionCredenciais?.instance_name === 'string' &&
        typeof evolutionCredenciais?.api_key === 'string';

      // Midia sem legenda (ou localizacao, que nunca tem "legenda") nao tem o que a IA responda
      // com contexto -- deixa so' registrado, igual a uma mensagem escalada (nao gera resposta
      // automatica vazia/generica).
      if ((incoming.media || incoming.location) && !incoming.text) {
        results.push({ messageId: incoming.messageId, status: incoming.location ? 'localizacao_recebida' : 'midia_sem_legenda' });
        continue;
      }

      if (!OPENAI_API_KEY || (!canSendViaMeta && !canSendViaEvolution)) {
        results.push({ messageId: incoming.messageId, status: 'recebido_sem_ia' });
        continue;
      }

      const historicoRows = await sql`
        select autor, conteudo from gestao_crm.mensagens_atendimento
        where conversa_id = ${conversa.id}
        order by criado_em asc
        limit 20
      `;

      const respostaIa = await callAi(OPENAI_API_KEY, historicoRows || []);

      let sendResult: unknown;
      if (provider === 'meta') {
        sendResult = await sendWhatsappMessageMeta(metaPhoneNumberId!, metaToken!, incoming.fromPhone, respostaIa);
      } else {
        sendResult = await sendWhatsappMessageEvolution(
          evolutionCredenciais!.instance_url as string,
          evolutionCredenciais!.instance_name as string,
          evolutionCredenciais!.api_key as string,
          incoming.fromPhone,
          respostaIa,
        );
      }
      const sentMessageId = extractWhatsappMessageId(provider, sendResult);

      await sql`
        insert into gestao_crm.mensagens_atendimento (conversa_id, direcao, autor, conteudo, metadados)
        values (
          ${conversa.id},
          'saida',
          'ia',
          ${respostaIa},
          ${sql.json(sentMessageId ? { whatsapp_message_id: sentMessageId } : {})}
        )
      `;

      await sql`
        update gestao_crm.conversas_atendimento
        set ultima_mensagem_em = now(),
            ultima_mensagem_preview = ${truncatePreview(respostaIa)},
            nao_lida = true
        where id = ${conversa.id}
      `;

      results.push({ messageId: incoming.messageId, status: 'respondido' });
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('whatsapp-api error:', error);
    return new Response(JSON.stringify({ success: false, error: getErrorMessage(error) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
