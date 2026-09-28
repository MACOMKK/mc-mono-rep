import { oficinaApi } from '@macom/api-client/oficinaApi';
import { supabase } from '@macom/api-client/supabaseClient';

export const MAX_CHECKLIST_FOTO_SIZE = 8 * 1024 * 1024;

export const ALLOWED_CHECKLIST_FOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function isAllowedChecklistFotoMimeType(file) {
  return ALLOWED_CHECKLIST_FOTO_MIME_TYPES.includes(file.type);
}

// Redimensiona/comprime antes do upload -- compartilhado entre o grid de
// fotos (FotoUploadGrid.jsx) e o fluxo de foto de amassado (AvariaMap.jsx).
export async function comprimirChecklistFoto(file, maxDimensao = 1600, qualidade = 0.8) {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, maxDimensao / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0, largura, altura);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', qualidade));
  return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
}

// Upload direto pro storage (RLS gated por servicos_oficina_pode_editar, ver
// migration 20260917040000) e so depois registra o metadado na avaliacao --
// mesmo padrao de uploadAnexo (anexoUpload.js) no Financeiro.
export async function uploadChecklistFoto({ file, avaliacaoId, categoria, legenda, avariaId }) {
  const extension = file.name.split('.').pop();
  const path = `${avaliacaoId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(oficinaApi.storage.bucket)
    .upload(path, file, { upsert: false, contentType: file.type });
  if (uploadError) throw uploadError;

  const { url } = await oficinaApi.fotos.registrar(avaliacaoId, { storagePath: path, categoria, legenda, avariaId });
  return { storage_path: path, categoria, legenda: legenda || null, avaria_id: avariaId || null, url };
}
