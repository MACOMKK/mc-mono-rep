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

const UPLOAD_TIMEOUT_MS = 30000;

// O storage.upload do supabase-js nao aceita AbortSignal/timeout -- envolve
// num Promise.race pra nao deixar a UI travada indefinidamente em rede ruim.
// Nao cancela o upload de fato em andamento no browser, so libera a UI com
// uma mensagem clara pra permitir tentar de novo.
function comTimeout(promise, timeoutMs, mensagem) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(mensagem)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

// Upload direto pro storage (RLS gated por servicos_oficina_pode_editar, ver
// migration 20260917040000) e so depois registra o metadado na avaliacao --
// mesmo padrao de uploadAnexo (anexoUpload.js) no Financeiro.
// Apaga um upload que nunca vai ser registrado (evita foto orfa no bucket); falha na limpeza
// e so logada pra nao mascarar o erro original.
async function descartarUpload(path) {
  const { error } = await supabase.storage.from(oficinaApi.storage.bucket).remove([path]);
  if (error) console.error('Falha ao descartar foto orfa:', { path, message: error.message });
}

export async function uploadChecklistFoto({ file, avaliacaoId, categoria, legenda, avariaId }) {
  const extension = file.name.split('.').pop();
  const path = `${avaliacaoId}/${crypto.randomUUID()}.${extension}`;
  const upload = supabase.storage.from(oficinaApi.storage.bucket).upload(path, file, { upsert: false, contentType: file.type });
  let uploadError;
  try {
    ({ error: uploadError } = await comTimeout(
      upload,
      UPLOAD_TIMEOUT_MS,
      'Envio da foto demorou demais. Verifique sua internet e tente novamente.',
    ));
  } catch (error) {
    // Timeout so libera a UI -- o upload segue em background e, se terminar, ninguem registra.
    upload.then(({ error: lateError }) => { if (!lateError) descartarUpload(path); }, () => {});
    throw error;
  }
  if (uploadError) throw uploadError;

  try {
    const { url } = await oficinaApi.fotos.registrar(avaliacaoId, { storagePath: path, categoria, legenda, avariaId });
    return { storage_path: path, categoria, legenda: legenda || null, avaria_id: avariaId || null, url };
  } catch (error) {
    await descartarUpload(path);
    throw error;
  }
}
