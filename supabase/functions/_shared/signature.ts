// Assinatura do colaborador (public.colaboradores.assinatura_url/assinatura_path) e' um dado de
// identidade compartilhado entre apps (ver migration 20260831120000_add_assinatura_colaborador.sql
// e bucket de storage 'assinaturas'). Qualquer *-api que precise permitir o cadastro/edicao dessa
// assinatura chama este helper com o proprio `sql` (postgres.js) e um client de storage com
// service role, em vez de duplicar o update + limpeza do arquivo anterior em cada Edge Function --
// mesmo espirito de `_shared/avisos.ts`/`_shared/email.ts`.

type SqlTag = (query: string, values?: unknown[]) => Promise<Array<Record<string, unknown>>>;

interface StorageClient {
  storage: {
    from(bucket: string): {
      remove(paths: string[]): Promise<{ error: { message: string } | null }>;
    };
  };
}

const SIGNATURES_STORAGE_BUCKET = 'assinaturas';

export async function updateColaboradorSignature(
  sql: SqlTag,
  storageClient: StorageClient | null,
  collaboratorId: string,
  signatureUrl: string,
  signaturePath: string,
) {
  const previousRows = await sql(
    `select assinatura_path from public.colaboradores where id = $1 limit 1;`,
    [collaboratorId],
  );

  await sql(
    `
      update public.colaboradores
      set assinatura_url = $2,
          assinatura_path = $3,
          atualizado_em = now()
      where id = $1;
    `,
    [collaboratorId, signatureUrl, signaturePath],
  );

  const previousPath = previousRows[0]?.assinatura_path as string | null | undefined;
  if (previousPath && previousPath !== signaturePath && storageClient) {
    const { error } = await storageClient.storage.from(SIGNATURES_STORAGE_BUCKET).remove([previousPath]);
    if (error) {
      console.error('Failed to delete previous signature:', { path: previousPath, message: error.message });
    }
  }

  return { signatureUrl, signaturePath };
}
