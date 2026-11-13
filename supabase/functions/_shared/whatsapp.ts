// Envio de mensagem de saida pelos dois provedores suportados (ver whatsapp-api/README.md).
// Compartilhado entre whatsapp-api (resposta automatica da IA) e crm-api (resposta manual do
// atendente na tela Atendimento) -- mesma logica de envio, dois pontos de entrada diferentes.

export type WhatsappProvider = 'meta' | 'evolution';

// Sem isso, um provedor que trava (sem responder nem fechar a conexao -- visto na pratica com a
// Evolution API local sob envios em sequencia rapida) deixa o fetch pendente até o timeout de
// parede da própria Edge Function, que so' entao devolve erro pro frontend (a bolha "Enviando..."
// fica presa bem mais tempo do que o necessario). Falhar rapido aqui da um erro claro e mais cedo.
const WHATSAPP_SEND_TIMEOUT_MS = 20_000;

export async function sendWhatsappMessageMeta(phoneNumberId: string, token: string, toPhone: string, text: string) {
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'text',
        text: { body: text },
      }),
      signal: AbortSignal.timeout(WHATSAPP_SEND_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('Tempo limite excedido ao enviar mensagem via WhatsApp (Meta Cloud API).');
    }
    throw error;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Falha ao enviar mensagem via WhatsApp.');
  }

  return data;
}

// Lista os templates da conta (WhatsApp Manager -> Modelos de mensagem) -- usado pra tela de
// atendimento oferecer so os ja aprovados, sem precisar codificar nome/estrutura de nenhum
// template especifico aqui (a Meta devolve o texto com os placeholders {{1}}, {{2}}... e quem
// monta os parametros a partir disso e' o chamador).
export async function listWhatsappTemplatesMeta(wabaId: string, token: string) {
  let response: Response;
  try {
    response = await fetch(
      `https://graph.facebook.com/v20.0/${wabaId}/message_templates?fields=name,language,status,category,components&limit=200`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(WHATSAPP_SEND_TIMEOUT_MS),
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('Tempo limite excedido ao buscar templates do WhatsApp (Meta Cloud API).');
    }
    throw error;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Falha ao buscar templates do WhatsApp.');
  }

  return Array.isArray(data?.data) ? data.data : [];
}

export type WhatsappTemplateComponent = {
  type: string;
  parameters?: Array<Record<string, unknown>>;
};

// Envio generico de template: nome/idioma/components vem inteiramente de quem chama (montados a
// partir do que listWhatsappTemplatesMeta devolveu + os valores digitados pelo atendente) -- esta
// funcao nao conhece nenhum template especifico, so repassa pra Meta.
export async function sendWhatsappTemplateMeta(
  phoneNumberId: string,
  token: string,
  toPhone: string,
  templateName: string,
  languageCode: string,
  components: WhatsappTemplateComponent[],
) {
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          ...(components.length ? { components } : {}),
        },
      }),
      signal: AbortSignal.timeout(WHATSAPP_SEND_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('Tempo limite excedido ao enviar template via WhatsApp (Meta Cloud API).');
    }
    throw error;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Falha ao enviar template via WhatsApp.');
  }

  return data;
}

// instanceUrl e' a base da API Evolution (ex.: http://localhost:8080, sem barra final);
// instanceName identifica a sessao/QR conectada dentro dela.
export async function sendWhatsappMessageEvolution(
  instanceUrl: string,
  instanceName: string,
  apiKey: string,
  toPhone: string,
  text: string,
) {
  const baseUrl = instanceUrl.replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ number: toPhone, text }),
      signal: AbortSignal.timeout(WHATSAPP_SEND_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('Tempo limite excedido ao enviar mensagem via Evolution API.');
    }
    throw error;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Falha ao enviar mensagem via Evolution API.');
  }

  return data;
}

// Envio de midia de saida -- card "Enviar mídia", reaproveita o mesmo bucket/upload de quem
// recebe (ver _shared/whatsappMedia.ts). Meta so aceita url publica (busca ela mesma); Evolution
// aceita url ou base64 no campo "media" -- usamos url nos dois casos, mais simples e sem
// duplicar o binario na requisicao.
export type OutgoingMediaTipo = 'imagem' | 'audio' | 'documento';

export async function sendWhatsappMediaMeta(
  phoneNumberId: string,
  token: string,
  toPhone: string,
  tipo: OutgoingMediaTipo,
  mediaUrl: string,
  nomeArquivo: string | null,
  caption: string,
) {
  const metaType = tipo === 'imagem' ? 'image' : tipo === 'audio' ? 'audio' : 'document';
  const mediaPayload: Record<string, unknown> = { link: mediaUrl };
  if (caption && metaType !== 'audio') mediaPayload.caption = caption;
  if (metaType === 'document' && nomeArquivo) mediaPayload.filename = nomeArquivo;

  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhone,
        type: metaType,
        [metaType]: mediaPayload,
      }),
      signal: AbortSignal.timeout(WHATSAPP_SEND_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('Tempo limite excedido ao enviar midia via WhatsApp (Meta Cloud API).');
    }
    throw error;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Falha ao enviar midia via WhatsApp.');
  }

  return data;
}

export async function sendWhatsappMediaEvolution(
  instanceUrl: string,
  instanceName: string,
  apiKey: string,
  toPhone: string,
  tipo: OutgoingMediaTipo,
  mediaUrl: string,
  nomeArquivo: string | null,
  caption: string,
) {
  const baseUrl = instanceUrl.replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/message/sendMedia/${instanceName}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: toPhone,
        mediatype: tipo === 'imagem' ? 'image' : tipo === 'audio' ? 'audio' : 'document',
        media: mediaUrl,
        ...(nomeArquivo ? { fileName: nomeArquivo } : {}),
        ...(caption ? { caption } : {}),
      }),
      signal: AbortSignal.timeout(WHATSAPP_SEND_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('Tempo limite excedido ao enviar midia via Evolution API.');
    }
    throw error;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Falha ao enviar midia via Evolution API.');
  }

  return data;
}

// Extrai o id da mensagem enviada do payload de resposta de cada provedor -- usado para casar
// com os eventos de status (entregue/lido) que chegam depois no webhook, ver status em
// mensagens_atendimento (migration 20261108100000_add_crm_mensagem_status.sql).
export function extractWhatsappMessageId(provider: WhatsappProvider, data: unknown): string | null {
  if (provider === 'meta') {
    const id = (data as { messages?: { id?: unknown }[] })?.messages?.[0]?.id;
    return typeof id === 'string' ? id : null;
  }

  const evolutionData = data as { key?: { id?: unknown } } | { key?: { id?: unknown } }[];
  const key = Array.isArray(evolutionData) ? evolutionData[0]?.key : evolutionData?.key;
  const id = key?.id;
  return typeof id === 'string' ? id : null;
}
