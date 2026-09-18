import { oficinaApi } from '@macom/api-client/oficinaApi';
import { supabase } from '@macom/api-client/supabaseClient';

export const MAX_CHECKLIST_FOTO_SIZE = 8 * 1024 * 1024;

export const ALLOWED_CHECKLIST_FOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function isAllowedChecklistFotoMimeType(file) {
  return ALLOWED_CHECKLIST_FOTO_MIME_TYPES.includes(file.type);
}

// Upload direto pro storage (RLS gated por servicos_oficina_pode_editar, ver
// migration 20260917040000) e so depois registra o metadado na avaliacao --
// mesmo padrao de uploadAnexo (anexoUpload.js) no Financeiro.
export async function uploadChecklistFoto({ file, avaliacaoId, categoria, legenda }) {
  const extension = file.name.split('.').pop();
  const path = `${avaliacaoId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(oficinaApi.storage.bucket)
    .upload(path, file, { upsert: false, contentType: file.type });
  if (uploadError) throw uploadError;

  const { url } = await oficinaApi.fotos.registrar(avaliacaoId, { storagePath: path, categoria, legenda });
  return { storage_path: path, categoria, legenda: legenda || null, url };
}
