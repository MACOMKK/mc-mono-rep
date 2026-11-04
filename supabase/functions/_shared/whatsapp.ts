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
