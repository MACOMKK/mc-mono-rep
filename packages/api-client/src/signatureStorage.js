import { assertSupabaseConfigured, supabase } from './supabaseClient';

// Upload direto pro bucket compartilhado 'assinaturas' -- RLS restringe cada colaborador a sua
// propria pasta (storage.foldername(name)[2] = auth.uid()::text, ver migration
// 20260831120000_add_assinatura_colaborador.sql). So a UI (SignaturePadModal, em @macom/ui) e o
// registro em public.colaboradores.assinatura_url/path (via edge function, ver
// _shared/signature.ts) variam por app -- o upload em si e' identico em qualquer app, por isso
// fica aqui em vez de duplicado em cada *Api.js.
const SIGNATURES_STORAGE_BUCKET = 'assinaturas';
const ALLOWED_SIGNATURE_IMAGE_TYPES = new Set(['image/png']);
const MAX_SIGNATURE_FILE_SIZE = 512 * 1024;

export async function uploadAssinatura(file, colaboradorId) {
  assertSupabaseConfigured();

  if (!colaboradorId) {
    throw new Error('Colaborador nao encontrado para enviar assinatura.');
  }

  if (file?.type && !ALLOWED_SIGNATURE_IMAGE_TYPES.has(file.type)) {
    throw new Error('Formato de assinatura nao suportado. Use PNG.');
  }

  if (Number.isFinite(file?.size) && file.size > MAX_SIGNATURE_FILE_SIZE) {
    throw new Error('A assinatura deve ter no maximo 512 KB.');
  }

  const filePath = `colaboradores/${colaboradorId}/${Date.now()}-${crypto.randomUUID()}.png`;
  const { error: uploadError } = await supabase.storage
    .from(SIGNATURES_STORAGE_BUCKET)
    .upload(filePath, file, { cacheControl: '3600', contentType: 'image/png', upsert: false });

  if (uploadError) {
    throw new Error(uploadError.message || 'Falha ao enviar assinatura.');
  }

  const { data } = supabase.storage.from(SIGNATURES_STORAGE_BUCKET).getPublicUrl(filePath);
  return { signatureUrl: data?.publicUrl || '', signaturePath: filePath };
}

export async function removerArquivoAssinatura(storagePath) {
  assertSupabaseConfigured();
  const normalizedPath = String(storagePath || '').trim();
  if (!normalizedPath) return true;

  const { error } = await supabase.storage.from(SIGNATURES_STORAGE_BUCKET).remove([normalizedPath]);
  if (error) {
    throw new Error(error.message || 'Falha ao remover assinatura enviada.');
  }

  return true;
}
