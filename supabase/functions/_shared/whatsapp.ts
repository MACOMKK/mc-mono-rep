// Envio de mensagem de saida pelos dois provedores suportados (ver whatsapp-api/README.md).
// Compartilhado entre whatsapp-api (resposta automatica da IA) e crm-api (resposta manual do
// atendente na tela Atendimento) -- mesma logica de envio, dois pontos de entrada diferentes.

export type WhatsappProvider = 'meta' | 'evolution';

// Sem isso, um provedor que trava (sem responder nem fechar a conexao -- visto na pratica com a
// Evolution API local sob envios em sequencia rapida) deixa o fetch pendente até o timeout de
// parede da própria Edge Function, que so' entao devolve erro pro frontend (a bolha "Enviando..."
// fica presa bem mais tempo do que o necessario). Falhar rapido aqui da um erro claro e mais cedo.
const WHATSAPP_SEND_TIMEOUT_MS = 20_000;

// Checagem ativa de conexao -- diferente de so' ver se a integracao tem credenciais cadastradas
// (isso so diz "configurada", nao "funcionando agora"). Usado pelo selo Conectado/Desconectado
// na tela de Atendimento. Timeout curto proposital: e' so' um ping, nao pode travar a tela.
const WHATSAPP_STATUS_TIMEOUT_MS = 8_000;

export async function checkWhatsappConnectionMeta(phoneNumberId: string, token: string): Promise<boolean> {
  if (!phoneNumberId || !token) return false;
  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}?fields=id`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(WHATSAPP_STATUS_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function checkWhatsappConnectionEvolution(
  instanceUrl: string,
  instanceName: string,
  apiKey: string,
): Promise<boolean> {
  if (!instanceUrl || !instanceName || !apiKey) return false;
  try {
    const baseUrl = instanceUrl.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/instance/connectionState/${instanceName}`, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(WHATSAPP_STATUS_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const data = await response.json();
    const state = data?.instance?.state ?? data?.state;
    return state === 'open';
  } catch {
    return false;
  }
}

// contextMessageId (opcional): wamid da mensagem sendo respondida (botao "Responder" no chat do
// Atendimento) -- a Meta usa isso pra mostrar a citacao nativa no WhatsApp do cliente, igual a
// um reply normal. So funciona com o wamid de uma mensagem da mesma conversa (ver
// send_atendimento_mensagem em crm-api/index.ts, que resolve esse id antes de chamar aqui).
export async function sendWhatsappMessageMeta(
  phoneNumberId: string,
  token: string,
  toPhone: string,
  text: string,
  contextMessageId?: string | null,
) {
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
        ...(contextMessageId ? { context: { message_id: contextMessageId } } : {}),
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
  contextMessageId?: string | null,
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
        ...(contextMessageId ? { context: { message_id: contextMessageId } } : {}),
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
  contextMessageId?: string | null,
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
        ...(contextMessageId ? { context: { message_id: contextMessageId } } : {}),
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

// Envio de localizacao real (coordenadas) -- botao "Enviar localizacao" do composer (ex.: mandar
// o endereco da loja pro cliente). name/address sao opcionais na Meta, mas a Evolution exige os
// dois no payload (ver docs.evolution-api.com/.../send-location) -- o chamador sempre preenche
// pelo menos um fallback antes de chegar aqui.
export async function sendWhatsappLocationMeta(
  phoneNumberId: string,
  token: string,
  toPhone: string,
  latitude: number,
  longitude: number,
  name: string,
  address: string,
  contextMessageId?: string | null,
) {
  const locationPayload: Record<string, unknown> = { latitude, longitude };
  if (name) locationPayload.name = name;
  if (address) locationPayload.address = address;

  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'location',
        location: locationPayload,
        ...(contextMessageId ? { context: { message_id: contextMessageId } } : {}),
      }),
      signal: AbortSignal.timeout(WHATSAPP_SEND_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('Tempo limite excedido ao enviar localizacao via WhatsApp (Meta Cloud API).');
    }
    throw error;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Falha ao enviar localizacao via WhatsApp.');
  }

  return data;
}

export async function sendWhatsappLocationEvolution(
  instanceUrl: string,
  instanceName: string,
  apiKey: string,
  toPhone: string,
  latitude: number,
  longitude: number,
  name: string,
  address: string,
) {
  const baseUrl = instanceUrl.replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/message/sendLocation/${instanceName}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: toPhone,
        name: name || 'Localização',
        address: address || '',
        latitude,
        longitude,
      }),
      signal: AbortSignal.timeout(WHATSAPP_SEND_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('Tempo limite excedido ao enviar localizacao via Evolution API.');
    }
    throw error;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Falha ao enviar localizacao via Evolution API.');
  }

  return data;
}

// Solicita que o CLIENTE compartilhe a localizacao dele (botao "Solicitar localizacao" do
// composer) -- mensagem interativa "location_request_message", recurso exclusivo da Meta Cloud
// API (Baileys/Evolution nao tem esse tipo de mensagem, so' envia localizacao, nunca pede).
export async function sendWhatsappLocationRequestMeta(
  phoneNumberId: string,
  token: string,
  toPhone: string,
  bodyText: string,
  contextMessageId?: string | null,
) {
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'interactive',
        interactive: {
          type: 'location_request_message',
          body: { text: bodyText },
          action: { name: 'send_location' },
        },
        ...(contextMessageId ? { context: { message_id: contextMessageId } } : {}),
      }),
      signal: AbortSignal.timeout(WHATSAPP_SEND_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('Tempo limite excedido ao solicitar localizacao via WhatsApp (Meta Cloud API).');
    }
    throw error;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Falha ao solicitar localizacao via WhatsApp.');
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
