// Download de mídia recebida via webhook (Meta ou Evolution) e upload no bucket
// crm-atendimento-midia (ver migration 20261109120000_add_crm_atendimento_midia.sql).
// Formato do payload de mídia da Evolution foi revalidado em 2026-11-09 via instância real
// (chat teste): quando a instância está com webhookBase64 desligado (padrão), a Evolution não
// embute o binário no próprio evento messages.upsert -- é preciso chamar
// POST /chat/getBase64FromMediaMessage/{instance} com { message: { key } } pra obter o base64.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export type MediaTipo = 'imagem' | 'audio' | 'documento';

export type MediaInfo = {
  tipo: MediaTipo;
  mimeType: string;
  nomeArquivo: string | null;
  bytes: Uint8Array;
};

export type UploadedMedia = {
  tipo: MediaTipo;
  url: string;
  mimeType: string;
  nomeArquivo: string | null;
};

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
};

function extensionFor(mimeType: string, nomeArquivo: string | null) {
  if (nomeArquivo && nomeArquivo.includes('.')) return nomeArquivo.split('.').pop()!;
  return EXT_BY_MIME[mimeType] || 'bin';
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- Meta Cloud API -------------------------------------------------------
// Fluxo oficial em duas etapas: GET /{media-id} devolve a url temporaria assinada, depois GET
// nessa url (com o mesmo Bearer token) devolve o binario.
export async function downloadMediaMeta(
  mediaId: string,
  mimeType: string,
  tipo: MediaTipo,
  token: string,
): Promise<MediaInfo> {
  const metaResponse = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const metaData = await metaResponse.json();
  if (!metaResponse.ok || !metaData?.url) {
    throw new Error(metaData?.error?.message || 'Falha ao resolver url da midia (Meta).');
  }

  const fileResponse = await fetch(metaData.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!fileResponse.ok) {
    throw new Error('Falha ao baixar midia (Meta).');
  }
  const bytes = new Uint8Array(await fileResponse.arrayBuffer());

  return { tipo, mimeType, nomeArquivo: null, bytes };
}

// --- Evolution API ---------------------------------------------------------
export async function downloadMediaEvolution(
  instanceUrl: string,
  instanceName: string,
  apiKey: string,
  messageKey: unknown,
  mimeType: string,
  tipo: MediaTipo,
  nomeArquivo: string | null,
): Promise<MediaInfo> {
  const baseUrl = instanceUrl.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { key: messageKey } }),
  });
  const data = await response.json();
  if (!response.ok || typeof data?.base64 !== 'string') {
    throw new Error(data?.message || data?.error || 'Falha ao baixar midia (Evolution).');
  }

  return { tipo, mimeType, nomeArquivo, bytes: base64ToBytes(data.base64) };
}

// --- Upload compartilhado ---------------------------------------------------
export async function uploadMedia(
  supabaseUrl: string,
  serviceRoleKey: string,
  conversaId: string,
  media: MediaInfo,
): Promise<UploadedMedia> {
  const client = createClient(supabaseUrl, serviceRoleKey);
  const ext = extensionFor(media.mimeType, media.nomeArquivo);
  const path = `${conversaId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await client.storage
    .from('crm-atendimento-midia')
    .upload(path, media.bytes, { contentType: media.mimeType, upsert: false });
  if (error) {
    throw new Error(`Falha ao salvar midia no Storage: ${error.message}`);
  }

  const { data } = client.storage.from('crm-atendimento-midia').getPublicUrl(path);

  return { tipo: media.tipo, url: data.publicUrl, mimeType: media.mimeType, nomeArquivo: media.nomeArquivo };
}
