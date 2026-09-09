import { PDFDocument } from 'pdf-lib';
import { embedSignatureImage, stampSignature } from '@macom/pdf-signature';
import { financeiroApi } from '@macom/api-client/financeiroApi';
import { supabase } from '@macom/api-client/supabaseClient';

// Assina um anexo individual (nao o "PDF unico" mesclado) e substitui o arquivo original pela
// versao carimbada: mesmo padrao de path de uploadAnexo (anexoUpload.js), so que sobrescrevendo
// a linha do anexo via financeiroApi.anexos.assinar em vez de criar um novo registro.
export async function signAnexo({ anexo, signatureUrl, signerName, posicao, empresaNome }) {
  const response = await fetch(anexo.url);
  if (!response.ok) throw new Error(`Falha ao baixar "${anexo.nome_arquivo}".`);
  const bytes = await response.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  const signatureImage = await embedSignatureImage(pdfDoc, signatureUrl);
  await stampSignature(pdfDoc, { ...posicao, signatureImage, signerName, empresaNome });

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const path = `${anexo.solicitacao_id}/${anexo.tipo_anexo}/${crypto.randomUUID()}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(financeiroApi.storage.bucket)
    .upload(path, blob, { upsert: false, contentType: 'application/pdf' });
  if (uploadError) throw uploadError;

  return financeiroApi.anexos.assinar({
    id: anexo.id,
    storagePath: path,
    nomeArquivo: anexo.nome_arquivo,
    tamanhoBytes: blob.size,
    posicao,
  });
}

// Sobe o PDF unico (ja mesclado e carimbado com a assinatura em handleConfirmarPosicaoAssinatura)
// como anexo novo (tipo_anexo pdf_unificado) e registra o evento de assinatura no mesmo request
// (`assinatura` em registrar_anexo) -- antes o PDF unico so era baixado, sem deixar nenhum
// rastro na solicitacao; agora fica arquivado e auditavel como qualquer anexo assinado.
export async function persistPdfUnicoAssinado({ solicitacaoId, pdfDoc, numero, posicao }) {
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const path = `${solicitacaoId}/pdf_unificado/${crypto.randomUUID()}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(financeiroApi.storage.bucket)
    .upload(path, blob, { upsert: false, contentType: 'application/pdf' });
  if (uploadError) throw uploadError;

  return financeiroApi.anexos.registrar({
    solicitacaoId,
    tipoAnexo: 'pdf_unificado',
    nomeArquivo: `anexos-assinado-${numero || solicitacaoId}.pdf`,
    tipoMime: 'application/pdf',
    tamanhoBytes: blob.size,
    storagePath: path,
    posicaoAssinatura: posicao,
  });
}
