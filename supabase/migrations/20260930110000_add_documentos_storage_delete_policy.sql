-- DocumentForm (intranet) sobe o arquivo ao escolher, antes de salvar; ao trocar o arquivo ou
-- fechar o form sem salvar, o proprio client apaga o upload descartado (usePendingUpload).
-- O bucket so tinha policy de INSERT, entao o delete falhava e o arquivo ficava orfao.
-- Mesma regra do insert: quem pode editar o modulo documentos.
drop policy if exists storage_documents_delete_document_editors on storage.objects;

create policy storage_documents_delete_document_editors
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'documentos'
  and public.intranet_can_edit_module('documentos'::text)
);
