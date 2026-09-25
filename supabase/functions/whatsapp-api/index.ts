import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { loadIntegracaoCredenciais } from '../_shared/integracoes.ts';
import { sendWhatsappMessageMeta, sendWhatsappMessageEvolution, type WhatsappProvider } from '../_shared/whatsapp.ts';

// gestao_crm nao e' exposto via PostgREST (so acessivel por conexao direta Postgres) --
// mesmo padrao ja usado em crm-api/index.ts. Nao usar supabase-js .schema(...).from(...)
// aqui, da erro "Invalid schema: gestao_crm" (schema nao esta na lista exposta do gateway).
const databaseUrl = Deno.env.get('DATABASE_URL');
const sql = databaseUrl
  ? postgres(databaseUrl, {
      prepare: false,
      max: 3,
      idle_timeout: 5,
      connect_timeout: 15,
    })
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

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '');
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

type IncomingMessage = {
  messageId: string;
  fromPhone: string;
  text: string;
};

function extractIncomingMessagesMeta(payload: any): IncomingMessage[] {
  const messages: IncomingMessage[] = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      const waMessages = Array.isArray(value?.messages) ? value.messages : [];
      for (const message of waMessages) {
        const text = message?.text?.body;
        if (message?.id && message?.from && typeof text === 'string') {
          messages.push({ messageId: message.id, fromPhone: message.from, text });
        }
      }
    }
  }

  return messages;
}

// Formato Baileys (usado pela Evolution API): evento "messages.upsert", corpo em
// payload.data (objeto unico) ou payload.data (array), conforme a versao da instancia.
// Ignora mensagens enviadas por nos mesmos (key.fromMe) e qualquer coisa sem texto simples
// (ex.: midia, figurinha) -- fora de escopo por enquanto, so texto e' processado.
function extractIncomingMessagesEvolution(payload: any): IncomingMessage[] {
  const messages: IncomingMessage[] = [];
  if (payload?.event !== 'messages.upsert') return messages;

  const rawData = payload?.data;
  const entries = Array.isArray(rawData) ? rawData : rawData ? [rawData] : [];

  for (const entry of entries) {
    const key = entry?.key;
    if (!key?.id || !key?.remoteJid || key?.fromMe) continue;

    const text = entry?.message?.conversation ?? entry?.message?.extendedTextMessage?.text;
    if (typeof text !== 'string' || !text) continue;

    const fromPhone = String(key.remoteJid).split('@')[0];
    messages.push({ messageId: String(key.id), fromPhone, text });
  }

  return messages;
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

  const WEBHOOK_VERIFY_TOKEN = Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
  const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET');
  const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN');
  const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  // Verificacao do webhook exigida pela Meta Cloud API na configuracao inicial (a Evolution
  // API nao usa esse handshake, entao isso so importa quando o provedor ativo e' a Meta).
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token && WEBHOOK_VERIFY_TOKEN && token === WEBHOOK_VERIFY_TOKEN) {
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

    // Provedor ativo = existencia de uma integracao "whatsapp_evolution" ativa e configurada
    // no Console (Integracoes). Sem ela, mantem o comportamento de sempre (Meta Cloud API).
    const evolutionCredenciais = await loadIntegracaoCredenciais('whatsapp_evolution', {
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    });
    const provider: WhatsappProvider = evolutionCredenciais ? 'evolution' : 'meta';

    const rawBody = await req.text();

    if (provider === 'meta') {
      if (!APP_SECRET) {
        throw new Error('WHATSAPP_APP_SECRET nao configurado.');
      }
      const signatureHeader = req.headers.get('x-hub-signature-256');
      const validSignature = await verifyMetaSignature(rawBody, signatureHeader, APP_SECRET);
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

    if (incomingMessages.length === 0) {
      // Webhooks de status (entregue/lido) tambem chegam aqui; nao ha o que processar.
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
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
        select id, status from gestao_crm.conversas_atendimento
        where telefone_normalizado = ${telefoneNormalizado}
          and status <> 'encerrada'
        order by criado_em desc
        limit 1
      `;
      let conversa = conversaExistente ?? null;

      if (!conversa) {
        // Identidade (nome/telefone) mora em public.clientes desde a migration
        // 20260915120000_extract_public_clientes.sql -- gestao_crm.clientes_crm e' so a
        // extensao comercial (empresa, status_relacionamento etc.), sem telefone_normalizado.
        const [cliente] = await sql`
          select id from public.clientes
          where telefone_normalizado = ${telefoneNormalizado}
          limit 1
        `;

        const [novaConversa] = await sql`
          insert into gestao_crm.conversas_atendimento (telefone_normalizado, cliente_id, status)
          values (${telefoneNormalizado}, ${cliente?.id ?? null}, 'aberta')
          returning id, status
        `;
        conversa = novaConversa;
      }

      await sql`
        insert into gestao_crm.mensagens_atendimento (conversa_id, direcao, autor, conteudo, metadados)
        values (
          ${conversa.id},
          'entrada',
          'cliente',
          ${incoming.text},
          ${sql.json({ whatsapp_message_id: incoming.messageId })}
        )
      `;

      await sql`
        update gestao_crm.conversas_atendimento
        set ultima_mensagem_em = now(),
            ultima_mensagem_preview = ${truncatePreview(incoming.text)},
            nao_lida = true
        where id = ${conversa.id}
      `;

      // Conversa ja escalada para humano: nao responder automaticamente.
      if (conversa.status === 'aguardando_humano') {
        results.push({ messageId: incoming.messageId, status: 'aguardando_humano' });
        continue;
      }

      const canSendViaMeta = provider === 'meta' && Boolean(WHATSAPP_TOKEN) && Boolean(WHATSAPP_PHONE_NUMBER_ID);
      const canSendViaEvolution =
        provider === 'evolution' &&
        typeof evolutionCredenciais?.instance_url === 'string' &&
        typeof evolutionCredenciais?.instance_name === 'string' &&
        typeof evolutionCredenciais?.api_key === 'string';

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

      await sql`
        insert into gestao_crm.mensagens_atendimento (conversa_id, direcao, autor, conteudo)
        values (${conversa.id}, 'saida', 'ia', ${respostaIa})
      `;

      if (provider === 'meta') {
        await sendWhatsappMessageMeta(WHATSAPP_PHONE_NUMBER_ID!, WHATSAPP_TOKEN!, incoming.fromPhone, respostaIa);
      } else {
        await sendWhatsappMessageEvolution(
          evolutionCredenciais!.instance_url as string,
          evolutionCredenciais!.instance_name as string,
          evolutionCredenciais!.api_key as string,
          incoming.fromPhone,
          respostaIa,
        );
      }

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
