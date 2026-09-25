// Envio de mensagem de saida pelos dois provedores suportados (ver whatsapp-api/README.md).
// Compartilhado entre whatsapp-api (resposta automatica da IA) e crm-api (resposta manual do
// atendente na tela Atendimento) -- mesma logica de envio, dois pontos de entrada diferentes.

export type WhatsappProvider = 'meta' | 'evolution';

export async function sendWhatsappMessageMeta(phoneNumberId: string, token: string, toPhone: string, text: string) {
  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
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
  });

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
  const response = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ number: toPhone, text }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Falha ao enviar mensagem via Evolution API.');
  }

  return data;
}
